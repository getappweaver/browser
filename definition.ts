import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { clearDefinition } from './commands/clear/definition';
import { listDefinition } from './commands/list/definition';
import { runDefinition } from './commands/run/definition';

export const commandDefinition = (
  prefix: string,
  alias: string,
): CommandDefinition => ({
  name: alias,
  summary: 'AI-driven browser automation with multi-tab task execution.',
  aliases: [],
  subcommands: [
    createHelpSubcommandDefinition(prefix, alias, {
      topicArgSummary: 'Optional subcommand: run, list, clear',
      exampleTopics: ['run', 'list', 'clear'],
    }),
    runDefinition(prefix, alias),
    listDefinition(prefix, alias),
    clearDefinition(prefix, alias),
  ],
});
