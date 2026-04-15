---
direct_hash: aae5a71db7cd42382ef749f87ca847684d9d4a517cc8235f53ea31bd492c3577
subtree_hash: bc4a1fc3af8fb0662b3aba5a1802dc4afe5d20d6528d3d5791737d4a86f9b293
files:
children:
  help: f38877ee0acecab3b2fa49adbc920c3cd008509ffe84ecc6b11da6f9963b701a
  list: 544eac979d4819838ad624abd5430251862ab081cf9a2858f762f5272827fe3c
  run: fb036980dfc0da9f1ade6443eabcd2e18845cc1aaf07988c8db40f50af6a8c01
  shared: 753dd25cc59fde09ad9c4c79c6fa6931f73be3e0c35c0840ec002e8ab37eb163
---

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
