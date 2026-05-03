import type { Database } from 'bun:sqlite';

import { clearAllTasks } from '../../tasks/db';

type HandleClearCommandProps = {
  db: Database;
};

export function handleClearCommand({ db }: HandleClearCommandProps): string {
  const { tasks, events } = clearAllTasks(db);

  if (tasks === 0) {
    return 'No tasks to clear.';
  }

  return `Cleared ${tasks} task${tasks !== 1 ? 's' : ''} and ${events} event${events !== 1 ? 's' : ''}.`;
}
