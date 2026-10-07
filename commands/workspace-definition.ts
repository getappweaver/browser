import type { SubcommandDefinition } from '@src/system/command-definition';

export function workspaceDefinitions(
  prefix: string,
  alias: string,
): SubcommandDefinition[] {
  return ['new', 'task', 'message', 'open', 'continue', 'stop'].map((name) => ({
    name,
    summary: (
      {
        new: 'Create a browser task and open its conversation.',
        task: 'Open a persistent task conversation and reports.',
        message: 'Send a scoped question or follow-up to a task.',
        open: 'Recover and show a task browser tab without continuing.',
        continue:
          'Continue a manual checkpoint using the current browser state.',
        stop: 'Stop task automation and leave its browser tabs open.',
      } as Record<string, string>
    )[name]!,
    aliases: [],
    arguments: [
      ...(name !== 'new'
        ? [
            {
              name: 'id',
              summary: 'Root or child task ID.',
              kind: 'integer' as const,
              required: true,
              variadic: false,
            },
          ]
        : []),
      ...(['new', 'message'].includes(name)
        ? [
            {
              name: 'message',
              summary: 'Task instruction or conversation message.',
              kind: 'string' as const,
              required: true,
              variadic: true,
              webInput: 'textarea' as const,
            },
          ]
        : []),
    ],
    options: [],
    examples: [
      `${prefix}${alias} ${name} ${name === 'new' ? 'Find remote frontend jobs' : name === 'message' ? '5 What did you find?' : '5'}`,
    ],
  }));
}
