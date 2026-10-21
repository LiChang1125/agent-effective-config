import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));

test('portable, Claude Code, and Codex marketplace manifests agree', () => {
  const portable = readJson('plugin.json');
  const claude = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.agents/plugins/marketplace.json');

  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(portable.name, 'agent-effective-config');
  assert.equal(portable.version, '0.2.0');
  assert.equal(claude.name, portable.name);
  assert.equal(claude.version, portable.version);
  assert.equal(marketplace.plugins[0].name, portable.name);
  assert.equal(marketplace.plugins[0].source.source, 'url');
  assert.ok(fs.existsSync(path.join(projectRoot, portable.extensions['com.openai'].interface.logo)));
});

test('skill metadata and bundled runner are valid and executable', () => {
  const skill = fs.readFileSync(path.join(projectRoot, 'skills', 'aec-diagnose', 'SKILL.md'), 'utf8');
  const openai = fs.readFileSync(path.join(projectRoot, 'skills', 'aec-diagnose', 'agents', 'openai.yaml'), 'utf8');
  assert.match(skill, /^---\r?\nname: aec-diagnose\r?\n/);
  assert.match(openai, /\$aec-diagnose/);

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-plugin-'));
  try {
    fs.cpSync(path.join(projectRoot, 'test', 'fixtures', 'scenario-b'), sandbox, { recursive: true });
    const run = spawnSync(process.execPath, [
      path.join(projectRoot, 'skills', 'aec-diagnose', 'scripts', 'run-aec.mjs'),
      '--cwd', sandbox,
      '--agent', 'codex',
      '--json',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.agent, 'codex');
    assert.ok(report.summary.notLoaded >= 1);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('published root stays compact and core logic stays below the size cap', () => {
  const ignored = new Set(['.git', '.local', 'work']);
  const rootEntries = fs.readdirSync(projectRoot).filter((name) => !ignored.has(name));
  assert.ok(rootEntries.length <= 12, `root has ${rootEntries.length} published entries`);

  const coreFiles = fs.readdirSync(path.join(projectRoot, 'src'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(projectRoot, 'src', entry.name));
  const lines = coreFiles.reduce((total, file) => total + fs.readFileSync(file, 'utf8').split(/\r?\n/).length, 0);
  assert.ok(lines <= 1200, `core logic has ${lines} lines`);
});
