// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/master.ts
// Master AI: interprets user messages, decomposes tasks, manages lifecycle.
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';
import { z } from 'zod';

import { getOutputString } from '@src/backends/types';
import type { PluginContext } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import { dmBotRoot } from '@src/paths';

import {
  createChildTask,
  createRootTask,
  getLastTaskEvent,
  getTask,
  insertTaskEvent,
  listChildTasks,
  listRootTasks,
  listWaitingTasks,
  setTaskLastUrl,
  setTaskTabId,
} from '../tasks/db';
import type { Task } from '../tasks/types';

import { DEFAULT_BROWSER_CONFIG, getBrowserService } from './browser-service';
import {
  executeTaskPass,
  isTaskBusy,
  stopExecution,
  taskRootId,
} from './executions';
import { buildMasterSystemPrompt } from './prompts';

const DEFAULT_MAX_ACTIONS = 50;

// ---------------------------------------------------------------------------
// Master decision schema
// ---------------------------------------------------------------------------

const SubTaskInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
});

const NewRootInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  sub_tasks: z.array(SubTaskInputSchema).min(1),
});

const MasterDecisionSchema = z.object({
  decision: z.enum([
    'CREATE_NEW',
    'RESUME',
    'REOPEN',
    'STOP',
    'CLARIFY',
    'NOTHING',
  ]),
  task_id: z.number().nullable(),
  question: z.string().nullable(),
  new_root: NewRootInputSchema.nullable(),
});

type MasterDecision = z.infer<typeof MasterDecisionSchema>;

// ---------------------------------------------------------------------------
// Task context builder
// ---------------------------------------------------------------------------

