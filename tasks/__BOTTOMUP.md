---
direct_hash: 87f52bb881407fa20214ef4c90ae6bdce56fcd527f8465da5a40e6de3db54791
subtree_hash: 90123061aa207349c447b0550fd1ff55b84f225984e574324d9d6fd3e6ed85e1
files:
  db.ts: 749adc4aeb922c6b1740a8c9c41047bd89c5cf766070e4e95dbdea835e6db8d8
  types.ts: 09e7055066985f2f49d57dd482be5d877e24bd956b14bda121ba3ad6148f414e
children:
---

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
