import type { Database } from 'bun:sqlite';

import type { PluginContext } from '@src/core/plugin';

import {
  getTask,
  insertTaskEvent,
  listChildTasks,
  updateTaskStatus,
} from '../tasks/db';
import { threadEvents } from '../tasks/thread';

import { executeSequentialLoop } from './runner';

const active = new Map<number, AbortController>();
const conversations = new Map<number, AbortController>();

export function isTaskBusy(rootId: number): boolean {
  return active.has(rootId) || conversations.has(rootId);
}

export function beginConversation(rootId: number): boolean {
  if (isTaskBusy(rootId)) {
    return false;
  }

  conversations.set(rootId, new AbortController());

  return true;
}

export function endConversation(rootId: number): void {
  conversations.delete(rootId);
}

export function conversationSignal(rootId: number): AbortSignal | null {
  return conversations.get(rootId)?.signal ?? null;
}

export function stopExecution(db: Database, rootId: number): void {
  active.get(rootId)?.abort();
  conversations.get(rootId)?.abort();
  for (const child of listChildTasks(db, rootId)) {
    if (['pending', 'running', 'waiting'].includes(child.status)) {
      updateTaskStatus({ db, id: child.id, status: 'cancelled' });
    }
  }

  insertTaskEvent({
    db,
    task_id: rootId,
    role: 'user',
    kind: 'status',
    text: 'Stopped by user. Browser tabs remain open.',
  });
}

type ExecuteTaskPassProps = {
  db: Database;
  ctx: PluginContext;
  rootTaskId: number;
  resumeTaskId: number | null;
  resumeContext: string | null;
};

export async function executeTaskPass(
  props: ExecuteTaskPassProps,
): Promise<string> {
  const { db, ctx, rootTaskId, resumeTaskId, resumeContext } = props;

  if (isTaskBusy(rootTaskId)) {
    return 'This task is already busy.';
  }

  const controller = new AbortController();
  active.set(rootTaskId, controller);
  const baseline = threadEvents(db, rootTaskId).at(-1)?.id ?? 0;

  const runId = Number(
    db.run('INSERT INTO browser_runs (root_id) VALUES (?)', [rootTaskId])
      .lastInsertRowid,
  );

  insertTaskEvent({
    db,
    task_id: rootTaskId,
    role: 'system',
    kind: 'status',
    text: `Execution #${runId} started.`,
  });

  let result = '';
  let errorText: string | null = null;
  try {
    result = await executeSequentialLoop({
      db,
      ctx,
      rootTaskId,
      resumeTaskId,
      resumeContext,
      abortSignal: controller.signal,
    });
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error);
    for (const child of listChildTasks(db, rootTaskId)) {
      if (child.status === 'running') {
        updateTaskStatus({ db, id: child.id, status: 'waiting' });
      }
    }
  } finally {
    const children = listChildTasks(db, rootTaskId);

    const events = threadEvents(db, rootTaskId).filter(
      (event) => event.id > baseline,
    );

    const outcomes = events.filter((event) =>
      /^(Completed:|Waiting:|Failed:)/.test(event.text),
    );

    const actions = events.filter((event) => /^Step \d+:/.test(event.text));

    const urls = [
      ...new Set(
        children
          .map((task) => task.last_url)
          .filter((url): url is string => Boolean(url)),
      ),
    ];

    const status = controller.signal.aborted
      ? 'stopped'
      : errorText || children.some((task) => task.status === 'failed')
        ? 'failed'
        : children.some((task) => task.status === 'waiting')
          ? 'needs_input'
          : 'completed';

    const report = [
      `Execution #${runId} · ${status.replaceAll('_', ' ')}`,
      `${actions.length} browser actions recorded this pass.`,
      ...outcomes.map((event) => event.text),
      ...(errorText ? [`Interrupted: ${errorText}`] : []),
      ...(actions.length
        ? ['Actions taken:', ...actions.map((event) => event.text)]
        : []),
      ...(urls.length
        ? ['Pages visited / current destinations:', ...urls]
        : []),
    ].join('\n');

    db.run(
      "UPDATE browser_runs SET status = ?, report = ?, finished_at = datetime('now') WHERE id = ?",
      [status, report, runId],
    );

    insertTaskEvent({
      db,
      task_id: rootTaskId,
      role: 'assistant',
      kind: 'message',
      text: report,
    });

    active.delete(rootTaskId);
  }

  return errorText ?? result;
}

export function taskRootId(db: Database, id: number): number {
  const task = getTask(db, id);

  if (!task) {
    throw new Error(`Task #${id} was not found.`);
  }

  return task.parent_id ?? task.id;
}
