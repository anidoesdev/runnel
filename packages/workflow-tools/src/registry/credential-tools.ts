import { z } from 'zod';
import { ToolError } from '../errors.js';
import type { AnyTool, ITool, IToolContext } from './tool.js';
import type { ICredentialSummary } from '../draft/credential-repository.port.js';

function requireCredentials(ctx: { credentials?: unknown }): asserts ctx is { credentials: NonNullable<typeof ctx.credentials> } {
  if (!ctx.credentials) {
    throw new Error('This assistant session has no credential access configured — list_credentials/request_credential are unavailable.');
  }
}

/** Every credential type some registered node actually uses — the only types worth listing or creating. */
function usableCredentialTypes(ctx: IToolContext): string[] {
  const names = ctx.nodeTypes.list().flatMap((description) => (description.credentials ?? []).map((credential) => credential.name));
  return [...new Set(names)].sort();
}

/**
 * Rejects a credential type no node uses, naming the ones that exist. Without this, a guessed type
 * ("openai" for `openAiApi`) made list_credentials return an empty list — so the model concluded
 * there was no credential and created a duplicate — and request_credential create a placeholder
 * that no node could ever use.
 */
function assertUsableCredentialType(ctx: IToolContext, type: string): void {
  const usable = usableCredentialTypes(ctx);
  if (!usable.includes(type)) {
    throw new ToolError({
      code: 'INVALID_ARGS',
      message: `No node uses a credential type "${type}". Credential types in use: ${usable.join(', ')}.`,
      retryable: true,
    });
  }
}

const listCredentialsTool: ITool<{ type?: string }, ICredentialSummary[]> = {
  name: 'list_credentials',
  description: 'Lists stored credentials — id, name, and type only, NEVER values. Use this to find a credential id for set_node_credential, or to check whether one already exists before calling request_credential.',
  parameters: z.object({ type: z.string().optional() }),
  handler: async (params, ctx) => {
    requireCredentials(ctx);
    if (params.type !== undefined) assertUsableCredentialType(ctx, params.type);
    return ctx.credentials.list(params.type);
  },
};

const requestCredentialTool: ITool<{ type: string }, { setupUrl: string; credentialId: string }> = {
  name: 'request_credential',
  description: 'Creates an unconfigured placeholder credential of the given type and returns a setup link. The USER must open that link and enter real values — never invent or guess a credential value yourself. You may attach the returned credentialId to a node right away with set_node_credential; it simply will not work until the user finishes setup.',
  parameters: z.object({ type: z.string() }),
  handler: async (params, ctx) => {
    requireCredentials(ctx);
    assertUsableCredentialType(ctx, params.type);
    const created = await ctx.credentials.createPlaceholder(params.type, `New ${params.type} (needs setup)`);
    return { setupUrl: `/credentials/${created.id}`, credentialId: created.id };
  },
};

export function createCredentialTools(): AnyTool[] {
  return [listCredentialsTool, requestCredentialTool] as AnyTool[];
}
