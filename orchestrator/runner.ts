// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/runner.ts
// In-process sequential browser step loop.
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';

import { createBackend } from '@src/backends/factory';
import { getOutputString } from '@src/backends/types';
import type { PluginContext } from '@src/core/plugin';
import { dmBotRoot } from '@src/paths';

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
import type { Task } from '../tasks/types';

import { DEFAULT_BROWSER_CONFIG, getBrowserService } from './browser-service';
import {
  notifyCheckpoint,
  notifyRunSummary,
  notifyTaskComplete,
  notifyTaskFailed,
} from './notifications';
import { buildStepPrompt, parseStepDecision } from './prompts';

const MAX_STEP_MS = 60_000;

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
};

async function runSubTask({
  db,
  ctx,
  task,
  resumeContext,
}: RunSubTaskProps): Promise<string> {
  const tabId = tabIdForTask(task.id);
  const service = getBrowserService();
  const config = DEFAULT_BROWSER_CONFIG;
  const { defaults } = ctx;

  const backend = createBackend({
    backendName: defaults.backend,
    dmBotRoot,
    cursorMode: 'ask',
    opencodeAgentName: 'ask',
    attachUrl: process.env.BOT_OPENCODE_SERVE_URL ?? null,
    modelOverride: defaults.model,
    providerName: defaults.provider,
  });

  const sessionId = await backend.createSession(dmBotRoot);

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

  let snapshot = await service.snapshot(config, tabId);

  if (snapshot.url && snapshot.url !== 'about:blank') {
    setTaskLastUrl({ db, id: task.id, lastUrl: snapshot.url });
  }

  let feedback = resumeContext
    ? `Resumed. User message: ${resumeContext}\nCurrent page: ${snapshot.url}`
    : `Browser tab opened. Current page: ${snapshot.url}`;

  void page; // page reference kept alive via service map

  const remainingBudget = task.max_actions - task.actions_used;

  for (let step = 1; step <= remainingBudget; step++) {
    const prompt = buildStepPrompt({
      task,
      step,
      remainingActions: remainingBudget - step + 1,
      feedback,
      snapshot,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), MAX_STEP_MS);

    const result = await backend
      .runMessage({
        sessionId,
        content: prompt,
        cursorMode: 'ask',
        opencodeAgentName: 'ask',
        cwd: dmBotRoot,
        getRoutstrSkKey: ctx.getRoutstrSkKey,
        modelOverride: defaults.model,
        onAgentStreamChunk: null,
        streamAbortSignal: abortController.signal,
      })
      .finally(() => clearTimeout(timeout));

    const raw = getOutputString(result).trim();
    const decision = parseStepDecision(raw);

    if (!decision || result.type === 'error') {
      const reason =
        result.type === 'error'
          ? result.output
          : `Step ${step}: AI response could not be parsed as a valid action.`;

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

    if (decision.type === 'final') {
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
    try {
      const actionResult = await service.runAction(
        config,
        tabId,
        decision.action,
      );

      // Snapshot is free; only count real interactions.
      if (decision.action.type !== 'snapshot') {
        incrementActionsUsed(db, task.id);
      }

      snapshot = actionResult.snapshot;

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

      feedback = `Last action succeeded: ${actionLine}`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      feedback = `Last action failed: ${reason}`;

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
};

export async function executeSequentialLoop({
  db,
  ctx,
  rootTaskId,
  resumeTaskId,
  resumeContext,
}: ExecuteSequentialLoopProps): Promise<string> {
  if (resumeTaskId !== null) {
    const taskToResume = getTask(db, resumeTaskId);

    if (taskToResume && taskToResume.status === 'waiting') {
      await runSubTask({ db, ctx, task: taskToResume, resumeContext });
    }
  }

  let next = getNextPendingChild(db, rootTaskId);

  while (next !== null) {
    await runSubTask({ db, ctx, task: next, resumeContext: null });
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
