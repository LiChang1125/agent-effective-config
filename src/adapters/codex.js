import path from 'node:path';
import {
  directoriesFromRoot, exists, findExecutable, gitRoot, homePath,
  listFiles, listSkillManifests, readText, runReadOnly, uniqueSources,
} from '../files.js';
import { AgentAdapter, applyShadowGroups, canaryPrompt, classifySource, source } from './contract.js';
import { commandFromTomlSection, probeMcpList, rootRelativePriority } from './shared.js';

function tomlSources(filePath, priority) {
  const parsed = readText(filePath);
  if (!parsed.ok) return [source(filePath, 'permission', priority, { invalid: parsed.error })];
  const text = parsed.value;
  const results = [];
  if (/^\s*(approval_policy|sandbox_mode|network_access|writable_roots)\s*=/m.test(text)) {
    results.push(source(filePath, 'permission', priority, { shadowGroup: 'codex-config:permission' }));
  }
  const names = [...text.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm)].map((match) => match[1].replace(/^['"]|['"]$/g, ''));
  if (names.length) {
    const commands = names.map((name) => commandFromTomlSection(text, `mcp_servers.${name}`)).filter(Boolean);
    results.push(source(filePath, 'mcp', priority, {
      serverNames: names,
      missingExecutables: commands.filter((command) => !findExecutable(command)),
      shadowGroup: 'codex-config:mcp',
    }));
  }
  if (/^\s*\[(hooks|notify)(\.|\])/m.test(text) || /^\s*notify\s*=/m.test(text)) {
    results.push(source(filePath, 'hook', priority, { shadowGroup: 'codex-config:hook' }));
  }
  return results;
}

function fallbackNames(configPath) {
  const parsed = readText(configPath);
  if (!parsed.ok) return [];
  const value = parsed.value.match(/^\s*project_doc_fallback_filenames\s*=\s*\[([^\]]*)\]/m)?.[1] || '';
  return [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

export class CodexAdapter extends AgentAdapter {
  constructor() {
    super('codex', ['codex-cli 0.163.0-alpha.10.2']);
    this.command = 'codex';
  }

  async discoverConfigs(cwd) {
    const root = gitRoot(cwd);
    const directories = directoriesFromRoot(root, cwd);
    const sources = [];
    const userConfig = homePath('.codex', 'config.toml');
    const fallbacks = exists(userConfig) ? fallbackNames(userConfig) : [];
    const addAgentsPair = (directory, priority) => {
      const normal = path.join(directory, 'AGENTS.md');
      const override = path.join(directory, 'AGENTS.override.md');
      if (exists(normal)) sources.push(source(normal, 'instruction', priority, { shadowGroup: `codex-agents:${directory}` }));
      if (exists(override)) sources.push(source(override, 'instruction', priority + 5, { shadowGroup: `codex-agents:${directory}` }));
      if (!exists(normal) && !exists(override)) {
        for (const name of fallbacks) {
          const candidate = path.join(directory, name);
          if (exists(candidate)) {
            sources.push(source(candidate, 'instruction', priority, { shadowGroup: `codex-agents:${directory}` }));
            break;
          }
        }
      }
    };

    addAgentsPair(homePath('.codex'), 10);
    for (const directory of directories) {
      const priority = rootRelativePriority(root, directory, 40);
      addAgentsPair(directory, priority);
      for (const skillRoot of [path.join(directory, '.codex', 'skills'), path.join(directory, '.agents', 'skills')]) {
        for (const manifest of listSkillManifests(skillRoot)) sources.push(source(manifest, 'skill', priority + 2));
      }
      for (const ruleFile of listFiles(path.join(directory, '.codex', 'rules'), (name) => name.endsWith('.rules'))) {
        sources.push(source(ruleFile, 'permission', priority + 3));
      }
      const projectConfig = path.join(directory, '.codex', 'config.toml');
      if (exists(projectConfig)) sources.push(...tomlSources(projectConfig, priority));
    }
    for (const skillRoot of [homePath('.codex', 'skills'), homePath('.agents', 'skills')]) {
      for (const manifest of listSkillManifests(skillRoot)) sources.push(source(manifest, 'skill', 12));
    }
    for (const ruleFile of listFiles(homePath('.codex', 'rules'), (name) => name.endsWith('.rules'))) {
      sources.push(source(ruleFile, 'permission', 14));
    }
    if (exists(userConfig)) sources.push(...tomlSources(userConfig, 15));
    return applyShadowGroups(uniqueSources(sources));
  }

  async probeVisibility(configSource, options) {
    if (configSource.metadata.invalid || configSource.shadowedBy) {
      return { visible: false, evidence: configSource.metadata.invalid || 'AGENTS.override.md replaced AGENTS.md in the same directory.' };
    }
    if (configSource.kind === 'mcp' && options.probe) {
      return probeMcpList('codex', ['mcp', 'list'], options.cwd, configSource);
    }
    return { visible: null, evidence: 'Codex recognizes this source path; no runtime visibility receipt was available.' };
  }

  async runCanary(configSource, _kind, options) {
    return classifySource(this, configSource, options);
  }

  async executeInstructionCanary(configSource, options) {
    const token = configSource.metadata.canary;
    const run = runReadOnly('codex', [
      'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '-C', options.cwd,
      canaryPrompt(token),
    ], options.cwd, 90000);
    if (!run.ok) return { visible: null, evidence: run.missing ? 'Codex is not installed.' : 'Codex canary did not complete.' };
    if (run.stdout.includes(token)) return { visible: true, followed: true, evidence: `Codex returned the traceable canary ${token}.` };
    return { visible: null, evidence: 'Codex responded, but a canary miss does not establish whether the source was loaded.' };
  }
}
