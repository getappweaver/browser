# Browser plugin (browser)

Browser automation plugin — AI-driven multi-tab task execution

**Command:** `/browser`

---

## Web task workspace (Phase 1)

Open the Browser header widget or run `/browser list` in the web UI. Compact tree rows show task title/status/time; expanding a row reveals its latest outcome and Open task action. The new-task composer is collapsible. Opening or creating a task opens its dedicated panel in the main timeline, not in a modal or docked widget. The panel contains its persistent conversation, collapsed activity/reports, and concise manual checkpoints; messages and checkpoint actions update it in place. Continue resumes automation after the requested manual step or new guidance; it does not assert that the task is done.

- `new <message>` creates a root task and starts execution in the background.
- `task <id>` opens a task without restarting execution.
- `message <id> <message>` asks a scoped question or requests follow-up work in the same thread, including after completion.
- `open <id>` shows/recovers a browser tab without advancing automation.
- `continue <id>` resumes the selected waiting child after a manual checkpoint.
- `stop <id>` aborts the current execution and cancels pending/waiting steps; tabs remain open. An in-flight browser action can finish before cancellation takes effect.

Panels refresh read-only state every 2.5–5 seconds while visible; polling pauses in hidden browser tabs and while editing a form. Closing a panel does not stop its task. Concurrent continuation/message requests for the same task are rejected while it is busy. The composer becomes available after the current execution or reply finishes.

Task conversations and child activity are persisted in `task_events`; root and child agent session IDs are retained separately. Each execution stores its outcome/report in `browser_runs` and appends the report to the root thread. Interrupted executions are reported after restart and require explicit continuation. Reports show observed outcomes, recorded actions, and source links; model-generated findings are based on the page snapshots.

You can paste Markdown documents such as a CV into the task composer. Original structured web values preserve newlines, quotes, spacing, frontmatter (`---`), and bullets. Prompt-only `new`, `run`, and `message` text commands treat their free-text tail literally rather than as flags. Pasted user messages remain in the task history and are supplied to browser steps and follow-up conversations, so reference documents survive continuation and restart. Supplying requested document contents can resume the waiting step; otherwise explicitly ask it to continue. Local file paths alone still do not load document contents.

Scheduling and cron integration through the job capability are Phase 2.

## Tasks and manual login

- `/browser run <prompt>` starts a browser task or routes a follow-up in text transports. In the web UI, new prompts create a task panel; use its composer for task-scoped follow-ups.
- `/browser list` shows roots and child tasks. Root status reflects its children.
- `/browser run 5` or `/browser run reopen task #5` recovers and foregrounds a waiting task's tab without continuing automation. If a root has multiple waiting children, select a child ID.
- Log in or sign up directly in the browser, including passwords, verification codes, and CAPTCHA. Never send credentials in chat.
- `/browser run continue task #5` resumes the waiting child after recovering its tab and taking a fresh snapshot. If login is still needed, the AI hands control back to you.

The headed browser uses a persistent local profile at `plugins/browser/profile`; authentication state stays in that profile. Tasks and events are stored in `plugins/browser/db.sqlite`. A persisted `waiting` status does not assert that a browser is currently open. Closing the tab or browser invalidates its live handle; explicit reopening/continuation recovers an unassigned matching tab or navigates a new tab to the last recorded URL. Recovery errors leave the task waiting with an explanatory event.

Login handoff uses the decision policy and existing manual checkpoints. Snapshots expose viewport text, compatible controls, native dropdown options, and non-credential field values. Password and recognized verification fields are excluded from typing targets and their values are not read. This is not a general isolation boundary for authenticated page content: inference receives content available after login.

## System One + text helper

Task execution uses `system-one:v1` in-process. Configure the System One app's upstream key first, then choose a small model from AppWeaver's catalog for Browser's separate text helper:

```text
/systemone settings
/browser settings --text-model <catalog-model-id>
/browser settings --text-model-source <model-source-id-or-alias>
/browser settings --decision-provider <system-one-provider-id>
/browser settings --decision-model default
```

`/browser settings` shows current selections. Use `default` to reset a selection: decision provider defaults to automatic selection, decision model defaults to the System One plugin's model, and text source defaults to the active AppWeaver workspace source. Resetting the text model leaves it unconfigured; the helper asks for configuration rather than silently using an expensive default. An inexpensive model must be selected explicitly; prices are not inferred from model names.

Each decision request offers only operations and indexed targets supported by the observed page. Operation and compatible target heads share one request; only the chosen operation's target executes. Supported operations are CLICK, TYPE_TEXT, SELECT, PRESS_ENTER, viewport scrolling, WAIT, DONE, MANUAL, and BLOCKED. Initial navigation uses a supplied URL or asks the text helper for a validated HTTP(S) destination. The text helper is otherwise used for field values and independent observed completion reports, not every navigation/click decision. Master decomposition and scoped chat retain their existing model.

Playwright and the headed dedicated persistent profile remain the controller. Snapshot collection is one browser evaluation, with viewport/occlusion checks and document-scoped element IDs. Whole-page snapshot equality is not checked before actions or completion. Only a target's document/node identity is validated before interacting, so unrelated text or controls changing do not block a confident decision. Operation or selected-target confidence below 20% pauses for the user to check the page and Continue. Native dropdown choices come from the page, text is filled with Playwright input methods, and Enter is a separate explicit choice. New tabs opened by task clicks are followed, with return to the opener when the popup closes.

Recent action observations persist in `browser_observations` and are restored on continuation. Settings persist in `browser_settings`. Decisions include model/confidence/timing events; attempted actions are logged before dispatch, and observed successful returns are recorded separately. Repeated/ineffective actions produce a manual checkpoint. An error after dispatch is not automatically retried because its outcome may be uncertain. Task budgets count dispatch attempts.

DONE requires an independent goal question plus a separately generated evidence-based report; a decision alone does not mark completion. This is model-based verification of recorded observations, not a site-specific deterministic assertion. Login/signup/verification and manual review continue through the existing waiting/open/continue workflow. Stop prevents later actions; an already-dispatched browser operation may finish. System One cancellation currently discards late results rather than aborting the upstream decision request.

Initial limitations: document-main viewport controls (up to 120), 6,000 characters of viewport text, native selects, and page scrolling. Frames, shadow-root controls, uploads, drag-and-drop, and nested scroll containers require further controller work. Browser completion reports use the ten most recent persisted observations. The cloned reference implementations under host `tmp/` are analysis inputs, not runtime dependencies.

See [PLUGINS.md](../../PLUGINS.md) in the host repo root for the full plugin author guide.

Update the nearest README and local docs when structure or behavior changes.
Working instructions live in [AGENTS.md](./AGENTS.md) and only change when the user explicitly asks.

## Architecture

See [local architecture and source map](docs/architecture.md).

## Local modules

- [tasks](tasks/README.md)
- [commands](commands/README.md)
- [orchestrator](orchestrator/README.md)
