import type { Database } from 'bun:sqlite';

import type {
  WebAction,
  WebNode,
  WebNodeRoot,
  WebTone,
} from '@src/web/ui-schema';
import { row, textBlock, textNode } from '@src/web/widgets';

import { getBrowserService } from '../orchestrator/browser-service';
import { isTaskBusy, taskRootId } from '../orchestrator/executions';
import { listChildTasks, listRootTasks } from '../tasks/db';
import { threadEvents, listRuns } from '../tasks/thread';
import type { Task, TaskEvent } from '../tasks/types';

const stylesheet = {
  id: 'browser-workspace',
  cssText: `
.browser-workspace {font-family:var(--font-mono,monospace);gap:.35rem;min-width:0}
.browser-workspace .web-tree-item-summary {padding:.3rem 0;min-width:0}
.browser-task-summary,.browser-toolbar {display:flex;align-items:center;gap:.6rem;min-width:0;flex-wrap:nowrap}
.browser-title {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.browser-task-details {padding:.25rem 0 .5rem;gap:.35rem}
.browser-workspace .browser-link {display:inline-flex;background:transparent;border:0;border-radius:0;box-shadow:none;padding:.1rem .2rem;font:inherit;font-size:.8rem;color:var(--color-warning);width:auto;flex:none}
.browser-workspace .browser-link:hover {text-decoration:underline;background:var(--color-surface-alt)}
.browser-workspace .browser-link:focus-visible {outline:1px solid var(--color-warning)}
.browser-count {font-size:.75rem;color:var(--color-text-muted);white-space:nowrap}
.browser-meta {font-size:.78rem;color:var(--color-text-muted);overflow-wrap:anywhere}
.browser-panel {height:min(72vh,48rem);min-height:20rem;display:flex;flex-direction:column}
.browser-timeline {flex:1;min-height:0;overflow-y:auto;gap:.5rem;padding:.25rem 0}
.browser-entry {padding:.2rem 0;overflow-wrap:anywhere;gap:.25rem}
.browser-entry--user {border-left-color:var(--color-warning)}
.browser-checkpoint {border-left:2px solid var(--color-warning);padding:.3rem .5rem;gap:.25rem}
.browser-composer {flex-shrink:0;gap:.3rem}
.browser-controls {flex-wrap:wrap;gap:.3rem}
.browser-composer textarea {min-height:3rem}
.browser-activity-line {font-size:.78rem;color:var(--color-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}
.browser-task-tree .web-tree-item {border-bottom:1px solid var(--color-border)}
`,
};

