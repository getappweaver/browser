# Browser Plugin Product Notes

Core contracts: [Plugin system](../../../docs/PLUGIN_SYSTEM.md),
[capability services](../../../docs/PLUGIN_CAPABILITY_SERVICES.md), and
[web renderer](../../../docs/WEB_RENDERER.md).

## Current Direction

- Product is `browser`, not `socials`
- Main value: AI can use your browser on your machine with persistent local profiles
- Tasks are prompt-first for now
- Scheduling/deferred runs will come from `job`, not from `browser`
- Browser should be architected as a real long-lived task system, not a one-shot command loop
- Runs should be resumable after bot restarts

## MVP Building Blocks

### Profiles

- Stored locally in the plugin directory
- Persistent browser session/auth state
- One profile can be reused across runs
- User may create separate profiles per site/use case

### Tasks

- A task is primarily a prompt
- Prompt can include content, links, references, instructions, tone, and constraints
- AI decides how to execute it using browser tools
- Nostr draft link/content can simply be part of the prompt or a referenced web page for now

### Checkpoints

- Main example: login required
- AI should notify the user whenever a site needs login
- User replies later and the run continues in the same browser task context
- AI can use `sendDm` to notify when blocked or finished
- Future PWA push notifications can plug into the same pattern
- Simple synchronous `promptFn` is not enough for the long-term browser product because it only supports one pending prompt slot in core today
- Browser plugin should own its own async checkpoint / reply routing model

## Browser Capabilities Needed

- open/start browser
- navigate to URL
- inspect compact structured snapshot
- click
- type
- press keys
- scroll
- wait for text/elements
- open new tab
- switch between tabs
- close tab if needed
- keep tabs open for user review by default

## Product Behavior Decisions

- AI should handle platform differences itself
- Prompt can provide extra guidance when needed
- AI should notify every time a site needs login
- User reviews final prepared drafts manually in the browser
- Browser should keep tabs open for review by default
- One active run in MVP UX is okay, but the architecture must be extensible beyond that
- AI should eventually be able to continue other work while one destination waits on login/user action
- Browser should not auto-resume tasks after restart; user can ask it to continue

## Example Task Shape

"Use this source post as reference. Prepare drafts for LinkedIn, YouTube, WhatsApp Web, Telegram Web, X, and Instagram. Open each in a new tab. Adapt tone per platform. Do not publish. Notify me when review is ready."

## Non-Goals For Now

- No formal workflow DSL yet
- No heavy state machine yet
- No complex site-specific architecture unless it becomes necessary
- No separate companion app for hosted mode yet

## Architectural Direction

- Browser plugin should own its own SQLite DB under `plugins/browser/`
- MVP DB should hold:
  - tasks
  - task_events
- Profiles are deferred for MVP; browser uses one implicit persistent local profile from config/code
- Browser plugin should have its own long-lived run/session manager
- Preferred UX: interact with browser runs in a special chat/thread/timeline, not as a single blocking command exchange
- Plugin should append progress/events to that timeline
- User replies in that same timeline; plugin routes the message back to the correct run/task/checkpoint
- MVP can allow only one active run, but should still be built on top of this run/event/checkpoint model
- Browser master should wake up per incoming event/message from persisted state, not rely on a long-lived in-memory loop
- DB-backed task state is the source of truth, not model memory

## Command Direction

- Main AI-first entrypoint: `/browser run <prompt>`
- Browser master interprets the prompt and decides whether to:
  - inspect existing tasks
  - continue a task
  - stop a task
  - repeat a task
  - create a new task
- If ambiguous, browser master should ask the user
- `/browser list` should show all tasks by default, including finished ones and reports/results where useful
- Future filters can narrow to pending/running/failed/etc.
- Explicit commands are still useful for CLI/DM/web consistency, even if primary UX is conversational

## File Structure Direction

Current target direction for `plugins/browser/`:

```text
plugins/browser/
  init.ts
  adapter.ts
  definition.ts
  open-db.ts

  commands/
    run/
      handler.ts
      definition.ts
      adapter.ts
    list/
      handler.ts
      definition.ts
      adapter.ts
      db.ts
      format.ts
    help/
      module.ts

  tasks/
    db.ts
    types.ts
    format.ts

  run/
    orchestrator.ts
    browser-service.ts
    checkpoint-router.ts
    notifications.ts
    prompts.ts
```

Notes:

- Avoid generic `shared/` until duplication is real
- Avoid generic `db/` and `runtime/` buckets when capability-local modules can own their files
- Keep modules locally understandable for generated `.BOTTOMUP.json` knowledge

## MVP DB Schema Direction

### tasks

- `id`
- `title`
- `prompt`
- `status`
- `created_at`
- `updated_at`

Task status values:

- `pending`
- `running`
- `waiting`
- `completed`
- `failed`
- `cancelled`

### task_events

- `id`
- `task_id`
- `role`
- `kind`
- `text`
- `created_at`

Event model:

- `role`: `user | assistant | system`
- `kind`: `message | status`

Notes:

- `task_events` is append-only timeline/history for a task
- No `metadata_json` in MVP
- No `last_error` / `last_summary` columns in `tasks`; derive from status and event history

## Waiting-tab Recovery Implementation

- [x] Numeric task selection and explicit reopening recover/foreground the waiting child without interpreting selection as login completion.
- [x] Explicit continuation supports root/child IDs, recovers the live tab, and takes a fresh snapshot before AI steps.
- [x] Context/tab closure invalidates live handles; recovery avoids tabs assigned to other tasks and reports navigation failures.
- [x] Browser launch/recovery failures leave an explanatory waiting checkpoint; root status reflects child state.
- [x] Worker instructions require manual login/signup in the browser and prohibit requesting or entering credentials/codes.
- [x] Static verification: targeted ESLint with fixes and `tsc --noEmit -p plugins/browser/tsconfig.json` passed.
- [ ] User verification: close/reopen task #5, complete manual signup, then continue; repeat after closing the browser or restarting the bot.

## Open Questions

## Dual-model execution

Keep the headed dedicated persistent profile and Playwright controller. Browser owns observation, task state, action execution, recovery, and reports. Browser invokes `system-one:v1` in-process for operation/target decisions; a separately configured small text model supplies initial navigation when needed, TYPE_TEXT values, and final observed reports. Master task decomposition and scoped conversations retain their current agent integration.

Reference repositories were cloned under workspace `tmp/` for analysis only: `browser-use/jev-ultrafast` at `1231850` and `chy4pro/jev-for-chrome` at `d5c24de`. Adopt indexed compatible action spaces, speculative target questions, freshness checks, and bounded loop detection; do not add the Python harness or Chrome extension as runtime dependencies.

- [x] Add explicit decision-provider/model and text-model/source settings and capability declarations. Text-helper model must be explicitly selected; no assumed cheap model or expensive fallback.
- [x] Add a reusable tool-free text-completion method to the core plugin-agent service using model-source routing; chat-completion prompts disable tools and retain transient-session cleanup.
- [x] Extend Playwright observation with document identity, compatible operations, observed dropdown choices, viewport/occlusion filtering, and observed-target identity guards. Whole-snapshot equality was superseded by the confidence-policy revision below. Live controller verification remains below.
- [x] Implement System One decisions with compatible indexed targets and goal checks; call the text helper only for text generation/bootstrap/reporting.
- [x] Integrate with existing task budgets, events, stop, login checkpoints, recovery, and persistent reports; restore recent observations after continuation and stop rather than retry uncertain mutations.
- [x] Update docs/bottom-up Markdown and generated registration. Full-project TypeScript, targeted ESLint, and whitespace checks passed. Focused in-memory checks passed for candidate mapping, helper model routing, completion/manual gates, cancellation, settings/observation persistence, task reports, and uncertain-action handling. No real browser or paid inference was run. Repo-wide lint remains blocked by existing NR, PPQ vendor, and Translate errors.
- [ ] User verification of live dual-model runs, forms/dropdowns, manual login, stale pages, cancellation, and completion reports.

