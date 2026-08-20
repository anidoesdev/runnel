export type ToolErrorCode =
  | 'INVALID_ARGS'
  | 'UNKNOWN_TOOL'
  | 'DRAFT_NOT_FOUND'
  | 'WORKFLOW_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'UNKNOWN_NODE_TYPE'
  | 'INCOMPATIBLE_CONNECTION'
  | 'UNKNOWN_CREDENTIAL_TYPE'
  | 'NO_EXECUTION_RESULT'
  | 'INTERNAL';

export interface IToolErrorInfo {
  code: ToolErrorCode;
  message: string;
  /** Whether retrying with different arguments could plausibly succeed — feeds Part 4's correction loop (retry up to 3 times, then ask_user) and lets the agent loop tell "the model should try again" apart from "something's broken, stop". */
  retryable: boolean;
}

/** Every failure that crosses the tool boundary — invalid args, an unknown tool name, a rejected mutation — is normalized into this shape before it reaches the model, so the agent loop never has to pattern-match raw error messages. */
export class ToolError extends Error implements IToolErrorInfo {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;

  constructor(info: IToolErrorInfo) {
    super(info.message);
    this.name = 'ToolError';
    this.code = info.code;
    this.retryable = info.retryable;
  }

  /** The shape handed back to the model as a tool_result on failure. */
  toToolResult(): IToolErrorInfo {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}
