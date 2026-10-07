// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/runner.ts
// In-process sequential browser step loop.
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';

import type { PluginContext } from '@src/core/plugin';

import {
  getNextPendingChild,
  getTask,
  incrementActionsUsed,
  insertTaskEvent,
  listChildTasks,
  setTaskLastUrl,
  setTaskTabId,
  updateTaskStatus,
} from '../tasks/db';
import { taskUserContext } from '../tasks/thread';
import type { Task } from '../tasks/types';

import { DEFAULT_BROWSER_CONFIG, getBrowserService } from './browser-service';
import { browserPolicyDecision } from './decision-policy';
import {
  notifyCheckpoint,
  notifyRunSummary,
  notifyTaskComplete,
  notifyTaskFailed,
} from './notifications';
import {
  loadBrowserObservations,
  saveBrowserObservation,
} from './observations';
import { getBrowserInferenceSettings } from './settings';

function tabIdForTask(taskId: number): string {
  return `task-${taskId}`;
}

// ---------------------------------------------------------------------------
// Single sub-task step loop
// ---------------------------------------------------------------------------

type RunSubTaskProps = {
  db: Database;
  ctx: PluginContext;
  task: Task;
  resumeContext: string | null;
  abortSignal: AbortSignal | null;
};

async function runSubTask({
  db,
  ctx,
  task,
  resumeContext,
  abortSignal,
}: RunSubTaskProps): Promise<string> {
  try {
    return await runSubTaskSteps({ db, ctx, task, resumeContext, abortSignal });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    if (abortSignal?.aborted) {
      updateTaskStatus({ db, id: task.id, status: 'cancelled' });

      return 'Stopped by user.';
    }

    // Browser launch/recovery and snapshot failures must not leave a task running.
    updateTaskStatus({ db, id: task.id, status: 'waiting' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: `Waiting: Browser run interrupted: ${reason}. Reopen the task to recover its tab.`,
    });

    return notifyCheckpoint({
      sendDm: ctx.sendDm,
      task,
      reason: `Browser run interrupted: ${reason}. Reopen the task to recover its tab.`,
    });
  }
}

