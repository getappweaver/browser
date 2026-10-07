# commands/help

## Purpose
Help command adapter and help text generator for the CLI/browser UI. Adapter bridges plugin lifecycle to help rendering; module generates formatted subcommand usage for the browser.

## Files
- `adapter.ts` - Plugin command adapter that renders help for a given command definition, returning error or formatted message
- `module.ts` - Exports getBrowserHelpLines() and getBrowserCommandDefinition() for browser UI help rendering; formats subcommand usage with arguments and options

## Notes
- Uses command-definition module for schema
- Browser UI reads help via getBrowserHelpLines
