---
direct_hash: 45d15609bef890f3ecfb51c638cbe298196f342913ae91bf7f10434e32c4e328
subtree_hash: fb036980dfc0da9f1ade6443eabcd2e18845cc1aaf07988c8db40f50af6a8c01
files:
  adapter.ts: d00bab234b74585422fb3d87e3aeec0d9ce32ad88216b862bbce492f0f702b1a
  definition.ts: 9fb581fb2f0f83136f75d2a5a67bb724979b0193e22336a85bf6534c0b554e48
  handler.ts: 1058b1890f1cba8b01445ea767fbadd0fb61d271bac502fcb7c2b963842747de
children:
---

# commands/run

## Purpose
Implements the 'run' subcommand for browser task execution. Users provide a natural language prompt which flows through adapter -> handler -> orchestrator master decision.

## Files
- `adapter.ts` - CLI adapter: parses variadic prompt args, calls handler, wraps response in BrowserReplyMessage
- `definition.ts` - Defines subcommand schema: name='run', required variadic 'prompt' argument, usage examples
- `handler.ts` - Validates prompt non-empty, delegates to handleMasterDecision in orchestrator module

## Notes
- Entry point is adaptRunCommand in adapter.ts
- Handler delegates to orchestrator/master for actual execution
- Prompt argument is variadic - multiple text segments are joined
