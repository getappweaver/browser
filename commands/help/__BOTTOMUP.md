---
direct_hash: 881ccea1e12bfd8bf311a9b2ba36efd3d9d195afa489593a18eb11cc7b3c411a
subtree_hash: f38877ee0acecab3b2fa49adbc920c3cd008509ffe84ecc6b11da6f9963b701a
files:
  adapter.ts: ea7c50cf6f418ec15be2d5f88397c83988403a4c0b804c6cb0ecdad1a3b218a3
  module.ts: 44e65b3f742decaedf05089052c8e9aeef060e7a652b1f12543e0de0837b2a93
children:
---

# commands/help

## Purpose
Help command adapter and help text generator for the CLI/browser UI. Adapter bridges plugin lifecycle to help rendering; module generates formatted subcommand usage for the browser.

## Files
- `adapter.ts` - Plugin command adapter that renders help for a given command definition, returning error or formatted message
- `module.ts` - Exports getBrowserHelpLines() and getBrowserCommandDefinition() for browser UI help rendering; formats subcommand usage with arguments and options

## Notes
- Uses command-definition module for schema
- Browser UI reads help via getBrowserHelpLines
