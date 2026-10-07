import type { Database } from 'bun:sqlite';

import { getTask } from './db';
import type { TaskEvent } from './types';

export type BrowserRun = {
  id: number;
  root_id: number;
  status: string;
  report: string | null;
  started_at: string;
  finished_at: string | null;
};

export function createRunsTable(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS browser_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_id INTEGER NOT NULL REFERENCES tasks(id),
    status TEXT NOT NULL DEFAULT 'running',
    report TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  )`);

  const interrupted = db
    .query("SELECT id, root_id FROM browser_runs WHERE status = 'running'")
    .all() as { id: number; root_id: number }[];

  db.run(
    "UPDATE browser_runs SET status = 'interrupted', report = 'Execution interrupted by bot restart. Reopen the browser and continue when ready.', finished_at = datetime('now') WHERE status = 'running'",
  );

  for (const run of interrupted) {
    db.run(
      "INSERT INTO task_events (task_id, role, kind, text) VALUES (?, 'assistant', 'message', ?)",
      [
        run.root_id,
        `Execution #${run.id} · interrupted\nExecution interrupted by bot restart. Reopen the browser and continue when ready.`,
      ],
    );
  }
}

export function threadEvents(db: Database, rootId: number): TaskEvent[] {
  return db
    .query(
      `SELECT e.* FROM task_events e JOIN tasks t ON t.id = e.task_id
    WHERE t.id = ? OR t.parent_id = ? ORDER BY e.id`,
    )
    .all(rootId, rootId) as TaskEvent[];
}

export function listRuns(db: Database, rootId: number): BrowserRun[] {
  return db
    .query('SELECT * FROM browser_runs WHERE root_id = ? ORDER BY id')
    .all(rootId) as BrowserRun[];
}

export function taskUserContext(db: Database, taskId: number): string {
  const task = getTask(db, taskId);

  if (!task) {
    return '[]';
  }

  const rootId = task.parent_id ?? task.id;

  return JSON.stringify(
    threadEvents(db, rootId)
      .filter(
        (event) =>
          event.role === 'user' &&
          (event.task_id === rootId || event.task_id === taskId),
      )
      .map((event) => ({ eventId: event.id, text: event.text })),
  );
}
