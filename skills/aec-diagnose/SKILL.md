---
name: aec-diagnose
description: Diagnose which Claude Code, Codex, or Cursor configuration is actually effective in a working directory. Use when rules, skills, permissions, hooks, MCP servers, precedence, shadowing, or agent configuration loading needs to be inspected or explained.
---

# AEC Diagnose

Use the bundled read-only diagnostic before drawing conclusions from configuration files alone.

## Run the diagnostic

1. Choose `claude-code`, `codex`, or `cursor` from the user's request. Omit `--agent` only when auto-detection is appropriate.
2. Resolve the target working directory to an absolute path.
3. Run the bundled `scripts/run-aec.mjs` script from this skill directory:

```sh
node scripts/run-aec.mjs --cwd "/absolute/project/path" --agent codex --json
```

Add `--probe` only when the user asks for live runtime verification. Probes remain read-only, but they may invoke an installed agent executable.

## Report the result

- Lead with the effective configuration and the most important shadowing or failure cause.
- Preserve the four evidence labels exactly: `CONFIRMED_EFFECTIVE`, `CONFIRMED_NOT_LOADED`, `LOADED_BUT_UNFOLLOWED`, and `UNVERIFIED`.
- Include the evidence string for every claimed failure.
- Explain that `UNVERIFIED` means the state was not safely observable, not that the configuration failed.
- Do not edit configuration unless the user separately asks for a fix.