const statusLabels: Record<Task['status'], string> = {
  pending: 'Queued',
  running: 'Running',
  waiting: 'Needs you',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

function statusTone(status: Task['status']): WebTone {
  return status === 'waiting' || status === 'running'
    ? 'warning'
    : status === 'failed'
      ? 'danger'
      : status === 'completed'
        ? 'success'
        : 'muted';
}

type CommandActionProps = {
  alias: string;
  subcommand: string;
  id: number | null;
  timeline: boolean;
};
function commandAction({
  alias,
  subcommand,
  id,
  timeline,
}: CommandActionProps): WebAction {
  return {
    type: 'command',
    command: alias,
    subcommand,
    arguments: id === null ? {} : { id },
    options: {},
    recordInTimeline: false,
    ...(timeline ? { surface: 'timeline' as const } : {}),
  };
}

function button(label: string, action: WebAction): WebNode {
  return {
    type: 'element',
    tag: 'button',
    props: { label, action, className: 'browser-link' },
  };
}

function compactText(value: string, className: string): WebNode {
  return {
    type: 'element',
    tag: 'text',
    props: { className },
    children: [textNode(value)],
  };
}

function taskStatus(task: Task, busy: boolean): WebNode {
  return {
    type: 'element',
    tag: 'badge',
    props: {
      label: busy ? 'Working' : statusLabels[task.status],
      tone: statusTone(task.status),
    },
  };
}

function shortOutcome(value: string): string {
  return value
    .replace(/^(Waiting:|Completed:|Failed:)\s*/, '')
    .split('\n')[0]!
    .slice(0, 240);
}

function timestamp(value: string): WebNode {
  return {
    type: 'element',
    tag: 'timestamp',
    props: {
      timestampMs: Date.parse(value.replace(' ', 'T') + 'Z'),
      tone: 'muted',
      size: 'sm',
    },
  };
}

type ComposerProps = { alias: string; id: number | null; busy: boolean };
function composer({ alias, id, busy }: ComposerProps): WebNode {
  return {
    type: 'element',
    tag: 'form',
    renderKey: id === null ? 'new-task-form' : `task-composer-${id}`,
    props: {
      className: 'browser-composer',
      action: commandAction({
        alias,
        subcommand: id === null ? 'new' : 'message',
        id,
        timeline: id === null,
      }),
    },
    children: [
      {
        type: 'element',
        tag: 'textArea',
        renderKey: 'message-input',
        props: {
          formFieldName: 'message',
          inputPlaceholder:
            id === null
              ? 'What should the browser do?'
              : busy
                ? 'Task is working…'
                : 'Ask a question or give the next instruction…',
          maxRows: 5,
          disabled: busy,
        },
      },
      {
        type: 'element',
        tag: 'button',
        props: {
          label: id === null ? 'Start task' : 'Send',
          htmlType: 'submit',
          disabled: busy,
          disabledUntilFormFieldChanged: 'message',
        },
      },
    ],
  };
}

type RenderListProps = { db: Database; alias: string };
export function renderBrowserList({ db, alias }: RenderListProps): WebNodeRoot {
  const roots = listRootTasks(db);

  return {
    kind: 'ui',
    version: 1,
    meta: { command: alias, subcommand: 'list' },
    stylesheets: [stylesheet],
    autoRefreshMs: 5000,
    tree: {
      type: 'element',
      tag: 'stack',
      props: { className: 'browser-workspace' },
      children: [
        row([
          textBlock('BROWSER TASKS'),
          compactText(`${roots.length} tasks`, 'browser-count'),
        ]),
        {
          type: 'element',
          tag: 'treeItem',
          renderKey: 'new-browser-task',
          props: {
            id: 'new-browser-task',
            defaultExpanded: roots.length === 0,
          },
          summary: textBlock('+ New task'),
          children: [composer({ alias, id: null, busy: false })],
        },
        {
          type: 'element',
          tag: 'tree',
          props: { className: 'browser-task-tree' },
          children: roots.map((root): WebNode => {
            const events = threadEvents(db, root.id);
            const last = events.at(-1);

            const outcome = events.findLast((event) =>
              /^(Completed:|Waiting:|Failed:)/.test(event.text),
            );

            const children = listChildTasks(db, root.id);

            return {
              type: 'element',
              tag: 'treeItem',
              renderKey: `task-${root.id}`,
              props: {
                id: `browser-task-${root.id}`,
                entityKey: `browser-task:${root.id}`,
                defaultExpanded: false,
              },
              summary: {
                type: 'element',
                tag: 'row',
                props: { className: 'browser-task-summary' },
                children: [
                  compactText(`#${root.id} ${root.title}`, 'browser-title'),
                  taskStatus(root, isTaskBusy(root.id)),
                  timestamp(last?.created_at ?? root.updated_at),
                ],
              },
              children: [
                {
                  type: 'element',
                  tag: 'stack',
                  props: { className: 'browser-task-details' },
                  children: [
                    compactText(
                      `${children.reduce((sum, child) => sum + child.actions_used, 0)} actions · ${listRuns(db, root.id).length} runs`,
                      'browser-meta',
                    ),
                    ...(outcome
                      ? [
                          textBlock(
                            shortOutcome(outcome.text),
                            statusTone(root.status),
                          ),
                        ]
                      : []),
                    button(
                      'Open task →',
                      commandAction({
                        alias,
                        subcommand: 'task',
                        id: root.id,
                        timeline: true,
                      }),
                    ),
                  ],
                },
              ],
            };
          }),
        },
        ...(!roots.length
          ? [textBlock('Create a task above to get started.', 'muted')]
          : []),
      ],
    },
  };
}

function eventNode(event: TaskEvent): WebNode {
  return {
    type: 'element',
    tag: 'stack',
    renderKey: `event-${event.id}`,
    props: {
      className: `browser-entry browser-entry--${event.role}`,
      gap: 'xs',
    },
    children: [
      row([
        textBlock(
          event.role === 'user'
            ? 'You'
            : event.role === 'assistant'
              ? 'Browser'
              : 'Activity',
          'muted',
        ),
        timestamp(event.created_at),
      ]),
      textBlock(event.text),
    ],
  };
}

function groupedTimeline(events: TaskEvent[]): WebNode[] {
  const nodes: WebNode[] = [];
  let actions: TaskEvent[] = [];

  const flush = () => {
    if (!actions.length) {
      return;
    }

    nodes.push({
      type: 'element',
      tag: 'treeItem',
      renderKey: `actions-${actions[0]!.id}`,
      props: { defaultExpanded: false },
      summary: row([
        textBlock(
          `Activity · ${actions.filter((event) => /^Step \d+:/.test(event.text)).length} actions`,
          'muted',
        ),
        timestamp(actions.at(-1)!.created_at),
      ]),
      children: actions.map((event) =>
        compactText(event.text, 'browser-activity-line'),
      ),
    });

    actions = [];
  };

  for (const event of events) {
    if (
      /^Step \d+(?::| (?:decision|dispatch|error):)/.test(event.text) ||
      (event.role === 'system' && event.kind === 'status')
    ) {
      actions.push(event);
      continue;
    }

    flush();

    if (/^Execution #\d+ ·/.test(event.text)) {
      const urls = [...new Set(event.text.match(/https?:\/\/[^\s)]+/g) ?? [])];

      nodes.push({
        type: 'element',
        tag: 'treeItem',
        renderKey: `report-${event.id}`,
        props: { defaultExpanded: false },
        summary: row([
          textBlock(
            event.text.split('\n')[0]!.replace(/^Execution #/, 'Report #'),
          ),
          timestamp(event.created_at),
        ]),
        children: [
          eventNode(event),
          ...urls.map((url): WebNode => ({
            type: 'element',
            tag: 'link',
            props: { href: url, external: true },
            children: [textNode(url)],
          })),
        ],
      });
    } else {
      if (event.text.length > 800) {
        nodes.push({
          type: 'element',
          tag: 'treeItem',
          renderKey: `message-${event.id}`,
          props: { defaultExpanded: false },
          summary: row([
            textBlock(
              `${event.role === 'user' ? 'You' : 'Browser'} · ${event.text.split('\n')[0]!.slice(0, 80)}`,
            ),
            timestamp(event.created_at),
          ]),
          children: [eventNode(event)],
        });
      } else {
        nodes.push(eventNode(event));
      }
    }
  }

  flush();

  return nodes;
}

type RenderTaskProps = {
  db: Database;
  alias: string;
  id: number;
  notice: string | null;
};
export function renderBrowserTask({
  db,
  alias,
  id,
  notice,
}: RenderTaskProps): WebNodeRoot {
  const rootId = taskRootId(db, id);
  const root = listRootTasks(db).find((task) => task.id === rootId)!;
  const children = listChildTasks(db, rootId);
  const busy = isTaskBusy(rootId);
  const waiting = children.filter((task) => task.status === 'waiting');
  const events = threadEvents(db, rootId);

  const outcome = events.findLast((event) =>
    /^(Completed:|Failed:)/.test(event.text),
  );

  return {
    kind: 'ui',
    version: 1,
    meta: { command: alias, subcommand: 'task', arguments: { id: rootId } },
    stylesheets: [stylesheet],
    autoRefreshMs: busy ? 2500 : 5000,
    shadowMountOverflow: 'hidden',
    tree: {
      type: 'element',
      tag: 'stack',
      renderKey: `panel-${rootId}`,
      props: { className: 'browser-workspace browser-panel' },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: { className: 'browser-task-summary' },
          children: [
            compactText(`#${rootId} ${root.title}`, 'browser-title'),
            taskStatus(root, busy),
          ],
        },
        {
          type: 'element',
          tag: 'row',
          props: { className: 'browser-controls' },
          children: [
            button(
              'Tasks',
              commandAction({
                alias,
                subcommand: 'list',
                id: null,
                timeline: true,
              }),
            ),
            ...(!busy && waiting.length === 0
              ? [
                  button(
                    'Open browser',
                    commandAction({
                      alias,
                      subcommand: 'open',
                      id:
                        children.findLast((child) => child.tab_id)?.id ??
                        rootId,
                      timeline: false,
                    }),
                  ),
                ]
              : []),
            ...(busy || waiting.length
              ? [
                  button(
                    'Stop',
                    commandAction({
                      alias,
                      subcommand: 'stop',
                      id: rootId,
                      timeline: false,
                    }),
                  ),
                ]
              : []),
          ],
        },
        ...(notice ? [textBlock(notice, 'warning')] : []),
        ...(!waiting.length && !busy && outcome
          ? [textBlock(shortOutcome(outcome.text), statusTone(root.status))]
          : []),
        ...waiting.map((task): WebNode => ({
          type: 'element',
          tag: 'stack',
          renderKey: `checkpoint-${task.id}`,
          props: { className: 'browser-checkpoint', gap: 'xs' },
          children: [
            textBlock(
              waiting.length > 1 ? `Needs you · ${task.title}` : 'Needs you',
              'warning',
            ),
            textBlock(
              shortOutcome(
                [...events]
                  .reverse()
                  .find(
                    (event) =>
                      event.task_id === task.id && event.kind === 'status',
                  )?.text ?? 'Manual action required.',
              ),
            ),
            textBlock(
              task.tab_id && getBrowserService().isTabOpen(task.tab_id)
                ? 'Tab connected'
                : 'Tab not connected — Open browser to recover it',
              'muted',
            ),
            compactText(
              'Continue resumes automation after you finish the requested step.',
              'browser-meta',
            ),
            ...(!busy
              ? [
                  row([
                    button(
                      'Open browser',
                      commandAction({
                        alias,
                        subcommand: 'open',
                        id: task.id,
                        timeline: false,
                      }),
                    ),
                    button(
                      'Continue',
                      commandAction({
                        alias,
                        subcommand: 'continue',
                        id: task.id,
                        timeline: false,
                      }),
                    ),
                  ]),
                ]
              : []),
          ],
        })),
        {
          type: 'element',
          tag: 'tree',
          renderKey: `timeline-${rootId}`,
          props: { className: 'browser-timeline' },
          children: groupedTimeline(events),
        },
        composer({ alias, id: rootId, busy }),
      ],
    },
  };
}

export function renderTaskText(db: Database, id: number): string {
  const rootId = taskRootId(db, id);
  const root = listRootTasks(db).find((task) => task.id === rootId)!;

  return [
    `#${root.id} ${root.title} [${statusLabels[root.status]}]`,
    ...threadEvents(db, rootId).map(
      (event) => `${event.created_at} ${event.role}: ${event.text}`,
    ),
  ].join('\n\n');
}
