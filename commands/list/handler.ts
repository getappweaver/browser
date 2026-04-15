import type { Database } from 'bun:sqlite';

import {
  getLastTaskEvent,
  listChildTasks,
  listRootTasks,
} from '../../tasks/db';
import type { Task, TaskEvent } from '../../tasks/types';

export type TaskWithContext = {
  root: Task;
  lastRootEvent: TaskEvent | null;
  children: Array<{
    task: Task;
    lastEvent: TaskEvent | null;
  }>;
};

type HandleListCommandResult = {
  tasks: TaskWithContext[];
};

export function handleListCommand(params: {
  db: Database;
}): HandleListCommandResult {
  const roots = listRootTasks(params.db);

  const tasks: TaskWithContext[] = roots.map((root) => {
    const children = listChildTasks(params.db, root.id);

    return {
      root,
      lastRootEvent: getLastTaskEvent(params.db, root.id),
      children: children.map((child) => ({
        task: child,
        lastEvent: getLastTaskEvent(params.db, child.id),
      })),
    };
  });

  return { tasks };
}
