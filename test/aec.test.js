import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { diagnose, STATUSES } from '../src/index.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const scenarioA = path.join(projectRoot, 'fixtures', 'scenario-a');
const scenarioB = path.join(projectRoot, 'fixtures', 'scenario-b');

function temporaryProject(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-test-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  return directory;
}

test('higher-priority local Claude settings shadow shared settings', async () => {
  const report = await diagnose({ cwd: scenarioB, agent: 'claude-code' });
  const finding = report.findings.find((item) => item.source === '.claude/settings.json' && item.kind === 'permission');
  assert.equal(finding.status, STATUSES.NOT_LOADED);
  assert.equal(finding.shadowedBy, '.claude/settings.local.json');
});

test('CLAUDE.local.md makes the ignored AGENTS.md cause explicit for Claude Code', async () => {
  const report = await diagnose({ cwd: scenarioB, agent: 'claude-code' });
  const finding = report.findings.find((item) => item.source === 'AGENTS.md');
  assert.equal(finding.status, STATUSES.NOT_LOADED);
  assert.equal(finding.shadowedBy, 'CLAUDE.local.md');
  assert.match(finding.evidence, /AGENTS\.md/);
});

test('a loaded but unfollowed canary is never collapsed into not-loaded', async () => {
  const directory = temporaryProject({
    'AGENTS.md': '# Test\nAEC_CANARY: LOADED_TEST_123\n',
  });
  try {
    const report = await diagnose({
      cwd: directory,
      agent: 'codex',
      probe: true,
      runner: async () => ({ visible: true, followed: false, evidence: 'Mock runtime saw the source; model omitted the token.' }),
    });
    assert.equal(report.findings[0].status, STATUSES.UNFOLLOWED);
    assert.notEqual(report.findings[0].status, STATUSES.NOT_LOADED);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Claude adapter discovers instruction, skill, hook, permission, and MCP sources', async () => {
  const report = await diagnose({ cwd: scenarioA, agent: 'claude-code' });
  const kinds = new Set(report.sources.filter((item) => !item.path.startsWith('~/')).map((item) => item.kind));
  assert.deepEqual([...kinds].sort(), ['hook', 'instruction', 'mcp', 'permission', 'skill']);
});

test('Codex adapter lets AGENTS.override.md replace AGENTS.md in one directory', async () => {
  const directory = temporaryProject({
    'AGENTS.md': 'shared',
    'AGENTS.override.md': 'override',
  });
  try {
    const report = await diagnose({ cwd: directory, agent: 'codex' });
    const normal = report.findings.find((item) => item.source === 'AGENTS.md');
    assert.equal(normal.status, STATUSES.NOT_LOADED);
    assert.equal(normal.shadowedBy, 'AGENTS.override.md');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Cursor adapter discovers MDC rules and project MCP configuration', async () => {
  const directory = temporaryProject({
    '.cursor/rules/team.mdc': '---\nalwaysApply: true\n---\nBe concise.',
    '.cursor/mcp.json': '{"mcpServers":{"example":{"command":"node"}}}',
  });
  try {
    const report = await diagnose({ cwd: directory, agent: 'cursor' });
    assert.ok(report.sources.some((item) => item.path === '.cursor/rules/team.mdc' && item.kind === 'instruction'));
    assert.ok(report.sources.some((item) => item.path === '.cursor/mcp.json' && item.kind === 'mcp'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('missing MCP executable is confirmed not loaded without executing config commands', async () => {
  const report = await diagnose({ cwd: scenarioB, agent: 'claude-code' });
  const finding = report.findings.find((item) => item.source === '.mcp.json');
  assert.equal(finding.status, STATUSES.NOT_LOADED);
  assert.match(finding.evidence, /Executable not found/);
});

test('JSON report follows the stable output contract and summary totals match findings', async () => {
  const report = await diagnose({ cwd: scenarioB, agent: 'claude-code' });
  assert.deepEqual(Object.keys(report), ['cwd', 'agent', 'agentVersion', 'aecVersion', 'sources', 'findings', 'summary']);
  assert.ok(report.sources.every((item) => Object.keys(item).join(',') === 'path,kind,priority,declared'));
  const total = Object.values(report.summary).reduce((sum, value) => sum + value, 0);
  assert.equal(total, report.findings.length);
});

test('invalid JSON is reported as confirmed not loaded with parse evidence', async () => {
  const directory = temporaryProject({ '.claude/settings.json': '{broken' });
  try {
    const report = await diagnose({ cwd: directory, agent: 'claude-code' });
    const finding = report.findings.find((item) => item.source === '.claude/settings.json');
    assert.equal(finding.status, STATUSES.NOT_LOADED);
    assert.match(finding.evidence, /invalid JSON/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
