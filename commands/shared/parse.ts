import { z } from 'zod';

import type { CommandDefinition } from '@src/system/command-definition';
import {
  parseCliInput,
  parseStructuredInput,
  type ParsedCliInvocation,
} from '@src/system/parser-cli';

const webPayload = z.object({
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

type ParseBrowserInvocationProps = {
  command: CommandDefinition;
  args: string[];
  jsonPayload: unknown;
  rawInput: string;
};

export function parseBrowserInvocation({
  command,
  args,
  jsonPayload,
  rawInput,
}: ParseBrowserInvocationProps): ParsedCliInvocation {
  // Structured form values retain Markdown, whitespace, quotes and newlines.
  if (jsonPayload !== null && jsonPayload !== undefined) {
    const payload = webPayload.parse(jsonPayload);

    return parseStructuredInput({
      command,
      subcommand: args[0] ?? '',
      arguments: payload.arguments,
      options: payload.options,
      rawInput,
    });
  }

  const name = args[0]?.toLowerCase();

  const literalStart =
    name === 'message' ? 2 : name === 'new' || name === 'run' ? 1 : null;

  if (literalStart !== null) {
    const tail = args.slice(literalStart);

    // These prompt-only commands have no flags. Their free-text tail is literal.
    return parseCliInput({
      command,
      tokens: [
        ...args.slice(0, literalStart),
        '--',
        ...(tail[0] === '--' ? tail.slice(1) : tail),
      ],
      rawInput,
    });
  }

  return parseCliInput({ command, tokens: args, rawInput });
}
