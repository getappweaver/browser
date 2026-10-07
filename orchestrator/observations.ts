import type { Database } from 'bun:sqlite';

import type { RecentBrowserAction } from './decision-policy';

export function createBrowserObservationsTable(db: Database): void {
  db.run(
    'CREATE TABLE IF NOT EXISTS browser_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, payload TEXT NOT NULL)',
  );
}

export function loadBrowserObservations(
  db: Database,
  taskId: number,
): RecentBrowserAction[] {
  const rows = db
    .query(
      'SELECT payload FROM browser_observations WHERE task_id = ? ORDER BY id DESC LIMIT 10',
    )
    .all(taskId) as { payload: string }[];

  return rows
    .reverse()
    .map((row) => JSON.parse(row.payload) as RecentBrowserAction);
}

type SaveBrowserObservationProps = {
  db: Database;
  taskId: number;
  observation: RecentBrowserAction;
};
export function saveBrowserObservation({
  db,
  taskId,
  observation,
}: SaveBrowserObservationProps): void {
  db.run('INSERT INTO browser_observations (task_id, payload) VALUES (?, ?)', [
    taskId,
    JSON.stringify(observation),
  ]);
}
