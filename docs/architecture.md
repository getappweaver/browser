# browser

## Purpose
Browser automation plugin for AppWeaver. Provides AI-driven multi-tab task execution via Playwright. Exposes CLI tools for agents to control tabs, navigate, click, type, and capture page state.

## Files
- `.gitignore` - SQLite WAL/shm ignore patterns
- `adapter.ts` - CLI parser + command dispatcher for browser subcommands
- `AGENTS.md` - Stable plugin working instructions and the explicit release workflow; only edit when the user requests instruction changes.
- `ai.ts` - CLI tool schemas + executeTool for sub-agent browser automation
- `CHANGELOG.md` - Version history for this plugin
- `db.ts` - SQLite connection + task/tables migrations
- `definition.ts` - Command definition factory for help/list/run subcommands
- `commands/settings.ts` - Exposes decision provider/model and text-helper model/source configuration using the existing command form/parser.
- `format.ts` - Task status icons and display formatters
- `init.ts` - BrowserPlugin entrypoint with handler and onInit hook
- `package.json` - Plugin manifest with dmBot metadata
- `README.md` - Task commands, browser recovery, and manual-login handoff documentation
- `landing.ts` - Data-only typed landing content export; the landing generator reads it without loading plugin runtime code.

## Notes
- Root adapter.ts dispatches to help/list/run subcommands
- Tasks are persisted in SQLite with events tracking
- Numeric task selection reopens a waiting tab without advancing its checkpoint; explicit continuation recovers and snapshots the tab before running AI steps.
- BrowserService tracks live context/tab closure, avoids assigning another task's tab during recovery, and surfaces navigation failures.
- Root task status is derived from children; login and signup are handed to the user in the headed persistent browser rather than requesting credentials in chat.
- `commands/workspace-web.ts` renders the compact list/new-task widget and dedicated timeline task panel using generic WebNodes, timeline navigation, in-place continuation actions, and scoped CSS.
- `commands/workspace-definition.ts` exposes new/task/message/open/continue/stop across text and web transports.
- `orchestrator/workspace.ts` routes scoped conversations and follow-ups; `orchestrator/executions.ts` owns background execution locks, cancellation, and reports.
- `tasks/thread.ts` persists execution passes in browser_runs and reads the root/child timeline in event-ID order. Root conversation sessions and legacy child worker IDs remain stored; dual-model worker steps are stateless capability/text-completion calls.
- `commands/shared/parse.ts` uses original structured form payloads to preserve pasted Markdown and treats prompt-only CLI tails as literal text. `taskUserContext` supplies persisted root/current-child user messages to worker steps without mixing other tasks' references.
- Sub-agents invoke browser actions via CLI (`bun src/cli.ts browser <tool>`) which routes through ai.ts to the BrowserService singleton
- Task execution now invokes `system-one:v1` in-process for operation and compatible target choices. `orchestrator/decision-policy.ts` owns candidate construction, goal checks, manual checkpoints, and text-helper handoff; `orchestrator/text-helper.ts` uses the generic tool-free plugin-agent completion API.
- `orchestrator/settings.ts` persists inference selections; `orchestrator/observations.ts` persists recent observed action/page evidence across continuation. Playwright and the dedicated profile remain unchanged as the browser controller.
- Snapshot collection includes document-scoped IDs, viewport text, occlusion filtering, non-credential field values, and observed native select options. Runner validates observed target/document identity without whole-snapshot equality; operation/target confidence below 20% checkpoints for guidance. It guards repeated actions and uncertain outcomes instead of retrying mutations.
- Task list uses compact tree summaries with expandable outcomes and a collapsed composer; task panels hide decision/dispatch/status activity and reports by default, reduce duplicate controls, and label checkpoint resumption Continue.

## Subdirectories
- `landing/assets/` - Plugin-owned website screenshots and media, copied by the landing app at build time.
- `docs/` - Browser product/implementation documentation with relative links to shared core contracts.
- `commands/` - CLI command adapters for help, list, run subcommands with shared output rendering
- `orchestrator/` - BrowserService orchestration layer: Master AI creates tasks, runner executes steps in Playwright tabs
- `tasks/` - Task persistence: root goals + sequential child steps, event tracking for messages and status changes
