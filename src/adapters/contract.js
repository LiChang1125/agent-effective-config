import { STATUSES } from '../constants.js';
import { firstCanary, runReadOnly } from '../files.js';

export class AgentAdapter {
  constructor(name, testedVersions) {
    this.name = name;
    this.testedVersions = testedVersions;
  }

  async discoverConfigs() {
    throw new Error('discoverConfigs must be implemented by the adapter');
  }

  async probeVisibility() {
    throw new Error('probeVisibility must be implemented by the adapter');
  }

  async runCanary() {
    throw new Error('runCanary must be implemented by the adapter');
  }

  async agentVersion(cwd) {
    const result = runReadOnly(this.command, ['--version'], cwd, 3000);
    if (!result.ok) return 'not installed';
    return result.stdout.trim().split(/\r?\n/)[0] || 'unknown';
  }
}

export function source(filePath, kind, priority, metadata = {}) {
  return {
    path: filePath,
    kind,
    priority,
    metadata: { ...metadata, canary: metadata.canary ?? firstCanary(filePath) },
  };
}

export function applyShadowGroups(sources) {
  const winners = new Map();
  for (const item of [...sources].sort((left, right) => right.priority - left.priority)) {
    const group = item.metadata.shadowGroup;
    if (!group) continue;
    if (!winners.has(group)) winners.set(group, item.path);
    else if (winners.get(group) !== item.path) item.shadowedBy = winners.get(group);
  }
  return sources.sort((left, right) => right.priority - left.priority || left.path.localeCompare(right.path));
}

function result(status, evidence, reason) {
  return { status, evidence, reason };
}

export async function classifySource(adapter, configSource, options) {
  const visibility = options.visibility || {};
  if (configSource.metadata.invalid) {
    return result(STATUSES.NOT_LOADED, configSource.metadata.invalid, 'The agent cannot load an invalid configuration file.');
  }
  if (configSource.metadata.unsupported) {
    return result(STATUSES.NOT_LOADED, configSource.metadata.unsupported, 'This path is not an instruction source for the selected agent.');
  }
  if (configSource.shadowedBy) {
    return result(STATUSES.NOT_LOADED, `A higher-priority source wins the same configuration scope.`, 'The declaration is shadowed before the agent can apply it.');
  }
  if (configSource.metadata.missingExecutables?.length) {
    return result(
      STATUSES.NOT_LOADED,
      `Executable not found on PATH: ${configSource.metadata.missingExecutables.join(', ')}`,
      'The declared MCP server cannot start, so it cannot become visible to the agent.',
    );
  }
  if (configSource.metadata.unsupportedEvents?.length) {
    return result(
      STATUSES.NOT_LOADED,
      `Unsupported hook event: ${configSource.metadata.unsupportedEvents.join(', ')}`,
      'The agent never registers hooks for unknown lifecycle events.',
    );
  }
  if (visibility.visible === true) {
    if (visibility.followed === false) {
      return result(STATUSES.UNFOLLOWED, visibility.evidence, 'The source was visible, but the sampled model response did not follow its canary.');
    }
    return result(STATUSES.EFFECTIVE, visibility.evidence, 'The source was observed in the agent runtime and its canary matched.');
  }
  if (visibility.visible === false) {
    return result(STATUSES.NOT_LOADED, visibility.evidence, 'A runtime or deterministic path probe confirmed that the source is not visible.');
  }
  if (configSource.kind === 'permission') {
    return result(STATUSES.UNVERIFIED, visibility.evidence || 'No permission-gated operation was attempted.', 'Permission behavior is operation-specific and is not inferred from static configuration.');
  }
  if (!options.probe) {
    return result(STATUSES.UNVERIFIED, 'Declaration discovered; live probes were not requested.', 'Run with --probe to use safe runtime metadata and embedded canaries where supported.');
  }
  if (!configSource.metadata.canary || !['instruction', 'skill'].includes(configSource.kind)) {
    return result(
      STATUSES.UNVERIFIED,
      visibility.evidence || 'No zero-write runtime observation was available.',
      ['instruction', 'skill'].includes(configSource.kind)
        ? 'Add an AEC_CANARY marker to this config to enable an opt-in adherence probe without modifying the repository.'
        : 'This adapter cannot safely trigger this declaration without a task-specific operation.',
    );
  }

  const runner = options.runner || adapter.executeInstructionCanary?.bind(adapter);
  if (!runner) {
    return result(STATUSES.UNVERIFIED, 'The adapter has no safe read-only instruction runner.', 'A canary exists, but executing it would cross the adapter safety boundary.');
  }
  const observed = await runner(configSource, options);
  if (observed.visible === true && observed.followed === true) {
    return result(STATUSES.EFFECTIVE, observed.evidence, 'Canary matched and the source is traceable.');
  }
  if (observed.visible === true && observed.followed === false) {
    return result(STATUSES.UNFOLLOWED, observed.evidence, 'The source was loaded, but this sample did not follow the canary; repeat samples before drawing conclusions.');
  }
  if (observed.visible === false) {
    return result(STATUSES.NOT_LOADED, observed.evidence, 'The runtime probe confirmed that the source was not loaded.');
  }
  return result(STATUSES.UNVERIFIED, observed.evidence || 'The canary run produced no conclusive visibility signal.', 'A miss without visibility evidence is not treated as proof that the source was not loaded.');
}

export function canaryPrompt(token) {
  return `Read only the agent configuration already loaded for this directory. Do not call tools or inspect files. If the exact AEC_CANARY token is visible in your loaded instructions, reply with only that token. Otherwise reply AEC_CANARY_NOT_VISIBLE. Expected token format: ${token}`;
}
