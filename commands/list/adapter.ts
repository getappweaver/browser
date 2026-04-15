import type { Database } from 'bun:sqlite';

import type { PluginIdentity, RunAgentFn } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { CommandDefinition } from '@src/system/command-definition';
import type { ParsedCliInvocation } from '@src/system/parser-cli';

import type { BrowserRenderable } from '../shared/render';
import { BrowserReplyMessage } from '../shared/reply';

import { handleListCommand } from './handler';
import { renderBrowserListText } from './renderers/text';

export function adaptListCommand(params: {
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
  void params.identity;
  void params.runAgent;

  const { tasks } = handleListCommand({ db: params.db });
  const text = renderBrowserListText({ tasks });

  return BrowserReplyMessage({
    alias: params.alias,
    subcommand: 'list',
    text,
  });
}
