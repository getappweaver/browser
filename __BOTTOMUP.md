---
scope_root: true
direct_hash: 4d20e986551bac953c375b199b5670148ef926e8bba578d2033db7a82038d733
subtree_hash: 9f2501e8b7374825b7316ed0af25983760ee93a6847533ea283aa161ae94e18e
files:
  .gitignore: b3d9f33c57eacd1a25e7960c96487df06628958b2f290fa7a2a7940dfc94b20e
  adapter.ts: f9b5c696783cd99a4cdce590704159b35034452bcf35f1c7ad550e5442ac0dd1
  AGENTS.md: baec972ada9be65486d6267947aa860cd2e1c22939cff8d71cf30143b8a8c23f
  ai.ts: fe4112b6d5c55f392f6a2fa1db80a4ac303402c45cb99a05ba722d9969264394
  CHANGELOG.md: f0bbbb882d83bacd8d90c3c9294f63ffe2257d42b8054a6a7854155ec4b52ff3
  db.ts: f5a32d7966ab9e7610f40c23dcb7be7eabd0d178dfdc0cc6416996126d71de44
  definition.ts: f08cf92e67ff68e42b7483c3e44f0cd1db45ae0e2dbbcc22ab24b868ae496ac9
  format.ts: d5da17278d1624a00295988552e5c3fbdc0fc17da0724c4caa05b91152c0c601
  init.ts: 13c39739678d4fb768ace161852609161fdf2bbd7c8cfa7bb3cce6560756c62b
  package.json: c9252adcb4a31598cf5bb466feb38b05c956de7eaa53e6df4688c59f3ed6afee
  README.md: 43890e348931c5a63fe90e322190cccab7e806137b6b406524f5f3d04aefb217
children:
  commands: bc4a1fc3af8fb0662b3aba5a1802dc4afe5d20d6528d3d5791737d4a86f9b293
  orchestrator: 72f50aabad4552a36bd6bfc7f3a7e9f247661be77e4e44da108eeeca37c73f40
  tasks: 90123061aa207349c447b0550fd1ff55b84f225984e574324d9d6fd3e6ed85e1
---

# browser

## Purpose
Browser automation plugin for dm-bot. Provides AI-driven multi-tab task execution via Playwright. Exposes CLI tools for sub-agents to control tabs, navigate, click, type, and capture page state.

## Files
- `.gitignore` - SQLite WAL/shm ignore patterns
- `adapter.ts` - CLI parser + command dispatcher for browser subcommands
- `AGENTS.md` - Step-by-step guide for publishing the plugin to Nostr via ngit and keeping bottom-up docs up to date
- `ai.ts` - CLI tool schemas + executeTool for sub-agent browser automation
- `CHANGELOG.md` - Version history for this plugin
- `db.ts` - SQLite connection + task/tables migrations
- `definition.ts` - Command definition factory for help/list/run subcommands
- `format.ts` - Task status icons and display formatters
- `init.ts` - BrowserPlugin entrypoint with handler and onInit hook
- `package.json` - Plugin manifest with dmBot metadata
- `README.md` - Plugin documentation placeholder

## Notes
- Root adapter.ts dispatches to help/list/run subcommands
- Tasks are persisted in SQLite with events tracking
- Sub-agents invoke browser actions via CLI (`bun src/cli.ts browser <tool>`) which routes through ai.ts to the BrowserService singleton

## Subdirectories
- `commands/` - CLI command adapters for help, list, run subcommands with shared output rendering
- `orchestrator/` - BrowserService orchestration layer: Master AI creates tasks, runner executes steps in Playwright tabs
- `tasks/` - Task persistence: root goals + sequential child steps, event tracking for messages and status changes
