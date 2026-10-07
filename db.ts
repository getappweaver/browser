// ---------------------------------------------------------------------------
// plugins/browser/db.ts — open SQLite + run migrations
// ---------------------------------------------------------------------------

import { join } from 'path';

import { Database } from 'bun:sqlite';

import { createBrowserObservationsTable } from './orchestrator/observations';
import { createBrowserSettingsTable } from './orchestrator/settings';
import {
  createTaskEventsTable,
  createTasksTable,
  normalizeStaleRunningTasks,
} from './tasks/db';
import { createRunsTable } from './tasks/thread';

export function openDb(): Database {
  const db = new Database(join(import.meta.dir, 'db.sqlite'), {
    strict: true,
  });

  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode=WAL');
  createTasksTable(db);
  createTaskEventsTable(db);
  createRunsTable(db);
  createBrowserSettingsTable(db);
  createBrowserObservationsTable(db);
  normalizeStaleRunningTasks(db);

  return db;
}
