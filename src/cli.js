import fs from 'node:fs';
import path from 'node:path';
import { diagnose } from './engine.js';
import { AEC_VERSION, AGENT_NAMES, STATUSES } from './constants.js';

const HELP = `Agent Effective Config (aec) ${AEC_VERSION}

Usage:
  aec [--cwd <directory>] [--agent <name>] [--json] [--probe]

Options:
  --cwd <directory>   Directory to diagnose (default: current directory)
  --agent <name>      claude-code, codex, or cursor (default: auto-detect)
  --json              Emit the stable machine-readable contract
  --probe             Run safe read-only agent canaries when possible
  --no-color          Disable terminal colors
  --version           Print the aec version
  --help              Show this help
`;

function parseArgs(argv) {
  const options = { cwd: process.cwd(), json: false, probe: false, color: process.stdout.isTTY };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd' || arg === '--agent') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--probe') options.probe = true;
    else if (arg === '--no-color') options.color = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function autoDetect(cwd) {
  const scores = {
    'claude-code': ['CLAUDE.local.md', 'CLAUDE.md', '.claude', '.mcp.json'],
    codex: ['AGENTS.override.md', 'AGENTS.md', '.codex'],
    cursor: ['.cursor', '.cursorrules'],
  };
  let best = 'claude-code';
  let bestScore = -1;
  for (const name of AGENT_NAMES) {
    const score = scores[name].filter((entry) => fs.existsSync(path.join(cwd, entry))).length;
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

function paint(text, code, enabled) {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function renderTable(report, color) {
  const colors = {
    [STATUSES.EFFECTIVE]: '32',
    [STATUSES.NOT_LOADED]: '31',
    [STATUSES.UNFOLLOWED]: '33',
    [STATUSES.UNVERIFIED]: '90',
  };
  const lines = [
    `Agent Effective Config ${report.aecVersion}`,
    `Agent: ${report.agent} (${report.agentVersion})`,
    `Directory: ${report.cwd}`,
    '',
  ];
  for (const status of Object.values(STATUSES)) {
    const group = report.findings.filter((finding) => finding.status === status);
    if (!group.length) continue;
    lines.push(paint(`${status} (${group.length})`, colors[status], color));
    lines.push('KIND         PRIORITY  SOURCE');
    for (const finding of group) {
      const source = report.sources.find((item) => item.path === finding.source && item.kind === finding.kind);
      const shadow = finding.shadowedBy ? `  ← shadowed by ${finding.shadowedBy}` : '';
      lines.push(`${finding.kind.padEnd(12)} ${(source?.priority ?? 0).toString().padEnd(9)} ${finding.source}${paint(shadow, '1;31', color)}`);
      lines.push(`  ${finding.reason}`);
      lines.push(`  Evidence: ${finding.evidence}`);
    }
    lines.push('');
  }
  const value = report.summary;
  lines.push(`Summary: ${value.effective} effective · ${value.notLoaded} not loaded · ${value.loadedButUnfollowed} loaded/unfollowed · ${value.unverified} unverified`);
  return lines.join('\n');
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${AEC_VERSION}\n`);
    return;
  }
  options.cwd = path.resolve(options.cwd);
  if (!fs.existsSync(options.cwd) || !fs.statSync(options.cwd).isDirectory()) {
    throw new Error(`not a directory: ${options.cwd}`);
  }
  options.agent ||= autoDetect(options.cwd);
  if (!AGENT_NAMES.includes(options.agent)) {
    throw new Error(`unsupported agent '${options.agent}'; choose ${AGENT_NAMES.join(', ')}`);
  }
  const report = await diagnose(options);
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderTable(report, options.color)}\n`);
}
