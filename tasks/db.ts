// ---------------------------------------------------------------------------
// plugins/browser/tasks/db.ts — Task and TaskEvent CRUD
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';

import type {
  EventKind,
  EventRole,
  Task,
  TaskEvent,
  TaskStatus,
} from './types';

const DEFAULT_MAX_ACTIONS = 50;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function createTasksTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id    INTEGER REFERENCES tasks(id),
      title        TEXT    NOT NULL,
      prompt       TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending',
      session_id   TEXT,
      tab_id       TEXT,
      max_actions  INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_ACTIONS},
      actions_used INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function createTaskEventsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS task_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id    INTEGER NOT NULL REFERENCES tasks(id),
      role       TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      text       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    title: String(row.title),
    prompt: String(row.prompt),
    status: String(row.status) as TaskStatus,
    session_id: row.session_id === null ? null : String(row.session_id),
    tab_id: row.tab_id === null ? null : String(row.tab_id),
    max_actions: Number(row.max_actions),
    actions_used: Number(row.actions_used),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToEvent(row: Record<string, unknown>): TaskEvent {
  return {
    id: Number(row.id),
    task_id: Number(row.task_id),
    role: String(row.role) as EventRole,
    kind: String(row.kind) as EventKind,
    text: String(row.text),
    created_at: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type CreateRootTaskProps = {
  db: Database;
  title: string;
  prompt: string;
};

export function createRootTask({
  db,
  title,
  prompt,
}: CreateRootTaskProps): Task {
  const info = db.run(
    `INSERT INTO tasks (parent_id, title, prompt) VALUES (NULL, ?, ?)`,
    [title, prompt],
  );

  return getTask(db, Number(info.lastInsertRowid))!;
}

type CreateChildTaskProps = {
  db: Database;
  parent_id: number;
  title: string;
  prompt: string;
  max_actions: number;
};

export function createChildTask({
  db,
  parent_id,
  title,
  prompt,
  max_actions,
}: CreateChildTaskProps): Task {
  const info = db.run(
    `INSERT INTO tasks (parent_id, title, prompt, max_actions) VALUES (?, ?, ?, ?)`,
    [parent_id, title, prompt, max_actions],
  );

  return getTask(db, Number(info.lastInsertRowid))!;
}

export function getTask(db: Database, id: number): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;

  return row ? rowToTask(row) : null;
}

export function listRootTasks(db: Database): Task[] {
  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY created_at DESC`,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToTask);
}

export function listChildTasks(db: Database, parentId: number): Task[] {
  const rows = db
    .prepare(`SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC`)
    .all(parentId) as Record<string, unknown>[];

  return rows.map(rowToTask);
}

export function getNextPendingChild(
  db: Database,
  parentId: number,
): Task | null {
  const row = db
    .prepare(
      `SELECT * FROM tasks WHERE parent_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1`,
    )
    .get(parentId) as Record<string, unknown> | undefined;

  return row ? rowToTask(row) : null;
}

export function listWaitingTasks(db: Database): Task[] {
  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE status = 'waiting' ORDER BY created_at ASC`,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToTask);
}

type UpdateTaskStatusProps = {
  db: Database;
  id: number;
  status: TaskStatus;
};

export function updateTaskStatus({
  db,
  id,
  status,
}: UpdateTaskStatusProps): void {
  db.run(
    `UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, id],
  );
}

type SetTaskSessionIdProps = {
  db: Database;
  id: number;
  sessionId: string;
};

export function setTaskSessionId({
  db,
  id,
  sessionId,
}: SetTaskSessionIdProps): void {
  db.run(
    `UPDATE tasks SET session_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [sessionId, id],
  );
}

type SetTaskTabIdProps = {
  db: Database;
  id: number;
  tabId: string;
};

export function setTaskTabId({ db, id, tabId }: SetTaskTabIdProps): void {
  db.run(
    `UPDATE tasks SET tab_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [tabId, id],
  );
}

export function incrementActionsUsed(db: Database, taskId: number): void {
  db.run(
    `UPDATE tasks SET actions_used = actions_used + 1, updated_at = datetime('now') WHERE id = ?`,
    [taskId],
  );
}

// ---------------------------------------------------------------------------
// Stale task normalization (called on plugin init)
// ---------------------------------------------------------------------------

export function normalizeStaleRunningTasks(db: Database): void {
  const stale = db
    .prepare(`SELECT * FROM tasks WHERE status = 'running'`)
    .all() as Record<string, unknown>[];

  for (const row of stale) {
    const task = rowToTask(row);

    db.run(
      `UPDATE tasks SET status = 'waiting', updated_at = datetime('now') WHERE id = ?`,
      [task.id],
    );

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'system',
      kind: 'status',
      text: 'Task interrupted by restart; awaiting user instruction.',
    });
  }
}

// ---------------------------------------------------------------------------
// Task events
// ---------------------------------------------------------------------------

type InsertTaskEventProps = {
  db: Database;
  task_id: number;
  role: EventRole;
  kind: EventKind;
  text: string;
};

export function insertTaskEvent({
  db,
  task_id,
  role,
  kind,
  text,
}: InsertTaskEventProps): TaskEvent {
  const info = db.run(
    `INSERT INTO task_events (task_id, role, kind, text) VALUES (?, ?, ?, ?)`,
    [task_id, role, kind, text],
  );

  return getTaskEvent(db, Number(info.lastInsertRowid))!;
}

export function getTaskEvent(db: Database, id: number): TaskEvent | null {
  const row = db.prepare('SELECT * FROM task_events WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;

  return row ? rowToEvent(row) : null;
}

export function getTaskEvents(db: Database, taskId: number): TaskEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC`,
    )
    .all(taskId) as Record<string, unknown>[];

  return rows.map(rowToEvent);
}

export function getLastTaskEvent(
  db: Database,
  taskId: number,
): TaskEvent | null {
  const row = db
    .prepare(
      `SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(taskId) as Record<string, unknown> | undefined;

  return row ? rowToEvent(row) : null;
}
