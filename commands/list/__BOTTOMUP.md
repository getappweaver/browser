---
direct_hash: 4e54209e5c4985daad62bc915c8f5109b719737752d8a94c1906785bbe2635e9
subtree_hash: 544eac979d4819838ad624abd5430251862ab081cf9a2858f762f5272827fe3c
files:
  adapter.ts: 89ea7b3435f59314a64dbadbc8ddf7e6ff2ebdd3b5aa01807bc75cdc9d53dc40
  definition.ts: 1d4560879fb28ed20ed8a312a563d0da168a9dc4d4111e1503b79b588f3bbf20
  handler.ts: da848f656c07595321a9ef996daddc5a7d3c55a0601b82e1d7f8b9d2d0ab2c55
children:
  renderers: f9bfeecca01c1413917e98036458cc07c8c078fbaad1a8f614cb17014243fed2
---

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
