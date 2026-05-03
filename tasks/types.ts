import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const EventRoleSchema = z.enum(['user', 'assistant', 'system']);
export type EventRole = z.infer<typeof EventRoleSchema>;

export const EventKindSchema = z.enum(['message', 'status']);
export type EventKind = z.infer<typeof EventKindSchema>;

export const TaskSchema = z.object({
  id: z.number(),
  parent_id: z.number().nullable(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  session_id: z.string().nullable(),
  tab_id: z.string().nullable(),
  last_url: z.string().nullable(),
  max_actions: z.number(),
  actions_used: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskEventSchema = z.object({
  id: z.number(),
  task_id: z.number(),
  role: EventRoleSchema,
  kind: EventKindSchema,
  text: z.string(),
  created_at: z.string(),
});
export type TaskEvent = z.infer<typeof TaskEventSchema>;
