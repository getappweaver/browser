// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/notifications.ts
// DM notification helpers for browser task events.
// All functions send via sendDm AND return the message string so callers
// can surface it inline when the source is not 'nostr'.
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
}: NotifyCheckpointProps): Promise<string> {
  const msg = `[browser] "${task.title}" is waiting for your input.\n\nReason: ${reason}\n\nUse Open browser to show or recover the tab. Complete any login directly in the browser, then continue the task. Do not send credentials in chat.`;

  await sendDm(msg).catch(() => undefined);

  return msg;
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
}: NotifyTaskCompleteProps): Promise<string> {
  const msg = `[browser] "${task.title}" is done.\n\n${summary}`;

  await sendDm(msg).catch(() => undefined);

  return msg;
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
}: NotifyTaskFailedProps): Promise<string> {
  const msg = `[browser] "${task.title}" failed.\n\nReason: ${reason}\n\nYou can retry with /browser run or ask me to skip this task.`;

  await sendDm(msg).catch(() => undefined);

  return msg;
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
}: NotifyRunSummaryProps): Promise<string> {
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

  const msg = lines.join('\n');

  await sendDm(msg).catch(() => undefined);

  return msg;
}
