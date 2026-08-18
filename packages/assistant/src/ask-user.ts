import { z } from 'zod';
import type { IModelToolDefinition } from './model-provider.js';
import type { IAskUserQuestion } from './session.js';

export const ASK_USER_TOOL_NAME = 'ask_user';

const askUserQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string(), description: z.string().optional() })).optional(),
  allowFreeText: z.boolean().optional(),
});

const askUserArgsSchema = z.object({ questions: z.array(askUserQuestionSchema).min(1) });

/**
 * ask_user isn't a workflow-tools ITool — it never touches a draft, and the agent loop
 * intercepts it before dispatch (see processToolCallBatch in agent-loop.ts) rather than routing
 * it through invokeTool, since answering it means *pausing the turn*, not returning a result.
 * This is the raw wire definition advertised to the model; the JSON Schema is hand-written
 * (rather than derived from askUserArgsSchema via zod-to-json-schema) since it's simple enough
 * that keeping the two in lockstep by hand is less error-prone than a second conversion path.
 */
export const ASK_USER_TOOL_DEFINITION: IModelToolDefinition = {
  name: ASK_USER_TOOL_NAME,
  description:
    'Ask the user one or more questions when the answer is genuinely unknowable from context — which Slack channel, which spreadsheet, what counts as "urgent". Never ask something discoverable by calling a tool (search_nodes, get_node_schema, list_credentials, ...) instead. Render as real option chips when you can; only fall back to allowFreeText when there is no fixed set of choices.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable id you will use to read this question\'s answer back from the result.' },
            question: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' } },
                required: ['label', 'value'],
              },
            },
            allowFreeText: { type: 'boolean' },
          },
          required: ['id', 'question'],
        },
      },
    },
    required: ['questions'],
  },
};

/** Parses and validates a raw ask_user tool-call arguments string. Returns undefined (not a throw) on malformed input, so the caller can feed a normal INVALID_ARGS-shaped tool error back to the model instead of derailing the whole turn — see agent-loop.ts. */
export function parseAskUserArguments(argsText: string): IAskUserQuestion[] | undefined {
  let raw: unknown;
  try {
    raw = argsText.length > 0 ? JSON.parse(argsText) : undefined;
  } catch {
    return undefined;
  }
  const parsed = askUserArgsSchema.safeParse(raw);
  return parsed.success ? parsed.data.questions : undefined;
}
