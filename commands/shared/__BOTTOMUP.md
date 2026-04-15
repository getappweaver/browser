---
direct_hash: ac074e83338e04bbb629fd7c669e1e0066ae6ea67a9f5503ace23bbc5c9ec234
subtree_hash: 753dd25cc59fde09ad9c4c79c6fa6931f73be3e0c35c0840ec002e8ab37eb163
files:
  output.ts: 5f7e1615faf1b1afed288c10748ce697291e08dedf5c2631c5410486df464179
  render.ts: ff42a30530b0963a1617d76493ba64bef51b83078abcd764f8da84f868f88cdc
  reply.ts: 9755cb210aae97bbb330d695d78a6a6e22fa1235b594d9fd366af63aed966e9a
  types.ts: 428332e42a19f2a3414157df5db83b59d22e8877cbcc223a5d26d3b2718ea3ae
  variadic-text.ts: a1228c3f6258152323b25c4a44863fe1199d22e09b9211cdf304ded5cc9890b3
children:
---

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
