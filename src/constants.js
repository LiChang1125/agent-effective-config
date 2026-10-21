export const AEC_VERSION = '0.2.0';

export const STATUSES = Object.freeze({
  EFFECTIVE: 'CONFIRMED_EFFECTIVE',
  NOT_LOADED: 'CONFIRMED_NOT_LOADED',
  UNFOLLOWED: 'LOADED_BUT_UNFOLLOWED',
  UNVERIFIED: 'UNVERIFIED',
});

export const KINDS = Object.freeze([
  'instruction',
  'skill',
  'hook',
  'mcp',
  'permission',
]);

export const AGENT_NAMES = Object.freeze([
  'claude-code',
  'codex',
  'cursor',
]);
