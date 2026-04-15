// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/notifications.ts
// DM notification helpers for browser task events.
// ---------------------------------------------------------------------------

import type { SendReplyFn } from '@src/core/plugin';

import type { Task } from '../tasks/types';

type NotifyCheckpointProps = {
  sendDm: SendReplyFn;
  task: Task;
  reason: string;
};

export async function notifyCheckpoint({
  sendDm,
  task,
  reason,
}: NotifyCheckpointProps): Promise<void> {
  await sendDm(
    `[browser] "${task.title}" is waiting for your input.\n\nReason: ${reason}\n\nThe browser tab is open — please take the required action there and then let me know when you're ready to continue.`,
  );
}

type NotifyTaskCompleteProps = {
  sendDm: SendReplyFn;
  task: Task;
  summary: string;
};

export async function notifyTaskComplete({
  sendDm,
  task,
  summary,
}: NotifyTaskCompleteProps): Promise<void> {
  await sendDm(`[browser] "${task.title}" is done.\n\n${summary}`);
}

type NotifyTaskFailedProps = {
  sendDm: SendReplyFn;
  task: Task;
  reason: string;
};

export async function notifyTaskFailed({
  sendDm,
  task,
  reason,
}: NotifyTaskFailedProps): Promise<void> {
  await sendDm(
    `[browser] "${task.title}" failed.\n\nReason: ${reason}\n\nYou can retry with /browser run or ask me to skip this task.`,
  );
}

type NotifyRunSummaryProps = {
  sendDm: SendReplyFn;
  completed: Task[];
  waiting: Task[];
  failed: Task[];
};

export async function notifyRunSummary({
  sendDm,
  completed,
  waiting,
  failed,
}: NotifyRunSummaryProps): Promise<void> {
  const lines: string[] = ['[browser] Execution pass complete.\n'];

  if (completed.length > 0) {
    lines.push(
      `Done (${completed.length}): ${completed.map((t) => t.title).join(', ')}`,
    );
  }

  if (waiting.length > 0) {
    lines.push(
      `Waiting for your input (${waiting.length}): ${waiting.map((t) => t.title).join(', ')}`,
    );
  }

  if (failed.length > 0) {
    lines.push(
      `Failed (${failed.length}): ${failed.map((t) => t.title).join(', ')}`,
    );
  }

  await sendDm(lines.join('\n'));
}
