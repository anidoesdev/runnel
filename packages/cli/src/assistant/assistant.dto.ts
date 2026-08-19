import { z } from 'zod';

export const createAssistantSessionSchema = z.object({
  workflowId: z.string().min(1),
  tokenLimit: z.number().int().positive().optional(),
  model: z.string().optional(),
});

export const sendAssistantMessageSchema = z.object({ message: z.string().min(1) });

export const resumeApprovalSchema = z.object({ decision: z.enum(['approve', 'reject']) });

export const resumeAskUserSchema = z.object({ answers: z.record(z.string(), z.string()) });
