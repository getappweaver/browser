import type { SubcommandDefinition } from '@src/system/command-definition';

export const runDefinition = (
  prefix: string,
  alias: string,
): SubcommandDefinition => ({
  name: 'run',
  summary: 'Run a browser task or respond to a waiting task.',
  aliases: [],
  arguments: [
    {
      name: 'prompt',
      required: true,
      variadic: true,
      description:
        'Natural language instruction — what to do, or a response to a waiting task.',
    },
  ],
  options: [],
  examples: [
    `${prefix}${alias} run publish my draft post to LinkedIn and X`,
    `${prefix}${alias} run I logged into LinkedIn`,
    `${prefix}${alias} run stop the Instagram task`,
  ],
});