async function runSubTaskSteps({
  db,
  ctx,
  task,
  resumeContext,
  abortSignal,
}: RunSubTaskProps): Promise<string> {
  const tabId = task.tab_id ?? tabIdForTask(task.id);
  const service = getBrowserService();
  const config = DEFAULT_BROWSER_CONFIG;
  const settings = getBrowserInferenceSettings(db);
  const history = loadBrowserObservations(db, task.id);
  const repetitions = new Map<string, number>();

  setTaskTabId({ db, id: task.id, tabId });
  updateTaskStatus({ db, id: task.id, status: 'running' });

  insertTaskEvent({
    db,
    task_id: task.id,
    role: 'system',
    kind: 'status',
    text: resumeContext
      ? `Resuming: ${resumeContext}`
      : `Starting: ${task.title}`,
  });

  // Initialise or recover the browser tab.
  const page = resumeContext
    ? await service.findOrRecoverTab(config, tabId, task.last_url)
    : await service.openTab(config, tabId);

  await page.bringToFront();

  let snapshot = await service.snapshot(config, tabId);

  if (snapshot.url && snapshot.url !== 'about:blank') {
    setTaskLastUrl({ db, id: task.id, lastUrl: snapshot.url });
  }

  let feedback = resumeContext
    ? `Resumed. User message: ${resumeContext}\nCurrent page: ${snapshot.url}`
    : `Browser tab opened. Current page: ${snapshot.url}`;

  const remainingBudget = task.max_actions - task.actions_used;

  for (let step = 1; step <= remainingBudget; step++) {
    abortSignal?.throwIfAborted();

    const { decision, trace } = await browserPolicyDecision({
      ctx,
      task,
      feedback,
      snapshot,
      userContext: taskUserContext(db, task.id),
      history,
      settings,
      abortSignal,
    });

    abortSignal?.throwIfAborted();

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'message',
      text: `Step ${step} decision: ${trace}`,
    });

    if (decision.type === 'final') {
      if (!service.isTabOpen(tabId)) {
        throw new Error('The task browser tab was closed.');
      }

      updateTaskStatus({ db, id: task.id, status: 'completed' });

      insertTaskEvent({
        db,
        task_id: task.id,
        role: 'system',
        kind: 'status',
        text: `Completed: ${decision.message}`,
      });

      return notifyTaskComplete({
        sendDm: ctx.sendDm,
        task,
        summary: decision.message,
      });
    }

    if (decision.type === 'prompt_user') {
      // Verify the handoff still has a live tab after the AI call.
      const handoffPage = await service.findOrRecoverTab(
        config,
        tabId,
        snapshot.url,
      );

      await handoffPage.bringToFront();
      snapshot = await service.snapshot(config, tabId);

      if (snapshot.url !== 'about:blank') {
        setTaskLastUrl({ db, id: task.id, lastUrl: snapshot.url });
      }

      updateTaskStatus({ db, id: task.id, status: 'waiting' });

      insertTaskEvent({
        db,
        task_id: task.id,
        role: 'system',
        kind: 'status',
        text: `Waiting: ${decision.message}`,
      });

      return notifyCheckpoint({
        sendDm: ctx.sendDm,
        task,
        reason: decision.message,
      });
    }

    // Execute browser action in-process.
    let dispatched = false;
    try {
      if (!service.isTabOpen(tabId)) {
        throw new Error('The task browser tab was closed.');
      }

      await service.validateActionTarget({
        tabId,
        documentId: snapshot.documentId,
        action: decision.action,
      });

      abortSignal?.throwIfAborted();

      const signature = JSON.stringify({
        document: snapshot.documentId,
        action: decision.action,
      });

      const count = (repetitions.get(signature) ?? 0) + 1;
      repetitions.set(signature, count);

      if (count > 3) {
        throw new Error(
          'Repeated browser action detected. Inspect the page before continuing.',
        );
      }

      insertTaskEvent({
        db,
        task_id: task.id,
        role: 'system',
        kind: 'message',
        text: `Step ${step} dispatch: ${decision.action.type}${'elementId' in decision.action ? ` ${decision.action.elementId}` : ''}`,
      });

      const before = snapshot;
      incrementActionsUsed(db, task.id);
      dispatched = true;

      const actionResult = await service.runAction(
        config,
        tabId,
        decision.action,
      );

      snapshot = actionResult.snapshot;
      const changed = JSON.stringify(before) !== JSON.stringify(snapshot);

      history.push({
        action: actionResult.summary,
        changed,
        page: {
          url: snapshot.url,
          title: snapshot.title,
          text: snapshot.visibleTextSummary,
        },
      });

      saveBrowserObservation({
        db,
        taskId: task.id,
        observation: history.at(-1)!,
      });

      if (history.length > 10) {
        history.shift();
      }

      if (snapshot.url && snapshot.url !== 'about:blank') {
        setTaskLastUrl({ db, id: task.id, lastUrl: snapshot.url });
      }

      const actionLine = decision.comment
        ? `${actionResult.summary} (${decision.comment})`
        : actionResult.summary;

      insertTaskEvent({
        db,
        task_id: task.id,
        role: 'assistant',
        kind: 'message',
        text: `Step ${step}: ${actionLine}`,
      });

      feedback = `Last action executed: ${actionLine}. ${changed ? 'Page changed.' : 'No observed page change.'}`;
      abortSignal?.throwIfAborted();

      if (
        history.slice(-3).length === 3 &&
        history.slice(-3).every((action) => !action.changed)
      ) {
        throw new Error(
          'Three actions produced no observed page change. Inspect the page before continuing.',
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      feedback = `Last action failed: ${reason}`;

      // A closed browser is recovered on the next explicit user continuation,
      // not replaced by an unnoticed blank tab in the middle of a run.
      if (
        dispatched ||
        !service.isTabOpen(tabId) ||
        reason.startsWith('Repeated browser action')
      ) {
        throw error;
      }

      snapshot = await service.snapshot(config, tabId);

      insertTaskEvent({
        db,
        task_id: task.id,
        role: 'system',
        kind: 'message',
        text: `Step ${step} error: ${reason}`,
      });
    }
  }

  // Budget exhausted.
  const reason = `Exceeded action budget of ${task.max_actions}.`;

  updateTaskStatus({ db, id: task.id, status: 'failed' });

  insertTaskEvent({
    db,
    task_id: task.id,
    role: 'system',
    kind: 'status',
    text: `Failed: ${reason}`,
  });

  return notifyTaskFailed({ sendDm: ctx.sendDm, task, reason });
}

// ---------------------------------------------------------------------------
// Sequential orchestration loop (unchanged contract)
// ---------------------------------------------------------------------------

type ExecuteSequentialLoopProps = {
  db: Database;
  ctx: PluginContext;
  rootTaskId: number;
  resumeTaskId: number | null;
  resumeContext: string | null;
  abortSignal: AbortSignal | null;
};

export async function executeSequentialLoop({
  db,
  ctx,
  rootTaskId,
  resumeTaskId,
  resumeContext,
  abortSignal,
}: ExecuteSequentialLoopProps): Promise<string> {
  if (resumeTaskId !== null) {
    const taskToResume = getTask(db, resumeTaskId);

    if (taskToResume && taskToResume.status === 'waiting') {
      await runSubTask({
        db,
        ctx,
        task: taskToResume,
        resumeContext,
        abortSignal,
      });
    }
  }

  let next = getNextPendingChild(db, rootTaskId);

  while (next !== null) {
    if (abortSignal?.aborted) {
      break;
    }

    await runSubTask({ db, ctx, task: next, resumeContext: null, abortSignal });
    next = getNextPendingChild(db, rootTaskId);
  }

  const children = listChildTasks(db, rootTaskId);
  const completed = children.filter((t) => t.status === 'completed');
  const waiting = children.filter((t) => t.status === 'waiting');
  const failed = children.filter((t) => t.status === 'failed');

  if (completed.length > 0 || waiting.length > 0 || failed.length > 0) {
    return notifyRunSummary({ sendDm: ctx.sendDm, completed, waiting, failed });
  }

  return '';
}
