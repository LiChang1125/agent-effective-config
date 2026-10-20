import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexAdapter } from './codex.js';
import { CursorAdapter } from './cursor.js';

export const adapters = Object.freeze({
  'claude-code': new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  cursor: new CursorAdapter(),
});

export function getAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) throw new Error(`unknown adapter: ${name}`);
  return adapter;
}
