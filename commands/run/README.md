# commands/run

## Purpose
Implements the 'run' subcommand for browser task execution. Users provide a natural language prompt which flows through adapter -> handler -> orchestrator master decision.

## Files
- `adapter.ts` - CLI adapter: parses variadic prompt args, calls handler, wraps response in BrowserReplyMessage
- `definition.ts` - Defines subcommand schema: name='run', required variadic 'prompt' argument, usage examples
- `handler.ts` - Validates prompt non-empty, delegates to handleMasterDecision in orchestrator module

## Notes
- Entry point is adaptRunCommand in adapter.ts
- Handler delegates to orchestrator/master for actual execution
- Prompt argument is variadic - multiple text segments are joined
