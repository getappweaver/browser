// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/prompts.ts
// System prompts for the Master AI and sub-agent AI.
// ---------------------------------------------------------------------------

import type { Task, TaskEvent } from '../tasks/types';

// ---------------------------------------------------------------------------
// Master AI prompt
// ---------------------------------------------------------------------------

type TaskSummary = {
  task: Task;
  lastEvent: TaskEvent | null;
  children: Array<{ task: Task; lastEvent: TaskEvent | null }>;
};

type BuildMasterPromptProps = {
  userMessage: string;
  taskSummaries: TaskSummary[];
};

export function buildMasterSystemPrompt({
  userMessage,
  taskSummaries,
}: BuildMasterPromptProps): string {
  const taskContext =
    taskSummaries.length === 0
      ? 'No existing tasks.'
      : taskSummaries
          .map(({ task, lastEvent, children }) => {
            const childLines =
              children.length === 0
                ? '  (no sub-tasks)'
                : children
                    .map(({ task: child, lastEvent: childEvent }) => {
                      const eventSuffix = childEvent
                        ? ` — last event: "${childEvent.text}"`
                        : '';

                      return `  - [${child.status.toUpperCase()}] ${child.title}${eventSuffix}`;
                    })
                    .join('\n');

            const rootEventSuffix = lastEvent
              ? ` — last event: "${lastEvent.text}"`
              : '';

            return [
              `Root task #${task.id}: [${task.status.toUpperCase()}] ${task.title}${rootEventSuffix}`,
              childLines,
            ].join('\n');
          })
          .join('\n\n');

  return `You are the Browser Master AI for an automated browser task system.

## Current tasks
${taskContext}

## User message
"${userMessage}"

## Your job
Decide what to do based on the user message and current task state.

## Decision rules
- If the user's intent is CLEAR, decide to ACT immediately.
- If the user's intent is AMBIGUOUS (could match multiple tasks, or unclear whether to create new vs resume), decide to CLARIFY.
- ALWAYS ask (CLARIFY) before creating a new task when there are already active/waiting tasks that could match.
- ALWAYS ask (CLARIFY) before resuming when multiple waiting tasks could match the user's message.
- ALWAYS ask (CLARIFY) before repeating a completed/failed task.

## Clear intent examples (ACT)
- "continue the linkedin one" → RESUME specific waiting task
- "stop the instagram task" → STOP specific task
- "publish my new blog post to X and LinkedIn" → CREATE_NEW (clearly a new task)

## Ambiguous intent examples (CLARIFY)
- "do that again" → unclear which task to repeat
- "I logged in" → unclear which site if multiple are waiting
- "post this now" → unclear if new or resume

## Output format
Output ONLY valid JSON. No markdown, no explanation.

{
  "decision": "CREATE_NEW" | "RESUME" | "STOP" | "CLARIFY" | "NOTHING",
  "task_id": null,
  "question": null,
  "new_root": null
}

For RESUME or STOP: set task_id to the child task id (integer).
For CLARIFY: set question to the clarifying question string (present 2-3 concrete choices when possible).
For CREATE_NEW: set new_root with title, prompt, and sub_tasks array.
For NOTHING: use all nulls.

CREATE_NEW new_root shape:
{
  "title": "short title for the root task",
  "prompt": "full original user prompt",
  "sub_tasks": [
    { "title": "Publish to LinkedIn", "prompt": "specific prompt for this destination" },
    { "title": "Publish to X", "prompt": "specific prompt for this destination" }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Sub-agent prompt
// ---------------------------------------------------------------------------

type BuildSubAgentPromptProps = {
  task: Task;
  tabId: string;
  maxActions: number;
};

export function buildSubAgentSystemPrompt({
  task,
  tabId,
  maxActions,
}: BuildSubAgentPromptProps): string {
  return `You are a browser automation sub-agent. Complete the following task using the browser CLI tools below.

## Your task
Title: ${task.title}
Prompt: ${task.prompt}
Tab ID: ${tabId}
Action budget: ${maxActions} browser actions

## Browser CLI tools (call via bash)
\`\`\`
bun src/cli.ts browser open_tab '{"tab_id":"${tabId}"}'
bun src/cli.ts browser navigate '{"tab_id":"${tabId}","url":"https://example.com"}'
bun src/cli.ts browser snapshot '{"tab_id":"${tabId}"}'
bun src/cli.ts browser click '{"tab_id":"${tabId}","element_id":"e1"}'
bun src/cli.ts browser type '{"tab_id":"${tabId}","element_id":"e1","text":"hello"}'
bun src/cli.ts browser press '{"tab_id":"${tabId}","key":"Enter"}'
bun src/cli.ts browser scroll '{"tab_id":"${tabId}","delta_y":600}'
bun src/cli.ts browser wait '{"tab_id":"${tabId}","text":"Welcome","timeout_ms":5000}'
\`\`\`

## Workflow
1. Start with: \`bun src/cli.ts browser open_tab '{"tab_id":"${tabId}"}'\`
2. Use \`snapshot\` frequently to understand the current page state.
3. Read the snapshot's \`visibleTextSummary\` and \`interactableElements\` to decide next action.
4. Use element \`id\` values from the snapshot for click/type/wait actions.

## Rules
- Do NOT publish or submit anything. Prepare drafts only unless the task explicitly says to publish.
- Leave the browser tab open for user review when done.
- Do not exceed ${maxActions} browser actions total.
- If you encounter a login wall or need user action, stop immediately.

## Completion markers (output in your final response text)
- On success: \`TASK_COMPLETE: <brief summary of what was accomplished>\`
- On login required or user action needed: \`CHECKPOINT_NEEDED: <specific reason, e.g. "LinkedIn login page at linkedin.com/login">\`
- On budget exceeded: \`TASK_FAILED: Exceeded action budget of ${maxActions}\``;
}
