# commands/list/renderers

## Purpose
Plain-text renderer for the /list command output. Formats task hierarchy (root + children) with status labels and event previews for terminal display.

## Files
- `text.ts` - Renders browser task list as indented plain text with status brackets and truncated event previews

## Notes
- Empty state message guides users to /browser run
- Event text truncated at 80 chars
