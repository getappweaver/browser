import type { SubcommandDefinition } from '@src/system/command-definition';

export const listDefinition = (
  prefix: string,
  alias: string,
): SubcommandDefinition => ({
  name: 'list',
  webWidget: {
    placement: 'right',
    surface: 'modal',
    label: 'Browser',
    modalTitle: 'Browser tasks',
    icon: './commands/list/renderers/browser.svg',
    order: 5,
  },
  summary: 'List all browser tasks and their current status.',
  aliases: [],
  arguments: [],
  options: [],
  examples: [`${prefix}${alias} list`],
});
