import path from 'node:path';
import { AEC_VERSION, STATUSES } from './constants.js';
import { displayPath } from './files.js';
import { getAdapter } from './adapters/index.js';

function publicSource(source, cwd) {
  return {
    path: displayPath(source.path, cwd),
    kind: source.kind,
    priority: source.priority,
    declared: true,
  };
}

function publicFinding(source, result, cwd) {
  const finding = {
    source: displayPath(source.path, cwd),
    kind: source.kind,
    status: result.status,
    evidence: result.evidence,
    reason: result.reason,
  };
  if (source.shadowedBy) finding.shadowedBy = displayPath(source.shadowedBy, cwd);
  return finding;
}

function summarize(findings) {
  const summary = { effective: 0, notLoaded: 0, loadedButUnfollowed: 0, unverified: 0 };
  for (const finding of findings) {
    if (finding.status === STATUSES.EFFECTIVE) summary.effective += 1;
    else if (finding.status === STATUSES.NOT_LOADED) summary.notLoaded += 1;
    else if (finding.status === STATUSES.UNFOLLOWED) summary.loadedButUnfollowed += 1;
    else summary.unverified += 1;
  }
  return summary;
}

export async function diagnose(options) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const adapter = getAdapter(options.agent);
  const sources = await adapter.discoverConfigs(cwd);
  const findings = [];

  for (const source of sources) {
    const visibility = await adapter.probeVisibility(source, { cwd, probe: options.probe });
    const result = await adapter.runCanary(source, source.kind, {
      cwd,
      probe: Boolean(options.probe),
      visibility,
      runner: options.runner,
    });
    findings.push(publicFinding(source, result, cwd));
  }

  return {
    cwd,
    agent: adapter.name,
    agentVersion: await adapter.agentVersion(cwd),
    aecVersion: AEC_VERSION,
    sources: sources.map((source) => publicSource(source, cwd)),
    findings,
    summary: summarize(findings),
  };
}
