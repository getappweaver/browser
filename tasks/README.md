# tasks

## Purpose
Task persistence layer for browser automation. Root tasks hold goals; child tasks are sequential steps executed in a browser tab. Includes event tracking for messages and status changes.

## Files
- `db.ts` - SQLite CRUD for tasks and task_events, including root/child task creation, status transitions, and stale task normalization on startup
- `types.ts` - Zod schemas and inferred TypeScript types for Task, TaskEvent, TaskStatus, EventRole, and EventKind

## Notes
- Tasks can be pending, running, waiting, completed, failed, or cancelled
- Events track messages and status changes per task
- Stale running tasks normalize to waiting on plugin init
