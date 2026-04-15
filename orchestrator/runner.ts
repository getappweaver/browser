// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/runner.ts
// Sequential sub-task execution loop.
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
  setTaskSessionId,
  setTaskTabId,
  updateTaskStatus,
} from '../tasks/db';
import type { Task } from '../tasks/types';

import {
  notifyCheckpoint,
  notifyRunSummary,
  notifyTaskComplete,
  notifyTaskFailed,
} from './notifications';
import { buildSubAgentSystemPrompt } from './prompts';

const CHECKPOINT_MARKER = 'CHECKPOINT_NEEDED:';
const COMPLETE_MARKER = 'TASK_COMPLETE:';
const FAILED_MARKER = 'TASK_FAILED:';

function tabIdForTask(taskId: number): string {
  return `task-${taskId}`;
}

function parseMarker(
  output: string,
): { type: 'checkpoint' | 'complete' | 'failed'; message: string } | null {
  const lines = output.split('\n').map((l) => l.trim());

  for (const line of lines) {
    if (line.includes(CHECKPOINT_MARKER)) {
      const idx = line.indexOf(CHECKPOINT_MARKER);

      return {
        type: 'checkpoint',
        message: line.slice(idx + CHECKPOINT_MARKER.length).trim(),
      };
    }

    if (line.includes(COMPLETE_MARKER)) {
      const idx = line.indexOf(COMPLETE_MARKER);

      return {
        type: 'complete',
        message: line.slice(idx + COMPLETE_MARKER.length).trim(),
      };
    }

    if (line.includes(FAILED_MARKER)) {
      const idx = line.indexOf(FAILED_MARKER);

      return {
        type: 'failed',
        message: line.slice(idx + FAILED_MARKER.length).trim(),
      };
    }
  }

  return null;
}

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
}: RunSubTaskProps): Promise<void> {
  const tabId = tabIdForTask(task.id);
  const { defaults } = ctx;

  const backend = createBackend({
    backendName: defaults.backend,
    dmBotRoot,
    mode: defaults.mode,
    attachUrl: process.env.BOT_OPENCODE_SERVE_URL ?? null,
    modelOverride: defaults.model,
    providerName: defaults.provider,
  });

  let sessionId = task.session_id;

  if (!sessionId) {
    sessionId = await backend.createSession(dmBotRoot);
    setTaskSessionId({ db, id: task.id, sessionId });
  }

  setTaskTabId({ db, id: task.id, tabId });
  updateTaskStatus({ db, id: task.id, status: 'running' });

  insertTaskEvent({
    db,
    task_id: task.id,
    role: 'system',
    kind: 'status',
    text: resumeContext
      ? `Resuming: ${resumeContext}`
      : `Starting sub-task: ${task.title}`,
  });

  const prompt = resumeContext
    ? `${buildSubAgentSystemPrompt({ task, tabId, maxActions: task.max_actions - task.actions_used })}\n\n## Resuming\n${resumeContext}`
    : buildSubAgentSystemPrompt({ task, tabId, maxActions: task.max_actions });

  const result = await backend.runMessage({
    sessionId,
    content: prompt,
    mode: defaults.mode,
    cwd: dmBotRoot,
    getRoutstrSkKey: ctx.getRoutstrSkKey,
    modelOverride: defaults.model,
    onAgentStreamChunk: null,
    streamAbortSignal: null,
  });

  const output = getOutputString(result).trim();

  insertTaskEvent({
    db,
    task_id: task.id,
    role: 'assistant',
    kind: 'message',
    text: output.slice(0, 2000),
  });

  incrementActionsUsed(db, task.id);

  const parsed = parseMarker(output);

  if (!parsed || result.type === 'error') {
    const reason =
      result.type === 'error'
        ? result.output
        : 'Sub-agent did not return a completion marker.';

    updateTaskStatus({ db, id: task.id, status: 'failed' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: `Failed: ${reason}`,
    });

    await notifyTaskFailed({ sendDm: ctx.sendDm, task, reason });

    return;
  }

  if (parsed.type === 'complete') {
    updateTaskStatus({ db, id: task.id, status: 'completed' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: `Completed: ${parsed.message}`,
    });

    await notifyTaskComplete({
      sendDm: ctx.sendDm,
      task,
      summary: parsed.message,
    });

    return;
  }

  if (parsed.type === 'checkpoint') {
    updateTaskStatus({ db, id: task.id, status: 'waiting' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: `Waiting: ${parsed.message}`,
    });

    await notifyCheckpoint({
      sendDm: ctx.sendDm,
      task,
      reason: parsed.message,
    });

    return;
  }

  if (parsed.type === 'failed') {
    updateTaskStatus({ db, id: task.id, status: 'failed' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: `Failed: ${parsed.message}`,
    });

    await notifyTaskFailed({
      sendDm: ctx.sendDm,
      task,
      reason: parsed.message,
    });
  }
}

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
}: ExecuteSequentialLoopProps): Promise<void> {
  if (resumeTaskId !== null) {
    const taskToResume = getTask(db, resumeTaskId);

    if (taskToResume && taskToResume.status === 'waiting') {
      await runSubTask({
        db,
        ctx,
        task: taskToResume,
        resumeContext,
      });
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
    await notifyRunSummary({ sendDm: ctx.sendDm, completed, waiting, failed });
  }
}