Implementation limits: main-document viewport controls and page scrolling, 120 controls and 6,000 text characters per snapshot, native select options, and ten recent observations per decision/report. Frames, shadow-root controls, uploads, drag/drop, nested scrolling, live latency, and model-based outcome quality remain future/live verification concerns. Completion verification is observation-based model cross-checking, not deterministic site assertions. System One requests retain their provider deadline and discard results after cancellation; upstream abort propagation is not yet part of the decision contract. Backend changes require a deliberate bot restart; no restart signal was issued from this chat.

## Phase 1: Dedicated Task Workspace

### Confidence policy and compact widget revision

Confirmed layout: compact tree rows with title/status/time, expandable latest outcome and Open task action; collapsed new-task composer; task panel with a small toolbar, concise checkpoint and Continue, and collapsed report/activity details. Avoid duplicate controls and raw decision/dispatch logs in the conversation.

- [x] Remove whole-snapshot equality checks on actions/completion; checkpoint operation or target confidence below 0.20. Keep live-tab and observed-target/document identity validation, without comparing page content or unrelated controls.
- [x] Implement the confirmed compact tree list and streamlined task panel; rename Done — continue to Continue and explain it as resuming after user input/manual work.
- [x] Update docs and verify confidence behavior, non-blocking completion, task persistence, and generic WebNode structure with static/focused checks. Targeted ESLint and Browser TypeScript passed. In-memory completion/confidence assertions passed; a read-only render/schema check against task #11 passed for compact tree rows, collapsed composer/activity/reports, Continue labels, and nonduplicated browser controls. No authenticated browser/UI run or live model calls were performed.
- [ ] User verification of the compact widgets and continuing task #11 after restart.

Agreed layout: compact browser list/new-task widget; opening or creating a root places its dedicated task panel in the main timeline, not a modal or docked widget. Messages, checkpoint actions, and refresh update that timeline panel in place. Children are execution steps, not separate conversations. Login stays manual in the local headed browser. Phase 2 schedules executions through the job capability.

- [x] Persistent root conversation and retained agent session; scoped questions, checkpoint replies, and completed-task follow-ups.
- [x] Background executions with duplicate-run protection, stop handling, and durable execution reports.
- [x] Web list/new-task widget and dedicated task panel with actionable checkpoints and grouped activity.
- [x] Read-only live refresh; reopening panels restores current persisted state without rerunning a task.
- [x] Text command parity and documentation.
- [x] Pasted Markdown/reference-document correction: use original structured web form values rather than reparsing command text; treat prompt-only CLI tails literally, including `---` and bullet/flag-like text. Persisted task-scoped user messages are supplied to every browser step and conversation continuation. Targeted ESLint, TypeScript, and a one-off in-memory parsing/context check passed.
- [x] Targeted lint/type verification and final plan reconciliation. Targeted ESLint, browser/root and web TypeScript checks, diff whitespace checks, and an in-memory persistence/restart/command/UI-schema check passed. Repo-wide lint remains blocked by unrelated NR, PPQ vendor, and Translate errors.
- [ ] User verification in authenticated AppWeaver: create, close/reopen panel, log in manually, continue, ask questions, follow up, stop, and inspect reports.

Implementation: the plugin owns the task widget, scoped conversations, execution locks/cancellation, and browser_runs report history. Core/client changes provide the reusable `WebNodeRoot.autoRefreshMs` primitive and ensure explicit timeline actions take precedence over docking without replacing the origin widget. Timeline-opening correction passed targeted ESLint and web TypeScript checks. A root retains its conversation agent session; each child retains its worker agent session. Phase 2 scheduling is deferred. Bot restart is required to load these backend changes; no restart signal was issued from the active chat.

### Earlier Product Questions

1. How should browser timeline/thread UX map onto current core/web timeline primitives?
2. For MVP, do we want a dedicated browser thread/timeline immediately, or a simpler `/browser run`-started run that already writes to its own event store?
3. After we settle the schema, should `tasks/` stay minimal or split into `events.ts` / `checkpoints.ts` later?
