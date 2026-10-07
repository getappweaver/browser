# commands

## Purpose
CLI command adapters for browser plugin. Each subdirectory implements a specific subcommand (help, list, run) with shared utilities for message rendering.

## Notes
- Adapter pattern: each command bridges plugin lifecycle to handler
- Handler delegates to service layer, renderer formats output for browser UI

## Subdirectories
- `help/` - Help command adapter and help text generator for the CLI/browser UI. Adapter bridges plugin lifecycle to help rendering; module generates formatted subcommand usage for the browser.
- `list/` - List command implementation for browsing tasks. Adapter delegates to handler to fetch root/child tasks from DB, then renders via text renderer for browser output. Definition provides subcommand metadata.
- `run/` - Implements the 'run' subcommand for browser task execution. Users provide a natural language prompt which flows through adapter -> handler -> orchestrator master decision.
- `shared/` - Shared utilities for browser plugin commands to construct and render standardized messages. Provides schemas for message representations, tone inference, and text rendering.

## Local modules

- [shared](shared/README.md)
- [list](list/README.md)
- [run](run/README.md)
- [help](help/README.md)
