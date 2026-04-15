import type { Database } from 'bun:sqlite';

import type {
  PluginContext,
  PluginIdentity,
  RunAgentFn,
} from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { CommandDefinition } from '@src/system/command-definition';
import type { ParsedCliInvocation } from '@src/system/parser-cli';

import type { BrowserRenderable } from '../shared/render';
import { BrowserReplyMessage } from '../shared/reply';
import { stringFromVariadicArgument } from '../shared/variadic-text';

import { handleRunCommand } from './handler';

export async function adaptRunCommand(params: {
  prefix: string;
  alias: string;
  db: Database;
  source: MessageSource;
  identity: PluginIdentity;
  runAgent: RunAgentFn;
  parsed: ParsedCliInvocation;
  command: CommandDefinition;
  storedCtx: PluginContext;
}): Promise<BrowserRenderable> {
  void params.source;
  void params.command;
  void params.identity;

  const prompt = stringFromVariadicArgument(params.parsed.args['prompt']);

  const text = await handleRunCommand({
    db: params.db,
    ctx: params.storedCtx,
    runAgent: params.runAgent,
    prompt,
  });

  return BrowserReplyMessage({
    alias: params.alias,
    subcommand: 'run',
    text,
  });
}
