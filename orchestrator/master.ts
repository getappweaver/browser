// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/master.ts
// Master AI: interprets user messages, decomposes tasks, manages lifecycle.
// ---------------------------------------------------------------------------

import type { Database } from 'bun:sqlite';
import { z } from 'zod';

import { createBackend } from '@src/backends/factory';
import { getOutputString } from '@src/backends/types';
import type { PluginContext, RunAgentFn } from '@src/core/plugin';
import { dmBotRoot } from '@src/paths';

import {
  createChildTask,
  createRootTask,
  getLastTaskEvent,
  insertTaskEvent,
  listChildTasks,
  listRootTasks,
  listWaitingTasks,
  updateTaskStatus,
} from '../tasks/db';
import type { Task } from '../tasks/types';

import { buildMasterSystemPrompt } from './prompts';
import { executeSequentialLoop } from './runner';

const DEFAULT_MAX_ACTIONS = 50;

// ---------------------------------------------------------------------------
// Master decision schema
// ---------------------------------------------------------------------------

const SubTaskInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
});

const NewRootInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  sub_tasks: z.array(SubTaskInputSchema).min(1),
});

const MasterDecisionSchema = z.object({
  decision: z.enum(['CREATE_NEW', 'RESUME', 'STOP', 'CLARIFY', 'NOTHING']),
  task_id: z.number().nullable(),
  question: z.string().nullable(),
  new_root: NewRootInputSchema.nullable(),
});

type MasterDecision = z.infer<typeof MasterDecisionSchema>;

// ---------------------------------------------------------------------------
// Task context builder
// ---------------------------------------------------------------------------

function buildTaskSummaries(db: Database) {
  const roots = listRootTasks(db).slice(0, 10);

  return roots.map((root) => {
    const children = listChildTasks(db, root.id);

    return {
      task: root,
      lastEvent: getLastTaskEvent(db, root.id),
      children: children.map((child) => ({
        task: child,
        lastEvent: getLastTaskEvent(db, child.id),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Call the master AI
// ---------------------------------------------------------------------------

type CallMasterAiProps = {
  userMessage: string;
  db: Database;
  ctx: PluginContext;
  runAgent: RunAgentFn;
};

async function callMasterAi({
  userMessage,
  db,
  ctx,
}: CallMasterAiProps): Promise<MasterDecision | null> {
  const taskSummaries = buildTaskSummaries(db);
  const prompt = buildMasterSystemPrompt({ userMessage, taskSummaries });

  const { defaults } = ctx;

  const backend = createBackend({
    backendName: defaults.backend,
    dmBotRoot,
    mode: 'ask',
    attachUrl: process.env.BOT_OPENCODE_SERVE_URL ?? null,
    modelOverride: defaults.model,
    providerName: defaults.provider,
  });

  const sessionId = await backend.createSession(dmBotRoot);

  const result = await backend.runMessage({
    sessionId,
    content: prompt,
    mode: 'ask',
    cwd: dmBotRoot,
    getRoutstrSkKey: ctx.getRoutstrSkKey,
    modelOverride: defaults.model,
    onAgentStreamChunk: null,
    streamAbortSignal: null,
  });

  const raw = getOutputString(result).trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return MasterDecisionSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execute decision
// ---------------------------------------------------------------------------

type ExecuteDecisionProps = {
  decision: MasterDecision;
  db: Database;
  ctx: PluginContext;
  userMessage: string;
};

async function executeDecision({
  decision,
  db,
  ctx,
  userMessage,
}: ExecuteDecisionProps): Promise<string> {
  if (decision.decision === 'NOTHING') {
    return 'No action needed.';
  }

  if (decision.decision === 'CLARIFY' && decision.question) {
    return decision.question;
  }

  if (decision.decision === 'STOP' && decision.task_id !== null) {
    const task = listChildTasks(db, decision.task_id).find(
      (t) => t.id === decision.task_id,
    );

    if (!task) {
      updateTaskStatus({ db, id: decision.task_id, status: 'cancelled' });

      insertTaskEvent({
        db,
        task_id: decision.task_id,
        role: 'user',
        kind: 'status',
        text: `Cancelled by user: "${userMessage}"`,
      });

      return `Task #${decision.task_id} cancelled.`;
    }

    updateTaskStatus({ db, id: task.id, status: 'cancelled' });

    insertTaskEvent({
      db,
      task_id: task.id,
      role: 'user',
      kind: 'status',
      text: `Cancelled by user: "${userMessage}"`,
    });

    return `"${task.title}" cancelled.`;
  }

  if (decision.decision === 'RESUME' && decision.task_id !== null) {
    const taskId = decision.task_id;

    const waitingTasks = listWaitingTasks(db);
    const target = waitingTasks.find((t) => t.id === taskId);

    if (!target) {
      return `Task #${taskId} is not in waiting state.`;
    }

    insertTaskEvent({
      db,
      task_id: taskId,
      role: 'user',
      kind: 'message',
      text: userMessage,
    });

    const parentId = target.parent_id;

    if (parentId === null) {
      return `Task #${taskId} has no parent — cannot resume.`;
    }

    void executeSequentialLoop({
      db,
      ctx,
      rootTaskId: parentId,
      resumeTaskId: taskId,
      resumeContext: userMessage,
    });

    return `Resuming "${target.title}"…`;
  }

  if (decision.decision === 'CREATE_NEW' && decision.new_root !== null) {
    const { title, prompt, sub_tasks } = decision.new_root;

    const rootTask: Task = createRootTask({ db, title, prompt });

    insertTaskEvent({
      db,
      task_id: rootTask.id,
      role: 'user',
      kind: 'message',
      text: userMessage,
    });

    for (const sub of sub_tasks) {
      createChildTask({
        db,
        parent_id: rootTask.id,
        title: sub.title,
        prompt: sub.prompt,
        max_actions: DEFAULT_MAX_ACTIONS,
      });
    }

    void executeSequentialLoop({
      db,
      ctx,
      rootTaskId: rootTask.id,
      resumeTaskId: null,
      resumeContext: null,
    });

    const subList = sub_tasks.map((s) => `  • ${s.title}`).join('\n');

    return `Starting "${title}" with ${sub_tasks.length} sub-task${sub_tasks.length > 1 ? 's' : ''}:\n${subList}\n\nI'll notify you as each one completes or if any need your input.`;
  }

  return 'Could not determine what to do. Try being more specific.';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

type HandleMasterDecisionProps = {
  db: Database;
  ctx: PluginContext;
  runAgent: RunAgentFn;
  userMessage: string;
};

export async function handleMasterDecision({
  db,
  ctx,
  runAgent,
  userMessage,
}: HandleMasterDecisionProps): Promise<string> {
  const decision = await callMasterAi({ userMessage, db, ctx, runAgent });

  if (!decision) {
    return 'Sorry, I could not parse a decision from the AI. Please try rephrasing.';
  }

  return executeDecision({ decision, db, ctx, userMessage });
}
