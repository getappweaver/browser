import type { Database } from 'bun:sqlite';
import { z } from 'zod';

import { getOutputString } from '@src/backends/types';
import type { PluginContext } from '@src/core/plugin';
import { dmBotRoot } from '@src/paths';

import {
  createChildTask,
  createRootTask,
  getTask,
  insertTaskEvent,
  listChildTasks,
  setTaskSessionId,
} from '../tasks/db';
import { setTaskLastUrl, setTaskTabId } from '../tasks/db';
import { threadEvents, taskUserContext } from '../tasks/thread';

import { DEFAULT_BROWSER_CONFIG, getBrowserService } from './browser-service';
import {
  beginConversation,
  conversationSignal,
  endConversation,
  executeTaskPass,
  isTaskBusy,
  stopExecution,
  taskRootId,
} from './executions';

type WorkspaceActionProps = {
  db: Database;
  ctx: PluginContext;
  action: string;
  id: number | null;
  message: string;
};

export type WorkspaceActionResult = { rootId: number; notice: string | null };

function launchPass(props: Parameters<typeof executeTaskPass>[0]): void {
  void executeTaskPass(props).catch((error: unknown) => {
    insertTaskEvent({
      db: props.db,
      task_id: props.rootTaskId,
      role: 'system',
      kind: 'status',
      text: `Execution error: ${String(error)}`,
    });
  });
}

const conversationDecision = z.object({
  decision: z.enum(['REPLY', 'CONTINUE', 'ADD_STEP']),
  message: z.string().min(1),
  task_id: z.number().int().positive().nullable(),
  prompt: z.string().min(1).nullable(),
});

type ConversationProps = {
  db: Database;
  ctx: PluginContext;
  rootId: number;
  message: string;
};

async function converse({
  db,
  ctx,
  rootId,
  message,
}: ConversationProps): Promise<void> {
  let next: { taskId: number | null; context: string | null } | null = null;
  try {
    const root = getTask(db, rootId)!;
    const children = listChildTasks(db, rootId);
    const history = threadEvents(db, rootId).slice(-60);
    const controller = new AbortController();
    const signal = conversationSignal(rootId);
    const timer = setTimeout(() => controller.abort(), 60000);

    const result = await ctx.agent
      .run({
        prompt: `You manage ONE browser task conversation: #${rootId} ${root.title}.
Original request: ${root.prompt}
Steps: ${JSON.stringify(children.map((task) => ({ id: task.id, title: task.title, status: task.status, url: task.last_url })))}
Persisted timeline: ${JSON.stringify(history)}
Persisted user instructions and pasted reference documents: ${taskUserContext(db, rootId)}
User message: ${message}
Return ONLY JSON {"decision":"REPLY"|"CONTINUE"|"ADD_STEP","message":"reply","task_id":null,"prompt":null}.
REPLY answers questions or asks clarification without browser automation.
CONTINUE requires an explicit request to continue or confirmation that a manual checkpoint is done. Set task_id to a waiting child from the listed steps. If multiple waiting children could match, REPLY with a question.
If a waiting step requested reference documents and the user now supplies their text, use CONTINUE for that step. The browser worker receives all persisted user messages, including those documents. If the provided text is incomplete, ask for the missing part instead. Do not ask for files whose contents have already been supplied.
ADD_STEP adds follow-up work to this same task, including after completion. Set prompt to the specific execution instruction; task_id is null. Only do this for clear requests to perform new work. Never repeat old completed work implicitly.
Login/signup, passwords, verification codes, and CAPTCHA must be completed by the user directly in the browser. Never request credentials in chat. Do not call tools, browse, or modify files. Your JSON is routed by the task controller.`,
        sessionId: root.session_id,
        workspaceTarget: null,
        cwd: dmBotRoot,
        onAgentStreamChunk: null,
        abortSignal: signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal,
        context: {
          runtimeContext: false,
          workspaceInstructions: false,
          agentsInstructions: false,
          extraInstructions:
            'Only return the requested JSON; never execute tools.',
        },
      })
      .finally(() => clearTimeout(timer));

    signal?.throwIfAborted();

    if (result.type === 'error') {
      throw new Error(getOutputString(result));
    }

    if (result.sessionId) {
      setTaskSessionId({ db, id: rootId, sessionId: result.sessionId });
    }

    const raw = getOutputString(result).trim();

    const decision = conversationDecision.parse(
      JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')),
    );

    if (decision.decision === 'CONTINUE') {
      const target = children.find(
        (task) => task.id === decision.task_id && task.status === 'waiting',
      );

      if (!target) {
        throw new Error('Select a waiting step before continuing.');
      }

      next = { taskId: target.id, context: message };
    } else if (decision.decision === 'ADD_STEP') {
      if (!decision.prompt) {
        throw new Error('The follow-up needs an execution instruction.');
      }

      createChildTask({
        db,
        parent_id: rootId,
        title: message.slice(0, 80),
        prompt: decision.prompt,
        max_actions: 50,
      });

      next = { taskId: null, context: null };
    }

    insertTaskEvent({
      db,
      task_id: rootId,
      role: 'assistant',
      kind: 'message',
      text: decision.message,
    });
  } catch (error) {
    insertTaskEvent({
      db,
      task_id: rootId,
      role: 'assistant',
      kind: 'message',
      text: `Could not process this message: ${error instanceof Error ? error.message : String(error)}. Please try again.`,
    });
  } finally {
    endConversation(rootId);
  }

  if (next) {
    launchPass({
      db,
      ctx,
      rootTaskId: rootId,
      resumeTaskId: next.taskId,
      resumeContext: next.context,
    });
  }
}

