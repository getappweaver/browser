// ---------------------------------------------------------------------------
// plugins/browser/ai.ts — Browser CLI tools exposed to sub-agents
//
// Sub-agents call: bun src/cli.ts browser <toolName> '<json>'
// These tools interact with the plugin-owned BrowserService singleton.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { openDb } from './db';
import {
  DEFAULT_BROWSER_CONFIG,
  getBrowserService,
  type BrowserAction,
} from './orchestrator/browser-service';
import { incrementActionsUsed } from './tasks/db';

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const TabIdInput = z.object({ tab_id: z.string().min(1) });

const OpenTabCallSchema = z.object({
  type: z.literal('open_tab'),
  input: TabIdInput,
});

const NavigateCallSchema = z.object({
  type: z.literal('navigate'),
  input: z.object({
    tab_id: z.string().min(1),
    url: z.string().min(1),
  }),
});

const SnapshotCallSchema = z.object({
  type: z.literal('snapshot'),
  input: TabIdInput,
});

const ClickCallSchema = z.object({
  type: z.literal('click'),
  input: z.object({
    tab_id: z.string().min(1),
    element_id: z.string().min(1),
  }),
});

const TypeCallSchema = z.object({
  type: z.literal('type'),
  input: z.object({
    tab_id: z.string().min(1),
    element_id: z.string().min(1),
    text: z.string(),
    clear: z.boolean().optional(),
  }),
});

const PressCallSchema = z.object({
  type: z.literal('press'),
  input: z.object({
    tab_id: z.string().min(1),
    key: z.string().min(1),
  }),
});

const ScrollCallSchema = z.object({
  type: z.literal('scroll'),
  input: z.object({
    tab_id: z.string().min(1),
    delta_x: z.number().optional(),
    delta_y: z.number().optional(),
  }),
});

const WaitCallSchema = z.object({
  type: z.literal('wait'),
  input: z.object({
    tab_id: z.string().min(1),
    element_id: z.string().optional(),
    text: z.string().optional(),
    timeout_ms: z.number().optional(),
  }),
});

const CloseTabCallSchema = z.object({
  type: z.literal('close_tab'),
  input: TabIdInput,
});

export const BrowserToolCallSchema = z.discriminatedUnion('type', [
  OpenTabCallSchema,
  NavigateCallSchema,
  SnapshotCallSchema,
  ClickCallSchema,
  TypeCallSchema,
  PressCallSchema,
  ScrollCallSchema,
  WaitCallSchema,
  CloseTabCallSchema,
]);

export type BrowserToolCall = z.infer<typeof BrowserToolCallSchema>;
export { BrowserToolCallSchema as ToolCallSchema };
export const skillDescription =
  'Browser automation via local dm-bot CLI tools. Use these to control browser tabs, navigate, click, type, and inspect pages.';

// ---------------------------------------------------------------------------
// Task ID helpers
// ---------------------------------------------------------------------------

function taskIdFromTabId(tabId: string): number | null {
  const match = tabId.match(/^task-(\d+)$/);

  return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Execute tool
// ---------------------------------------------------------------------------

type ExecuteToolProps = {
  alias: string;
  prefix: string;
  call: BrowserToolCall;
  db: ReturnType<typeof openDb>;
};

export async function executeTool({
  call,
  db,
}: ExecuteToolProps): Promise<string> {
  const service = getBrowserService();
  const config = DEFAULT_BROWSER_CONFIG;
  const { tab_id } = call.input;

  const taskId = taskIdFromTabId(tab_id);

  if (call.type === 'open_tab') {
    await service.openTab(config, tab_id);

    if (taskId !== null) {
      incrementActionsUsed(db, taskId);
    }

    return `Tab ${tab_id} opened.`;
  }

  if (call.type === 'close_tab') {
    await service.closeTab(tab_id);

    return `Tab ${tab_id} closed.`;
  }

  const action: BrowserAction = (() => {
    if (call.type === 'navigate') {
      return { type: 'navigate', url: call.input.url } as BrowserAction;
    }

    if (call.type === 'snapshot') {
      return { type: 'snapshot' } as BrowserAction;
    }

    if (call.type === 'click') {
      return {
        type: 'click',
        elementId: call.input.element_id,
      } as BrowserAction;
    }

    if (call.type === 'type') {
      return {
        type: 'type',
        elementId: call.input.element_id,
        text: call.input.text,
        clear: call.input.clear,
      } as BrowserAction;
    }

    if (call.type === 'press') {
      return { type: 'press', key: call.input.key } as BrowserAction;
    }

    if (call.type === 'scroll') {
      return {
        type: 'scroll',
        deltaX: call.input.delta_x,
        deltaY: call.input.delta_y,
      } as BrowserAction;
    }

    if (call.type === 'wait') {
      return {
        type: 'wait',
        elementId: call.input.element_id,
        text: call.input.text,
        timeoutMs: call.input.timeout_ms,
      } as BrowserAction;
    }

    throw new Error(`Unsupported tool type: ${JSON.stringify(call)}`);
  })();

  const result = await service.runAction(config, tab_id, action);

  if (taskId !== null && call.type !== 'snapshot') {
    incrementActionsUsed(db, taskId);
  }

  const snapshot = result.snapshot;

  const elementList =
    snapshot.interactableElements.length > 0
      ? snapshot.interactableElements
          .map(
            (el) =>
              `  ${el.id} [${el.tag}${el.role ? `/${el.role}` : ''}]${el.label ? ` "${el.label}"` : ''}${el.text && el.text !== el.label ? ` — ${el.text.slice(0, 60)}` : ''}`,
          )
          .join('\n')
      : '  (none visible)';

  return [
    `${result.summary}`,
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    '',
    'Visible text:',
    snapshot.visibleTextSummary.slice(0, 800),
    '',
    'Interactable elements:',
    elementList,
  ].join('\n');
}

export function agentInstructions(alias: string, _prefix: string): string {
  return `## Browser (${alias} tools)

Use these CLI tools to automate browser tasks:
- \`bun src/cli.ts ${alias} open_tab '{"tab_id":"task-N"}'\` — open a tab
- \`bun src/cli.ts ${alias} navigate '{"tab_id":"task-N","url":"https://..."}\` — navigate
- \`bun src/cli.ts ${alias} snapshot '{"tab_id":"task-N"}'\` — capture page state
- \`bun src/cli.ts ${alias} click '{"tab_id":"task-N","element_id":"eX"}'\` — click
- \`bun src/cli.ts ${alias} type '{"tab_id":"task-N","element_id":"eX","text":"..."}'\` — type
- \`bun src/cli.ts ${alias} press '{"tab_id":"task-N","key":"Enter"}'\` — press key
- \`bun src/cli.ts ${alias} scroll '{"tab_id":"task-N","delta_y":600}'\` — scroll
- \`bun src/cli.ts ${alias} wait '{"tab_id":"task-N","text":"..."}'\` — wait for text

Always call snapshot after each action to get updated element IDs.`;
}

export { openDb };
