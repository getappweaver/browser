import type { SubcommandDefinition } from '@src/system/command-definition';

export const listDefinition = (
  prefix: string,
  alias: string,
): SubcommandDefinition => ({
  name: 'list',
  summary: 'List all browser tasks and their current status.',
  aliases: [],
  arguments: [],
  options: [],
  examples: [`${prefix}${alias} list`],
});