export async function workspaceAction({
  db,
  ctx,
  action,
  id,
  message,
}: WorkspaceActionProps): Promise<WorkspaceActionResult> {
  if (action === 'new') {
    if (!message.trim()) {
      throw new Error('Describe the browser task first.');
    }

    const root = createRootTask({
      db,
      title: message.trim().slice(0, 80),
      prompt: message.trim(),
    });

    insertTaskEvent({
      db,
      task_id: root.id,
      role: 'user',
      kind: 'message',
      text: message.trim(),
    });

    createChildTask({
      db,
      parent_id: root.id,
      title: root.title,
      prompt: root.prompt,
      max_actions: 50,
    });

    launchPass({
      db,
      ctx,
      rootTaskId: root.id,
      resumeTaskId: null,
      resumeContext: null,
    });

    return { rootId: root.id, notice: null };
  }

  if (id === null || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Select a valid task ID.');
  }

  const rootId = taskRootId(db, id);

  if (action === 'task') {
    return { rootId, notice: null };
  }

  if (action === 'stop') {
    stopExecution(db, rootId);

    return { rootId, notice: 'Stopping automation. Browser tabs remain open.' };
  }

  if (isTaskBusy(rootId)) {
    return {
      rootId,
      notice:
        'This task is busy. Wait for the current execution or reply to finish.',
    };
  }

  if (action === 'open') {
    const selected = getTask(db, id)!;
    const children = listChildTasks(db, rootId);
    const waiting = children.filter((task) => task.status === 'waiting');

    if (selected.parent_id === null && waiting.length > 1) {
      return {
        rootId,
        notice: 'Choose a checkpoint’s Open browser action to select its tab.',
      };
    }

    const target =
      selected.parent_id !== null
        ? selected
        : (waiting[0] ??
          children.findLast((task) => task.tab_id || task.last_url) ??
          children.at(-1));

    if (!target) {
      return { rootId, notice: 'This task has no browser step yet.' };
    }

    const service = getBrowserService();
    const tabId = target.tab_id ?? `task-${target.id}`;
    try {
      const page = await service.findOrRecoverTab(
        DEFAULT_BROWSER_CONFIG,
        tabId,
        target.last_url,
      );

      await page.bringToFront();
      const snapshot = await service.snapshot(DEFAULT_BROWSER_CONFIG, tabId);
      setTaskTabId({ db, id: target.id, tabId });

      if (snapshot.url !== 'about:blank') {
        setTaskLastUrl({ db, id: target.id, lastUrl: snapshot.url });
      }

      return {
        rootId,
        notice: `Browser tab is open at ${snapshot.url}. Automation has not been resumed.`,
      };
    } catch (error) {
      const notice = `Could not recover the browser: ${error instanceof Error ? error.message : String(error)}. Task state is unchanged.`;

      insertTaskEvent({
        db,
        task_id: rootId,
        role: 'system',
        kind: 'message',
        text: notice,
      });

      return { rootId, notice };
    }
  }

  if (action === 'continue') {
    const selected = getTask(db, id)!;

    const waiting =
      selected.parent_id === null
        ? listChildTasks(db, rootId).filter((task) => task.status === 'waiting')
        : selected.status === 'waiting'
          ? [selected]
          : [];

    if (waiting.length !== 1) {
      return { rootId, notice: 'Choose the waiting step to continue.' };
    }

    const target = waiting[0]!;

    const text =
      'I have completed the manual checkpoint. Continue using the current browser state.';

    insertTaskEvent({
      db,
      task_id: target.id,
      role: 'user',
      kind: 'message',
      text,
    });

    launchPass({
      db,
      ctx,
      rootTaskId: rootId,
      resumeTaskId: target.id,
      resumeContext: text,
    });

    return { rootId, notice: null };
  }

  if (action === 'message') {
    if (!message.trim()) {
      throw new Error('Enter a message first.');
    }

    if (!beginConversation(rootId)) {
      return { rootId, notice: 'This task is busy.' };
    }

    insertTaskEvent({
      db,
      task_id: rootId,
      role: 'user',
      kind: 'message',
      text: message.trim(),
    });

    void converse({ db, ctx, rootId, message: message.trim() });

    return { rootId, notice: null };
  }

  throw new Error(`Unknown task action: ${action}`);
}
