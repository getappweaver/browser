---
direct_hash: 038a56186ecc83b316d60ca086db2a39e06bd351412909acedbd8489074504ef
subtree_hash: f9bfeecca01c1413917e98036458cc07c8c078fbaad1a8f614cb17014243fed2
files:
  text.ts: 6d366fbe897a7d91774eba1eca8017ec024cbc4ea1b40de9be37715793b2e439
children:
---

# commands/list/renderers

## Purpose
Plain-text renderer for the /list command output. Formats task hierarchy (root + children) with status labels and event previews for terminal display.

## Files
- `text.ts` - Renders browser task list as indented plain text with status brackets and truncated event previews

## Notes
- Empty state message guides users to /browser run
- Event text truncated at 80 chars
