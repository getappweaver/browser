---
scope_root: true
---

# plugins/browser

Scaffold plugin generated from `scripts/plugin-template/`. `list` and `show` include minimal web renderers when `source === 'web'`; `add` and other commands use shared text rendering.

## Layout

- `init.ts` — `BotPlugin`, `PluginContext` / DB handles, `commandDefinition`
- `adapter.ts` — `parseCliInput` + per-subcommand adapters
- `definition.ts` — aggregated `CommandDefinition`
- `commands/help/module.ts` — `getBrowserCommandDefinition`, `getBrowserHelpLines`
- `commands/shared/render.ts` — shared render types and `renderBrowserText`
- `commands/drafts/store.ts` / `commands/drafts/types.ts` — draft persistence + draft types
- `commands/shared/types.ts` — shared entity/input schemas and types
- `commands/shared/output.ts` — shared message representation + builder
- `commands/list/renderers/{text,web}.ts` and `commands/show/renderers/{text,web}.ts` — per-command renderers
- `db.ts` — SQLite open + table migration + CRUD in one file
- `ai.ts` — tool schema + `executeTool` (used by `plugin:generate`)

Regenerate bottom-up docs for this folder after substantive edits (`bun src/cli.ts file bottomup …` per dm-bot-file skill).
