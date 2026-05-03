import type { Database } from 'bun:sqlite';

import type { PluginContext, RunAgentFn } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';

import { handleMasterDecision } from '../../orchestrator/master';

type HandleRunCommandProps = {
  db: Database;
  ctx: PluginContext;
  runAgent: RunAgentFn;
  prompt: string;
  source: MessageSource;
};

export async function handleRunCommand({
  db,
  ctx,
  runAgent,
  prompt,
  source,
}: HandleRunCommandProps): Promise<string> {
  if (!prompt.trim()) {
    return 'Usage: /browser run <prompt>\n\nExamples:\n  /browser run publish my latest post to LinkedIn and X\n  /browser run I logged into LinkedIn';
  }

  return handleMasterDecision({
    db,
    ctx,
    runAgent,
    userMessage: prompt,
    source,
  });
}
