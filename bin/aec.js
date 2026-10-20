#!/usr/bin/env node

import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`aec: ${error.message}`);
  process.exitCode = 1;
});
