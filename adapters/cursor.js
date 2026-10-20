import path from 'node:path';
import {
  directoriesFromRoot, exists, gitRoot, homePath, listFiles,
  listSkillManifests, readJson, uniqueSources,
} from '../src/files.js';
import { AgentAdapter, applyShadowGroups, classifySource, source } from './contract.js';
import { mcpJsonSource, probeMcpList, rootRelativePriority } from './shared.js';

export class CursorAdapter extends AgentAdapter {
  constructor() {
    super('cursor', ['configuration profile: official docs 2026-10-20']);
    this.command = 'cursor-agent';
  }

  async discoverConfigs(cwd) {
    const root = gitRoot(cwd);
    const directories = directoriesFromRoot(root, cwd);
    const sources = [];
    for (const directory of directories) {
      const priority = rootRelativePriority(root, directory, 40);
      for (const name of ['AGENTS.md', 'CLAUDE.md', '.cursorrules']) {
        const candidate = path.join(directory, name);
        if (exists(candidate)) sources.push(source(candidate, 'instruction', priority));
      }
      for (const ruleFile of listFiles(path.join(directory, '.cursor', 'rules'), (name) => /\.(mdc|md)$/i.test(name))) {
        sources.push(source(ruleFile, 'instruction', priority + 5));
      }
      for (const manifest of listSkillManifests(path.join(directory, '.cursor', 'skills'))) {
        sources.push(source(manifest, 'skill', priority + 4));
      }
      const mcpPath = path.join(directory, '.cursor', 'mcp.json');
      if (exists(mcpPath)) sources.push(mcpJsonSource(mcpPath, priority + 3, source, `cursor-mcp:${directory}`));
      const hooksPath = path.join(directory, '.cursor', 'hooks.json');
      if (exists(hooksPath)) {
        const parsed = readJson(hooksPath);
        sources.push(source(hooksPath, 'hook', priority + 3, parsed.ok ? {} : { invalid: parsed.error }));
      }
    }
    const globalMcp = homePath('.cursor', 'mcp.json');
    if (exists(globalMcp)) sources.push(mcpJsonSource(globalMcp, 15, source, 'cursor-mcp:user'));
    for (const manifest of listSkillManifests(homePath('.cursor', 'skills'))) {
      sources.push(source(manifest, 'skill', 12));
    }
    return applyShadowGroups(uniqueSources(sources));
  }

  async probeVisibility(configSource, options) {
    if (configSource.metadata.invalid || configSource.shadowedBy) {
      return { visible: false, evidence: configSource.metadata.invalid || 'Higher-priority Cursor source selected.' };
    }
    if (configSource.kind === 'mcp' && options.probe) {
      return probeMcpList('cursor-agent', ['mcp', 'list'], options.cwd, configSource);
    }
    return { visible: null, evidence: 'Cursor recognizes this declaration path, but does not expose a zero-write visibility receipt for it.' };
  }

  async runCanary(configSource, _kind, options) {
    return classifySource(this, configSource, options);
  }
}
