import { WorkflowOperationError } from '@n8n-clone/workflow';
import {
  IncompatibleConnectionError,
  NodeNotFoundError,
  UnknownCredentialTypeError,
  UnknownNodeTypeError,
} from '@n8n-clone/core';
import { ToolError } from '../errors.js';
import type { AnyTool, IToolContext } from './tool.js';

/**
 * Maps the typed error subclasses @n8n-clone/core's mutation ops throw into the tool-facing
 * taxonomy — by `instanceof`, not by sniffing message text, so this stays correct even if a
 * message wording changes. A plain (un-subclassed) WorkflowOperationError — e.g. from
 * Workflow.renameNode, which lives in packages/workflow and can't depend on packages/core's
 * subclasses — falls back to INVALID_ARGS rather than a wrong specific code.
 */
function toToolError(err: unknown): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof NodeNotFoundError) return new ToolError({ code: 'NODE_NOT_FOUND', message: err.message, retryable: true });
  if (err instanceof UnknownNodeTypeError) return new ToolError({ code: 'UNKNOWN_NODE_TYPE', message: err.message, retryable: true });
  if (err instanceof IncompatibleConnectionError) {
    return new ToolError({ code: 'INCOMPATIBLE_CONNECTION', message: err.message, retryable: true });
  }
  if (err instanceof UnknownCredentialTypeError) {
    return new ToolError({ code: 'UNKNOWN_CREDENTIAL_TYPE', message: err.message, retryable: true });
  }
  if (err instanceof WorkflowOperationError) return new ToolError({ code: 'INVALID_ARGS', message: err.message, retryable: true });
  return new ToolError({ code: 'INTERNAL', message: err instanceof Error ? err.message : String(err), retryable: false });
}

/**
 * The single entry point the agent loop calls for every tool_use block the model emits.
 * Validates args against the tool's own Zod schema before the handler ever runs — an invalid
 * node type or malformed argument is rejected here, never reaches a mutation.
 */
export async function invokeTool(
  tools: ReadonlyMap<string, AnyTool>,
  name: string,
  rawArgs: unknown,
  ctx: IToolContext,
): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) {
    throw new ToolError({ code: 'UNKNOWN_TOOL', message: `No tool named "${name}".`, retryable: false });
  }

  const parsed = tool.parameters.safeParse(rawArgs);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new ToolError({ code: 'INVALID_ARGS', message, retryable: true });
  }

  try {
    return await tool.handler(parsed.data, ctx);
  } catch (err) {
    throw toToolError(err);
  }
}
