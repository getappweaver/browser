// ---------------------------------------------------------------------------
// plugins/browser/adapter.ts — parse CLI + dispatch to command adapters
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';

import type {
  PluginContext,
  PluginAgentService,
  PluginIdentity,
} from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { WebNodeRoot } from '@src/web/ui-schema';

import { adaptClearCommand } from './commands/clear/adapter';
import { adaptHelpCommand } from './commands/help/adapter';
import { getBrowserCommandDefinition } from './commands/help/module';
import { adaptListCommand } from './commands/list/adapter';
import { adaptRunCommand } from './commands/run/adapter';
import { handleBrowserSettings } from './commands/settings';
import { createMessageRepresentation } from './commands/shared/output';
import { parseBrowserInvocation } from './commands/shared/parse';
import { renderBrowserText } from './commands/shared/render';
import { stringFromVariadicArgument } from './commands/shared/variadic-text';
import {
  renderBrowserList,
  renderBrowserTask,
  renderTaskText,
} from './commands/workspace-web';
import { isTaskBusy } from './orchestrator/executions';
import { workspaceAction } from './orchestrator/workspace';
import { listRootTasks } from './tasks/db';

type BrowserSubcommand =
  | 'settings'
  | 'help'
  | 'run'
  | 'list'
  | 'clear'
  | 'new'
  | 'task'
  | 'message'
  | 'open'
  | 'continue'
  | 'stop';

function isBrowserSubcommand(value: string): value is BrowserSubcommand {
  return [
    'settings',
    'help',
    'run',
    'list',
    'clear',
    'new',
    'task',
    'message',
    'open',
    'continue',
    'stop',
  ].includes(value);
}

type HandleBrowserAdapterProps = {
  args: string[];
  prefix: string;
  alias: string;
  db: Database;
  source: MessageSource;
  identity: PluginIdentity;
  storedCtx: PluginContext;
  agent: PluginAgentService;
  jsonPayload: unknown;
};

export async function handleBrowserAdapter({
  args,
  prefix,
  alias,
  db,
  source,
  identity,
  storedCtx,
  agent,
  jsonPayload,
}: HandleBrowserAdapterProps): Promise<string | WebNodeRoot> {
  const normalizedArgs =
    args.length === 0 ? [source === 'web' ? 'list' : 'help'] : args;

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

    const parsed = parseBrowserInvocation({
      command,
      args: normalizedArgs,
      jsonPayload,
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
      agent,
    };

    if (parsed.subcommand === 'settings') {
      return handleBrowserSettings(db, parsed);
    }

    if (parsed.subcommand === 'help') {
      const representation = adaptHelpCommand({
        ...commonParams,
        storedCtx,
      });

      return renderBrowserText(representation, { prefix });
    }

    if (parsed.subcommand === 'list') {
      if (source === 'web') {
        return renderBrowserList({ db, alias });
      }

      const representation = adaptListCommand(commonParams);

      return renderBrowserText(representation, { prefix });
    }

    if (parsed.subcommand === 'run') {
      if (source === 'web') {
        const prompt = stringFromVariadicArgument(parsed.arguments['prompt']);

        const explicit = prompt
          .trim()
          .match(
            /^(?:(reopen|open|show|continue|resume)\s+(?:task\s+)?)?#?(\d+)$/i,
          );

        const action = explicit
          ? /^(continue|resume)$/i.test(explicit[1] ?? '')
            ? 'continue'
            : 'open'
          : 'new';

        const result = await workspaceAction({
          db,
          ctx: storedCtx,
          action,
          id: explicit ? Number(explicit[2]) : null,
          message: prompt,
        });

        return renderBrowserTask({
          db,
          alias,
          id: result.rootId,
          notice: result.notice,
        });
      }

      const representation = await adaptRunCommand({
        ...commonParams,
        storedCtx,
      });

      return renderBrowserText(representation, { prefix });
    }

    if (parsed.subcommand === 'clear') {
      if (listRootTasks(db).some((root) => isTaskBusy(root.id))) {
        return 'Stop active browser tasks before clearing their history.';
      }

      const representation = adaptClearCommand(commonParams);

      return renderBrowserText(representation, { prefix });
    }

    if (
      ['new', 'task', 'message', 'open', 'continue', 'stop'].includes(
        parsed.subcommand,
      )
    ) {
      const result = await workspaceAction({
        db,
        ctx: storedCtx,
        action: parsed.subcommand,
        id:
          parsed.arguments['id'] === undefined
            ? null
            : Number(parsed.arguments['id']),
        message: stringFromVariadicArgument(parsed.arguments['message']),
      });

      return source === 'web'
        ? renderBrowserTask({
            db,
            alias,
            id: result.rootId,
            notice: result.notice,
          })
        : [result.notice, renderTaskText(db, result.rootId)]
            .filter(Boolean)
            .join('\n\n');
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
