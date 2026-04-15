// ---------------------------------------------------------------------------
// plugins/browser/adapter.ts — parse CLI + dispatch to command adapters
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';

import type {
  PluginContext,
  PluginIdentity,
  RunAgentFn,
} from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import { parseCliInput } from '@src/system/parser-cli';
import type { WebNodeRoot } from '@src/web/ui-schema';

import { adaptHelpCommand } from './commands/help/adapter';
import { getBrowserCommandDefinition } from './commands/help/module';
import { adaptListCommand } from './commands/list/adapter';
import { adaptRunCommand } from './commands/run/adapter';
import { createMessageRepresentation } from './commands/shared/output';
import { renderBrowserText } from './commands/shared/render';

type BrowserSubcommand = 'help' | 'run' | 'list';

function isBrowserSubcommand(value: string): value is BrowserSubcommand {
  return value === 'help' || value === 'run' || value === 'list';
}

type HandleBrowserAdapterProps = {
  args: string[];
  prefix: string;
  alias: string;
  db: Database;
  source: MessageSource;
  identity: PluginIdentity;
  storedCtx: PluginContext;
  runAgent: RunAgentFn;
};

export async function handleBrowserAdapter({
  args,
  prefix,
  alias,
  db,
  source,
  identity,
  storedCtx,
  runAgent,
}: HandleBrowserAdapterProps): Promise<string | WebNodeRoot> {
  const normalizedArgs = args.length === 0 ? ['help'] : args;
  const subcommand = normalizedArgs[0]?.toLowerCase() ?? '';

  const commandNotFound = createMessageRepresentation({
    command: alias,
    subcommand: subcommand || 'unknown',
    tone: 'error',
    text: `Unknown command: ${prefix}${alias} ${subcommand || 'unknown'}`,
  });

  if (!isBrowserSubcommand(subcommand)) {
    return renderBrowserText(commandNotFound, { prefix });
  }

  try {
    const command = getBrowserCommandDefinition(prefix, alias);

    const parsed = parseCliInput({
      command,
      tokens: normalizedArgs,
      rawInput: `${prefix}${alias} ${normalizedArgs.join(' ')}`.trim(),
    });

    if (!isBrowserSubcommand(parsed.subcommand)) {
      return renderBrowserText(commandNotFound, { prefix });
    }

    const commonParams = {
      prefix,
      alias,
      db,
      source,
      parsed,
      command,
      identity,
      runAgent,
    };

    if (parsed.subcommand === 'help') {
      const representation = adaptHelpCommand({
        ...commonParams,
        storedCtx,
      });

      return renderBrowserText(representation, { prefix });
    }

    if (parsed.subcommand === 'list') {
      const representation = adaptListCommand(commonParams);

      return renderBrowserText(representation, { prefix });
    }

    if (parsed.subcommand === 'run') {
      const representation = await adaptRunCommand({
        ...commonParams,
        storedCtx,
      });

      return renderBrowserText(representation, { prefix });
    }

    return renderBrowserText(commandNotFound, { prefix });
  } catch (err) {
    const errorRepresentation = createMessageRepresentation({
      command: alias,
      subcommand: subcommand || 'unknown',
      tone: 'error',
      text: String(err instanceof Error ? err.message : err),
    });

    return renderBrowserText(errorRepresentation, { prefix });
  }
}
