import type { SubcommandDefinition } from '@src/system/command-definition';

export const clearDefinition = (
  prefix: string,
  alias: string,
): SubcommandDefinition => ({
  name: 'clear',
  summary: 'Delete all tasks and events from the database.',
  aliases: [],
  arguments: [],
  options: [],
  examples: [`${prefix}${alias} clear`],
});
