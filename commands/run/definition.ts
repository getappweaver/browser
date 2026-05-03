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
      summary:
        'Natural language instruction — what to do, or a response to a waiting task.',
      kind: 'string',
      required: true,
      variadic: true,
    },
  ],
  options: [],
  examples: [
    `${prefix}${alias} run publish my draft post to LinkedIn and X`,
    `${prefix}${alias} run I logged into LinkedIn`,
    `${prefix}${alias} run stop the Instagram task`,
  ],
});
