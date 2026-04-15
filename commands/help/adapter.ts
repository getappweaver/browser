import type { Database } from 'bun:sqlite';

import { buildHelpSubcommandRepresentation } from '@src/commands/help/command';
import type {
  PluginContext,
  PluginIdentity,
  RunAgentFn,
} from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { CommandDefinition } from '@src/system/command-definition';
import type { ParsedCliInvocation } from '@src/system/parser-cli';

import { createMessageRepresentation } from '../shared/output';

export function adaptHelpCommand(params: {
  prefix: string;
  alias: string;
  db: Database;
  source: MessageSource;
  identity: PluginIdentity;
  runAgent: RunAgentFn;
  parsed: ParsedCliInvocation;
  command: CommandDefinition;
  storedCtx: PluginContext;
}) {
  void params.db;
  void params.source;
  void params.identity;
  void params.runAgent;
  void params.storedCtx;

  const result = buildHelpSubcommandRepresentation({
    prefix: params.prefix,
    alias: params.alias,
    command: params.command,
    parsed: params.parsed,
  });

  if (result.type === 'error') {
    return createMessageRepresentation({
      command: params.alias,
      subcommand: 'help',
      tone: 'error',
      text: result.message,
    });
  }

  return result.representation;
}
