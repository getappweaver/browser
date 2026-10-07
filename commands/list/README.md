# commands/list

## Purpose
List command implementation for browsing tasks. Adapter delegates to handler to fetch root/child tasks from DB, then renders via text renderer for browser output. Definition provides subcommand metadata.

## Files
- `adapter.ts` - Entry point: adapts list command, calls handler to get tasks, renders via text renderer, returns BrowserReplyMessage
- `definition.ts` - Subcommand definition with name, summary, and example usage for CLI registration
- `handler.ts` - Queries DB for root tasks and their children, fetches last event for each, returns task hierarchy

## Notes
- Task hierarchy includes root tasks and their children with last event data
- Uses shared BrowserReplyMessage pattern for rendering

## Subdirectories
- `renderers/` - Plain-text renderer for task list output with status labels and event previews

## Local modules

- [renderers](renderers/README.md)