function buildTaskSummaries(db: Database) {
  const roots = listRootTasks(db).slice(0, 10);

  return roots.map((root) => {
    const children = listChildTasks(db, root.id);

    return {
      task: root,
      lastEvent: getLastTaskEvent(db, root.id),
      children: children.map((child) => ({
        task: child,
        lastEvent: getLastTaskEvent(db, child.id),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Call the master AI
// ---------------------------------------------------------------------------

type CallMasterAiProps = {
  userMessage: string;
  db: Database;
  ctx: PluginContext;
};

async function callMasterAi({
  userMessage,
  db,
  ctx,
}: CallMasterAiProps): Promise<MasterDecision | null> {
  const taskSummaries = buildTaskSummaries(db);
  const prompt = buildMasterSystemPrompt({ userMessage, taskSummaries });

  const result = await ctx.agent.run({
    prompt,
    sessionId: null,
    workspaceTarget: null,
    cwd: dmBotRoot,
    onAgentStreamChunk: null,
    abortSignal: null,
    context: null,
  });

  const raw = getOutputString(result).trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return MasterDecisionSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execute decision
// ---------------------------------------------------------------------------

type ExecuteDecisionProps = {
  decision: MasterDecision;
  db: Database;
  ctx: PluginContext;
  userMessage: string;
  source: MessageSource;
};

async function executeDecision({
  decision,
  db,
  ctx,
  userMessage,
  source,
}: ExecuteDecisionProps): Promise<string> {
  if (decision.decision === 'NOTHING') {
    return 'No action needed.';
  }

  if (decision.decision === 'CLARIFY' && decision.question) {
    return decision.question;
  }

  if (decision.decision === 'REOPEN' && decision.task_id !== null) {
    const selected = getTask(db, decision.task_id);

    if (!selected) {
      return `Task #${decision.task_id} was not found.`;
    }

    const candidates =
      selected.parent_id === null
        ? listChildTasks(db, selected.id).filter(
            (task) => task.status === 'waiting',
          )
        : selected.status === 'waiting'
          ? [selected]
          : [];

    if (candidates.length !== 1) {
      return candidates.length > 1
        ? `Which waiting task should I reopen? ${candidates.map((task) => `#${task.id}: ${task.title}`).join('; ')}`
        : `Task #${selected.id} has no waiting checkpoint to reopen.`;
    }

    const target = candidates[0]!;

    if (isTaskBusy(target.parent_id ?? target.id)) {
      return 'This task is already busy.';
    }

    const tabId = target.tab_id ?? `task-${target.id}`;
    const service = getBrowserService();
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

      const message = `Browser tab for task #${target.id} is open at ${snapshot.url}. The task is still waiting. Complete login or signup directly in the browser, then reply with “continue task #${target.id}”. Do not send credentials in chat.`;

      insertTaskEvent({
        db,
        task_id: target.id,
        role: 'system',
        kind: 'message',
        text: message,
      });

      return message;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      insertTaskEvent({
        db,
        task_id: target.id,
        role: 'system',
        kind: 'message',
        text: `Browser recovery failed: ${reason}`,
      });

      return `Could not reopen task #${target.id}: ${reason}. The task remains waiting.`;
    }
  }

  if (decision.decision === 'STOP' && decision.task_id !== null) {
    const rootId = taskRootId(db, decision.task_id);
    stopExecution(db, rootId);

    return `Task #${rootId} stopped.`;
  }

  if (decision.decision === 'RESUME' && decision.task_id !== null) {
    const selected = getTask(db, decision.task_id);

    const waitingTasks =
      selected?.parent_id === null
        ? listChildTasks(db, selected.id).filter(
            (task) => task.status === 'waiting',
          )
        : listWaitingTasks(db).filter((task) => task.id === decision.task_id);

    if (waitingTasks.length > 1) {
      return `Which waiting task should I continue? ${waitingTasks.map((task) => `#${task.id}: ${task.title}`).join('; ')}`;
    }

    const target = waitingTasks[0];

    if (!target) {
      return `Task #${decision.task_id} is not in waiting state.`;
    }

    const taskId = target.id;

    insertTaskEvent({
      db,
      task_id: taskId,
      role: 'user',
      kind: 'message',
      text: userMessage,
    });

    const parentId = target.parent_id;

    if (parentId === null) {
      return `Task #${taskId} has no parent — cannot resume.`;
    }

    const resumeLoopPromise = executeTaskPass({
      db,
      ctx,
      rootTaskId: parentId,
      resumeTaskId: taskId,
      resumeContext: userMessage,
    });

    if (source === 'nostr') {
      void resumeLoopPromise;

      return `Resuming "${target.title}"…`;
    }

    const resumeResult = await resumeLoopPromise;

    return [`Resuming "${target.title}"…`, resumeResult]
      .filter(Boolean)
      .join('\n\n');
  }

  if (decision.decision === 'CREATE_NEW' && decision.new_root !== null) {
    const { title, prompt, sub_tasks } = decision.new_root;

    const rootTask: Task = createRootTask({ db, title, prompt });

    insertTaskEvent({
      db,
      task_id: rootTask.id,
      role: 'user',
      kind: 'message',
      text: userMessage,
    });

    for (const sub of sub_tasks) {
      createChildTask({
        db,
        parent_id: rootTask.id,
        title: sub.title,
        prompt: sub.prompt,
        max_actions: DEFAULT_MAX_ACTIONS,
      });
    }

    const subList = sub_tasks.map((s) => `  • ${s.title}`).join('\n');
    const startingMsg = `Starting "${title}" with ${sub_tasks.length} sub-task${sub_tasks.length > 1 ? 's' : ''}:\n${subList}`;

    const loopPromise = executeTaskPass({
      db,
      ctx,
      rootTaskId: rootTask.id,
      resumeTaskId: null,
      resumeContext: null,
    });

    if (source === 'nostr') {
      void loopPromise;

      return `${startingMsg}\n\nI'll notify you as each one completes or if any need your input.`;
    }

    const loopResult = await loopPromise;

    return [startingMsg, loopResult].filter(Boolean).join('\n\n');
  }

  return 'Could not determine what to do. Try being more specific.';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

type HandleMasterDecisionProps = {
  db: Database;
  ctx: PluginContext;
  userMessage: string;
  source: MessageSource;
};

export async function handleMasterDecision({
  db,
  ctx,
  userMessage,
  source,
}: HandleMasterDecisionProps): Promise<string> {
  const taskNumber = userMessage.trim().match(/^#?(\d+)$/);

  const explicitTask = userMessage
    .trim()
    .match(/^(reopen|open|show|continue|resume)\s+(?:task\s+)?#?(\d+)$/i);

  const decision: MasterDecision | null = taskNumber
    ? {
        decision: 'REOPEN',
        task_id: Number(taskNumber[1]),
        question: null,
        new_root: null,
      }
    : explicitTask
      ? {
          decision: /^(continue|resume)$/i.test(explicitTask[1]!)
            ? 'RESUME'
            : 'REOPEN',
          task_id: Number(explicitTask[2]),
          question: null,
          new_root: null,
        }
      : await callMasterAi({ userMessage, db, ctx });

  if (!decision) {
    return 'Sorry, I could not parse a decision from the AI. Please try rephrasing.';
  }

  return executeDecision({ decision, db, ctx, userMessage, source });
}
