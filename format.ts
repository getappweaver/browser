// ---------------------------------------------------------------------------
// plugins/browser/format.ts — Display helpers for the browser plugin
// ---------------------------------------------------------------------------

import type { Task, TaskStatus } from './tasks/types';

const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '○',
  running: '▶',
  waiting: '⏸',
  completed: '✓',
  failed: '✗',
  cancelled: '—',
};

export function statusIcon(status: TaskStatus): string {
  return STATUS_ICON[status] ?? '?';
}

export function formatTaskOneLiner(task: Task): string {
  return `${statusIcon(task.status)} #${task.id} ${task.title} [${task.status}]`;
}

export function formatTaskDetail(task: Task): string {
  return [
    `ID:      ${task.id}`,
    `Title:   ${task.title}`,
    `Status:  ${task.status}`,
    `Prompt:  ${task.prompt}`,
    task.tab_id ? `Tab:     ${task.tab_id}` : null,
    `Actions: ${task.actions_used}/${task.max_actions}`,
    `Created: ${task.created_at}`,
  ]
    .filter(Boolean)
    .join('\n');
}
