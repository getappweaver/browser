---
direct_hash: acea64236ba80092e24234d74d08f36f92579f77448f2e11d2e8a51780697b4b
subtree_hash: 72f50aabad4552a36bd6bfc7f3a7e9f247661be77e4e44da108eeeca37c73f40
files:
  browser-service.ts: 3aeb67085722fe0e763688bc3203365390c2e4add8b272a7dcb408897c3dd9e3
  master.ts: 5589b20070b9d6dd10bf1be3ad25320d573081f5c1dfc236240b11331ef5c105
  notifications.ts: e8bf556ca049718a05dba6715895b0019fa725d81d37543247cbb72a7c51ed6e
  prompts.ts: a220efb444a53fd8a17550b4ca17b5ac1396ac472024d15eb5f6fa683ace06e7
  runner.ts: fb7547b9207c0c0f95368f34be89ce12ffbd36fb99044b6136743579fe1c6917
children:
---

# orchestrator

## Purpose
Browser task orchestration layer. Master AI interprets user messages and creates sub-tasks; runner executes them sequentially via Playwright. Each sub-task gets its own browser tab; agents signal completion via text markers.

## Files
- `browser-service.ts` - Playwright multi-tab service exposing open/navigate/snapshot/click/type/press/scroll/wait actions; injects stable element IDs for reliable targeting.
- `master.ts` - Master AI entrypoint: callMasterAi parses a JSON decision (CREATE_NEW/RESUME/STOP/CLARIFY/NOTHING) and executeDecision creates/resumes/cancels tasks.
- `notifications.ts` - DMs sent to user on checkpoint, task complete, task failed, and run summary events.
- `prompts.ts` - buildMasterSystemPrompt for routing decisions; buildSubAgentSystemPrompt instructing sub-agents how to use browser CLI tools and emit completion markers.
- `runner.ts` - executeSequentialLoop runs pending children sequentially; runSubTask spins up a backend session and parses completion markers from agent output.

## Notes
- Sub-agents use CHECKPOINT_NEEDED/COMPLETE/FAILED markers for signaling
- Tasks run sequentially within a root task, not in parallel
- Each sub-task gets its own browser tab (tabId format: task-{taskId})
