import type { TaskWithContext } from '../handler';

const STATUS_LABEL: Record<string, string> = {
  pending: 'pending',
  running: 'running',
  waiting: 'waiting — needs input',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function renderBrowserListText(params: {
  tasks: TaskWithContext[];
}): string {
  const { tasks } = params;

  if (tasks.length === 0) {
    return 'No browser tasks yet. Use /browser run <prompt> to start one.';
  }

  return tasks
    .map(({ root, lastRootEvent, children }) => {
      const lines: string[] = [];

      const rootStatus = statusLabel(root.status);
      lines.push(`#${root.id} ${root.title} [${rootStatus}]`);

      if (lastRootEvent) {
        lines.push(`  ${lastRootEvent.text}`);
      }

      if (children.length > 0) {
        for (const { task, lastEvent } of children) {
          const childStatus = statusLabel(task.status);
          lines.push(`  • ${task.title} [${childStatus}]`);

          if (lastEvent) {
            const preview =
              lastEvent.text.length > 80
                ? lastEvent.text.slice(0, 77) + '…'
                : lastEvent.text;

            lines.push(`    ${preview}`);
          }
        }
      }

      return lines.join('\n');
    })
    .join('\n\n');
}
