import { z } from 'zod';
import type { AnyTool, ITool } from './tool.js';
import type { ICredentialSummary } from '../draft/credential-repository.port.js';

function requireCredentials(ctx: { credentials?: unknown }): asserts ctx is { credentials: NonNullable<typeof ctx.credentials> } {
  if (!ctx.credentials) {
    throw new Error('This assistant session has no credential access configured — list_credentials/request_credential are unavailable.');
  }
}

const listCredentialsTool: ITool<{ type?: string }, ICredentialSummary[]> = {
  name: 'list_credentials',
  description: 'Lists stored credentials — id, name, and type only, NEVER values. Use this to find a credential id for set_node_credential, or to check whether one already exists before calling request_credential.',
  parameters: z.object({ type: z.string().optional() }),
  handler: async (params, ctx) => {
    requireCredentials(ctx);
    return ctx.credentials.list(params.type);
  },
};

const requestCredentialTool: ITool<{ type: string }, { setupUrl: string; credentialId: string }> = {
  name: 'request_credential',
  description: 'Creates an unconfigured placeholder credential of the given type and returns a setup link. The USER must open that link and enter real values — never invent or guess a credential value yourself. You may attach the returned credentialId to a node right away with set_node_credential; it simply will not work until the user finishes setup.',
  parameters: z.object({ type: z.string() }),
  handler: async (params, ctx) => {
    requireCredentials(ctx);
    const created = await ctx.credentials.createPlaceholder(params.type, `New ${params.type} (needs setup)`);
    return { setupUrl: `/credentials/${created.id}`, credentialId: created.id };
  },
};

export function createCredentialTools(): AnyTool[] {
  return [listCredentialsTool, requestCredentialTool] as AnyTool[];
}
