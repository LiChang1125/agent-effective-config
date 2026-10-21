#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';

const pluginRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const cli = path.join(pluginRoot, 'bin', 'aec.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error) {
  console.error(`aec-diagnose: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
