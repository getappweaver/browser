# orchestrator

## Purpose
Browser task orchestration layer. Master AI interprets messages and creates sub-tasks. The runner executes them sequentially in dedicated-profile Playwright tabs using System One decisions and a separately selected text helper, retaining task checkpoints and reports.

## Files
- `browser-service.ts` - Persistent Playwright tabs, popup following, viewport/occlusion-filtered snapshots with document-scoped IDs, lightweight target/document identity validation without whole-page equality, and click/fill/select/press/scroll/wait execution.
- `master.ts` - Master AI entrypoint: callMasterAi parses a JSON decision (CREATE_NEW/RESUME/STOP/CLARIFY/NOTHING) and executeDecision creates/resumes/cancels tasks.
- `notifications.ts` - DMs sent to user on checkpoint, task complete, task failed, and run summary events.
- `prompts.ts` - Master routing prompt and legacy browser action JSON prompt/parser contracts.
- `runner.ts` - Sequential task runner integrates System One policy with budgets, decision/dispatch/action events, observation persistence, completion/manual checkpoints, cancellation, and recovery.
- `decision-policy.ts` - Builds compatible indexed action/target questions, invokes system-one:v1, checks answers and DONE evidence, and uses the text helper for navigation bootstrap, filling, and final reports.
- `text-helper.ts` - Model-source-routed, tool-free text completion with bounded timeouts and strict JSON reply schemas.
- `settings.ts` - SQLite inference settings for decision provider/model and separate text-helper source/model.
- `observations.ts` - Stores action/page observations and restores recent evidence across continuation.
- `executions.ts` - Background execution locks, stop signals, and durable execution reports.
- `workspace.ts` - Scoped task conversation, panel actions, and continuation routing.

## Notes
- System One chooses among observed candidates; the text helper does not select arbitrary browser targets.
- DONE requires a goal-check answer and an independent observation-based text report; manual login/review remains a waiting checkpoint.
- Very-low-confidence operation or selected-target decisions (below 20%) request user guidance rather than acting; confident completion does not require a second snapshot comparison.
- Tasks run sequentially within a root task, not in parallel
- Each sub-task gets its own browser tab (tabId format: task-{taskId})
