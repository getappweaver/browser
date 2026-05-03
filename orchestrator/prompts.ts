// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/prompts.ts
// System prompts for the Master AI and per-step browser runner.
// ---------------------------------------------------------------------------

import type { Task, TaskEvent } from '../tasks/types';

import type { BrowserAction, BrowserSnapshot } from './browser-service';

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
// Step prompt + decision parser (in-process browser runner)
// ---------------------------------------------------------------------------

export type StepDecision =
  | { type: 'action'; action: BrowserAction; comment?: string }
  | { type: 'final'; message: string }
  | { type: 'prompt_user'; message: string };

type BuildStepPromptProps = {
  task: Task;
  step: number;
  remainingActions: number;
  feedback: string;
  snapshot: BrowserSnapshot;
};

export function buildStepPrompt({
  task,
  step,
  remainingActions,
  feedback,
  snapshot,
}: BuildStepPromptProps): string {
  return [
    'You are controlling a persistent Playwright browser session to complete a task.',
    'The browser is already running. Decide exactly ONE next step.',
    'Return only valid JSON — no markdown, no prose outside the JSON.',
    '',
    `Task title: ${task.title}`,
    `Task prompt: ${task.prompt}`,
    `Step: ${step} — Actions remaining: ${remainingActions}`,
    '',
    'Allowed response shapes:',
    '{"type":"action","comment":"short reason","action":{"type":"navigate","url":"https://example.com"}}',
    '{"type":"action","comment":"short reason","action":{"type":"snapshot"}}',
    '{"type":"action","comment":"short reason","action":{"type":"click","elementId":"e1"}}',
    '{"type":"action","comment":"short reason","action":{"type":"type","elementId":"e2","text":"hello","clear":true}}',
    '{"type":"action","comment":"short reason","action":{"type":"press","key":"Enter"}}',
    '{"type":"action","comment":"short reason","action":{"type":"scroll","deltaY":700}}',
    '{"type":"action","comment":"short reason","action":{"type":"wait","elementId":"e3","timeoutMs":10000}}',
    '{"type":"action","comment":"short reason","action":{"type":"wait","text":"Welcome","timeoutMs":10000}}',
    '{"type":"final","message":"concise summary of what was accomplished"}',
    '{"type":"prompt_user","message":"Tell the user exactly what manual action is needed, e.g. please log in to LinkedIn then reply when done."}',
    '',
    'Rules:',
    '- Use navigate when a URL is known.',
    '- Use snapshot to refresh page state without interacting.',
    '- Use wait after navigation or actions that trigger loading.',
    '- Use press for keys like Enter, Tab, Escape, ArrowDown.',
    '- Use scroll with deltaY positive for down, negative for up.',
    '- If login, 2FA, or a CAPTCHA is required, return prompt_user immediately.',
    '- Return final when the task is fully complete.',
    '- Do NOT submit or publish anything unless the task explicitly says to.',
    '- Leave the browser tab open when done.',
    '',
    'Latest feedback:',
    feedback,
    '',
    'Current snapshot:',
    JSON.stringify(snapshot, null, 2),
  ].join('\n');
}

export function parseStepDecision(raw: string): StepDecision | null {
  try {
    const json = extractJsonObject(raw);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const type = typeof parsed.type === 'string' ? parsed.type : '';

    if (type === 'final') {
      const message =
        typeof parsed.message === 'string' ? parsed.message.trim() : '';

      return message ? { type: 'final', message } : null;
    }

    if (type === 'prompt_user') {
      const message =
        typeof parsed.message === 'string' ? parsed.message.trim() : '';

      return message ? { type: 'prompt_user', message } : null;
    }

    if (type === 'action') {
      const action = parseBrowserAction(parsed.action);

      const comment =
        typeof parsed.comment === 'string' && parsed.comment.trim()
          ? parsed.comment.trim()
          : undefined;

      return { type: 'action', action, comment };
    }

    return null;
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('No JSON object found in response.');
}

function parseBrowserAction(value: unknown): BrowserAction {
  if (!value || typeof value !== 'object') {
    throw new Error('action must be an object.');
  }

  const a = value as Record<string, unknown>;
  const type = typeof a.type === 'string' ? a.type : '';

  if (type === 'snapshot') {
    return { type: 'snapshot' };
  }

  if (type === 'navigate') {
    const url = typeof a.url === 'string' ? a.url.trim() : '';

    if (!url) {
      throw new Error('navigate requires url.');
    }

    return { type: 'navigate', url };
  }

  if (type === 'click') {
    return {
      type: 'click',
      elementId: requireString(a.elementId, 'click.elementId'),
    };
  }

  if (type === 'type') {
    const text = typeof a.text === 'string' ? a.text : null;

    if (text === null) {
      throw new Error('type requires text.');
    }

    return {
      type: 'type',
      elementId: requireString(a.elementId, 'type.elementId'),
      text,
      clear: typeof a.clear === 'boolean' ? a.clear : true,
    };
  }

  if (type === 'press') {
    return { type: 'press', key: requireString(a.key, 'press.key') };
  }

  if (type === 'scroll') {
    return {
      type: 'scroll',
      deltaX: typeof a.deltaX === 'number' ? a.deltaX : 0,
      deltaY: typeof a.deltaY === 'number' ? a.deltaY : 600,
    };
  }

  if (type === 'wait') {
    return {
      type: 'wait',
      elementId:
        typeof a.elementId === 'string' && a.elementId.trim()
          ? a.elementId.trim()
          : undefined,
      text:
        typeof a.text === 'string' && a.text.trim() ? a.text.trim() : undefined,
      timeoutMs: typeof a.timeoutMs === 'number' ? a.timeoutMs : 10_000,
    };
  }

  throw new Error(`Unsupported action type: ${JSON.stringify(type)}`);
}

function requireString(value: unknown, field: string): string {
  const s = typeof value === 'string' ? value.trim() : '';

  if (!s) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return s;
}
