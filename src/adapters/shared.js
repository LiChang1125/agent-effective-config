import path from 'node:path';
import { findExecutable, readJson, runReadOnly } from '../files.js';

export const CLAUDE_HOOK_EVENTS = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'PostToolUseFailure', 'Notification', 'SubagentStart',
  'SubagentStop', 'Stop', 'TeammateIdle', 'TaskCompleted', 'ConfigChange',
  'WorktreeCreate', 'WorktreeRemove', 'PreCompact', 'SessionEnd',
]);

export function settingsSources(filePath, priority, sourceFactory, options = {}) {
  const parsed = readJson(filePath);
  if (!parsed.ok) {
    return [sourceFactory(filePath, 'permission', priority, { invalid: parsed.error })];
  }
  const value = parsed.value || {};
  const result = [];
  if (value.permissions) {
    result.push(sourceFactory(filePath, 'permission', priority, {
      shadowGroup: options.permissionGroup,
    }));
  }
  if (value.hooks) {
    const events = Object.keys(value.hooks);
    result.push(sourceFactory(filePath, 'hook', priority, {
      shadowGroup: options.hookGroup,
      unsupportedEvents: options.allowedHookEvents
        ? events.filter((event) => !options.allowedHookEvents.has(event))
        : [],
    }));
  }
  return result;
}

export function mcpJsonSource(filePath, priority, sourceFactory, shadowGroup) {
  const parsed = readJson(filePath);
  if (!parsed.ok) return sourceFactory(filePath, 'mcp', priority, { invalid: parsed.error, shadowGroup });
  const servers = parsed.value?.mcpServers || parsed.value?.servers || {};
  const names = Object.keys(servers);
  const commands = names
    .map((name) => servers[name]?.command)
    .filter((command) => typeof command === 'string' && command.length > 0);
  return sourceFactory(filePath, 'mcp', priority, {
    serverNames: names,
    missingExecutables: commands.filter((command) => !findExecutable(command)),
    shadowGroup,
  });
}

export function probeMcpList(command, args, cwd, source) {
  const run = runReadOnly(command, args, cwd, 10000);
  if (run.missing) return { visible: null, evidence: `${command} is not installed; MCP runtime metadata unavailable.` };
  if (!run.ok) return { visible: null, evidence: `${command} MCP listing failed without changing configuration.` };
  const names = source.metadata.serverNames || [];
  if (!names.length) return { visible: null, evidence: 'The MCP file contains no server declarations.' };
  const combined = `${run.stdout}\n${run.stderr}`;
  const missing = names.filter((name) => !combined.includes(name));
  if (missing.length) return { visible: false, evidence: `Runtime MCP list omitted: ${missing.join(', ')}` };
  return { visible: true, followed: true, evidence: `Runtime MCP list reported: ${names.join(', ')}` };
}

export function commandFromTomlSection(text, sectionName) {
  let active = false;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      active = header[1].replace(/^['"]|['"]$/g, '') === sectionName;
      continue;
    }
    if (!active) continue;
    const command = line.match(/^\s*command\s*=\s*["']([^"']+)["']/);
    if (command) return command[1];
  }
  return null;
}

export function rootRelativePriority(root, directory, base = 40) {
  const depth = path.relative(root, directory).split(path.sep).filter(Boolean).length;
  return base + depth * 10;
}
