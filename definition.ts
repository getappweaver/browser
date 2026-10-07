import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { clearDefinition } from './commands/clear/definition';
import { listDefinition } from './commands/list/definition';
import { runDefinition } from './commands/run/definition';
import { browserSettingsDefinition } from './commands/settings';
import { workspaceDefinitions } from './commands/workspace-definition';

export const commandDefinition = (
  prefix: string,
  alias: string,
): CommandDefinition => ({
  name: alias,
  summary: 'AI-driven browser automation with multi-tab task execution.',
  aliases: [],
  subcommands: [
    createHelpSubcommandDefinition(prefix, alias, {
      topicArgSummary:
        'Optional subcommand: list, new, task, message, open, continue, stop, run, clear, settings',
      exampleTopics: ['list', 'task', 'message'],
    }),
    runDefinition(prefix, alias),
    listDefinition(prefix, alias),
    clearDefinition(prefix, alias),
    browserSettingsDefinition(prefix, alias),
    ...workspaceDefinitions(prefix, alias),
  ],
});
