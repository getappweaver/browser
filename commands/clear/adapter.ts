import type { Database } from 'bun:sqlite';

import type { PluginIdentity, RunAgentFn } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { CommandDefinition } from '@src/system/command-definition';
import type { ParsedCliInvocation } from '@src/system/parser-cli';

import type { BrowserRenderable } from '../shared/render';
import { BrowserReplyMessage } from '../shared/reply';

import { handleClearCommand } from './handler';

export function adaptClearCommand(params: {
  prefix: string;
  alias: string;
  db: Database;
  source: MessageSource;
  identity: PluginIdentity;
  runAgent: RunAgentFn;
  parsed: ParsedCliInvocation;
  command: CommandDefinition;
}): BrowserRenderable {
  void params.prefix;
  void params.parsed;
  void params.command;
  void params.source;
  void params.identity;
  void params.runAgent;

  const text = handleClearCommand({ db: params.db });

  return BrowserReplyMessage({
    alias: params.alias,
    subcommand: 'clear',
    text,
  });
}
