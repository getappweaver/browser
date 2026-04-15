// ---------------------------------------------------------------------------
// plugins/browser/db.ts — open SQLite + run migrations
// ---------------------------------------------------------------------------

import { join } from 'path';

import { Database } from 'bun:sqlite';

import {
  createTaskEventsTable,
  createTasksTable,
  normalizeStaleRunningTasks,
} from './tasks/db';

export function openDb(): Database {
  const db = new Database(join(import.meta.dir, 'db.sqlite'), {
    strict: true,
  });

  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode=WAL');
  createTasksTable(db);
  createTaskEventsTable(db);
  normalizeStaleRunningTasks(db);

  return db;
}
