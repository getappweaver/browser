# commands/shared

## Purpose
Shared utilities for browser plugin commands to construct and render standardized messages. Provides schemas for message representations, tone inference, and text rendering.

## Files
- `output.ts` - Schema and factory for message representations with tone and text data
- `render.ts` - Renders `BrowserRenderable` union (HelpRepresentation | MessageRepresentation): dispatches to core help renderer or returns message text directly
- `reply.ts` - Reply factory that auto-infers tone from text prefixes and creates message representations
- `types.ts` - Marker file redirecting to domain types in tasks/types.ts
- `variadic-text.ts` - Utility to flatten variadic CLI arguments into a single string

## Notes
- Message representations are the canonical output format for browser commands
- Domain types are centralized in tasks/types.ts
