import path from 'node:path';
import {
  directoriesFromRoot, exists, findExecutable, gitRoot, homePath, listSkillManifests,
  readJson, runReadOnly, uniqueSources,
} from '../files.js';
import { AgentAdapter, applyShadowGroups, canaryPrompt, classifySource, source } from './contract.js';
import { CLAUDE_HOOK_EVENTS, mcpJsonSource, probeMcpList, rootRelativePriority, settingsSources } from './shared.js';

export class ClaudeCodeAdapter extends AgentAdapter {
  constructor() {
    super('claude-code', ['configuration profile: official docs 2026-10-20']);
    this.command = 'claude';
  }

  async discoverConfigs(cwd) {
    const root = gitRoot(cwd);
    const directories = directoriesFromRoot(root, cwd);
    const sources = [];
    const addInstruction = (filePath, priority, metadata = {}) => {
      if (exists(filePath)) sources.push(source(filePath, 'instruction', priority, metadata));
    };

    addInstruction(homePath('.claude', 'CLAUDE.md'), 10);
    for (const directory of directories) {
      const priority = rootRelativePriority(root, directory, 40);
      addInstruction(path.join(directory, 'CLAUDE.md'), priority);
      addInstruction(path.join(directory, 'CLAUDE.local.md'), priority + 5);
      for (const manifest of listSkillManifests(path.join(directory, '.claude', 'skills'))) {
        sources.push(source(manifest, 'skill', priority + 2));
      }
      for (const settingsName of ['settings.json', 'settings.local.json']) {
        const settingsPath = path.join(directory, '.claude', settingsName);
        if (!exists(settingsPath)) continue;
        const localBoost = settingsName.includes('.local.') ? 5 : 0;
        sources.push(...settingsSources(settingsPath, priority + localBoost, source, {
          permissionGroup: `claude-settings:permission:${directory}`,
          hookGroup: `claude-settings:hook:${directory}`,
          allowedHookEvents: CLAUDE_HOOK_EVENTS,
        }));
      }
    }

    for (const manifest of listSkillManifests(homePath('.claude', 'skills'))) {
      sources.push(source(manifest, 'skill', 12));
    }
    const userSettings = homePath('.claude', 'settings.json');
    if (exists(userSettings)) {
      sources.push(...settingsSources(userSettings, 15, source, {
        permissionGroup: 'claude-settings:permission:user',
        hookGroup: 'claude-settings:hook:user',
        allowedHookEvents: CLAUDE_HOOK_EVENTS,
      }));
    }

    const managedSettings = process.platform === 'darwin'
      ? '/Library/Application Support/ClaudeCode/managed-settings.json'
      : '/etc/claude-code/managed-settings.json';
    if (exists(managedSettings)) {
      sources.push(...settingsSources(managedSettings, 100, source, {
        permissionGroup: 'claude-settings:permission:managed',
        hookGroup: 'claude-settings:hook:managed',
        allowedHookEvents: CLAUDE_HOOK_EVENTS,
      }));
    }

    const projectMcp = path.join(root, '.mcp.json');
    if (exists(projectMcp)) sources.push(mcpJsonSource(projectMcp, 55, source, 'claude-mcp:project'));

    const userStatePath = homePath('.claude.json');
    if (exists(userStatePath)) {
      const parsed = readJson(userStatePath);
      if (!parsed.ok) {
        sources.push(source(userStatePath, 'mcp', 20, { invalid: parsed.error }));
      } else {
        const projectState = parsed.value?.projects?.[path.resolve(cwd)] || {};
        const servers = projectState.mcpServers || parsed.value?.mcpServers || {};
        const names = Object.keys(servers);
        if (names.length) {
          const commands = names.map((name) => servers[name]?.command).filter((value) => typeof value === 'string');
          sources.push(source(userStatePath, 'mcp', 20, {
            serverNames: names,
            missingExecutables: commands.filter((command) => !findExecutable(command)),
          }));
        }
      }
    }

    const localClaude = [...directories].reverse()
      .map((directory) => path.join(directory, 'CLAUDE.local.md'))
      .find(exists);
    for (const directory of directories) {
      const agents = path.join(directory, 'AGENTS.md');
      if (exists(agents)) {
        const candidate = source(agents, 'instruction', rootRelativePriority(root, directory, 30), {
          unsupported: 'Claude Code does not declare AGENTS.md as a memory file.',
        });
        if (localClaude) candidate.shadowedBy = localClaude;
        sources.push(candidate);
      }
    }
    return applyShadowGroups(uniqueSources(sources));
  }

  async probeVisibility(configSource, options) {
    if (configSource.metadata.invalid || configSource.metadata.unsupported || configSource.shadowedBy) {
      return { visible: false, evidence: configSource.metadata.invalid || configSource.metadata.unsupported || 'Higher-priority source selected.' };
    }
    if (configSource.kind === 'mcp' && options.probe) {
      return probeMcpList('claude', ['mcp', 'list'], options.cwd, configSource);
    }
    return { visible: null, evidence: 'The declaration path is recognized, but path recognition alone is not runtime proof.' };
  }

  async runCanary(configSource, _kind, options) {
    return classifySource(this, configSource, options);
  }

  async executeInstructionCanary(configSource, options) {
    const token = configSource.metadata.canary;
    const run = runReadOnly('claude', [
      '-p', canaryPrompt(token), '--permission-mode', 'plan', '--max-turns', '1', '--output-format', 'text',
    ], options.cwd, 60000);
    if (!run.ok) return { visible: null, evidence: run.missing ? 'Claude Code is not installed.' : 'Claude Code canary did not complete.' };
    const matched = run.stdout.trim().includes(token);
    if (matched) return { visible: true, followed: true, evidence: `Claude Code returned the traceable canary ${token}.` };
    return { visible: null, evidence: 'Claude Code responded, but a canary miss does not prove the source was absent.' };
  }
}
