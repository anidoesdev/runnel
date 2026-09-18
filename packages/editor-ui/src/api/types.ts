import type {
  ExecutionStatus,
  IConnections,
  IDataObject,
  INode,
  IRunExecutionData,
  IWorkflowSettings,
  NodeConnectionType,
  WorkflowExecuteMode,
} from '@runnel/workflow';

/** WorkflowEntity as it comes back over the REST API — IWorkflowBase's fields plus the row's own timestamps. */
export interface IWorkflowRecord {
  id: string;
  name: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
  settings: IWorkflowSettings | null;
  staticData: IDataObject | null;
  pinData: Record<string, unknown> | null;
  starred: boolean;
  /** ISO timestamp while the workflow sits in the trash; null when it's live. */
  deletedAt: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IFolderRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'execution_failed' | 'workflow_activated' | 'workflow_deactivated';

export interface INotificationRecord {
  id: string;
  type: NotificationType;
  workflowId: string | null;
  workflowName: string;
  executionId: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface INotificationFeed {
  items: INotificationRecord[];
  unreadCount: number;
}

export interface ISystemInfo {
  version: string;
  nodeVersion: string;
  database: 'sqlite' | 'postgres';
  customNodesDir: string | null;
  memory: { capture: boolean; recall: boolean; tokenBudget: number };
}

export interface IUserPreferences {
  assistant?: { tokenLimit?: number };
}

export interface ICredentialRecord {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface IExecutionRecord {
  id: string;
  workflowId: string;
  mode: WorkflowExecuteMode;
  status: ExecutionStatus;
  startedAt: string;
  stoppedAt: string | null;
  data: IRunExecutionData;
}

export interface IExecuteWorkflowResult {
  executionId: string;
  status: 'success' | 'error';
  data: IRunExecutionData;
}

export interface IAuthUser {
  id: string;
  email: string;
}

export interface IMeResponse extends IAuthUser {
  isOwner: boolean;
}

/** Mirrors @runnel/assistant's IModelToolCallRef — kept as a local hand-typed mirror rather than an import, same reasoning as every other record shape in this file: editor-ui doesn't take the backend packages as a dependency. */
export interface IAssistantToolCallRef {
  id: string;
  name: string;
  arguments: string;
}

export interface IAssistantMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: IAssistantToolCallRef[];
}

export interface IAskUserQuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface IAskUserQuestion {
  id: string;
  question: string;
  options?: IAskUserQuestionOption[];
  allowFreeText?: boolean;
}

export type AssistantSessionStatus = 'idle' | 'thinking' | 'awaiting_user' | 'awaiting_approval' | 'error';

export interface IAssistantSessionRecord {
  id: string;
  workflowId: string;
  draftId: string;
  messages: IAssistantMessage[];
  actor: { userId: string; projectId?: string; scopes: string[] };
  tokenBudget: { used: number; limit: number };
  pendingApproval?: { toolCallId: string; toolName: string; args: unknown; remainingCalls: IAssistantToolCallRef[] };
  pendingQuestions?: { toolCallId: string; questions: IAskUserQuestion[]; remainingCalls: IAssistantToolCallRef[] };
  status: AssistantSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IToolErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

/** Mirrors @runnel/assistant's AgentLoopEvent, plus the one extra `error` frame streamTurn writes when the loop throws outright (a provider failure mid-stream) — see assistant.controller.ts. */
export type AgentLoopEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'tool_error'; id: string; name: string; error: IToolErrorInfo }
  | { type: 'approval_required'; id: string; name: string; args: unknown }
  | { type: 'ask_user_required'; id: string; questions: IAskUserQuestion[] }
  | { type: 'turn_complete'; stopReason: string }
  | { type: 'error'; message: string };

export interface IWorkflowDraftDiffConnection {
  from: string;
  outputIndex: number;
  to: string;
  inputIndex: number;
  type: NodeConnectionType;
}

export interface IWorkflowDraftDiff {
  addedNodes: Array<{ name: string; type: string }>;
  removedNodes: Array<{ name: string; type: string }>;
  changedNodes: Array<{ name: string; before: IDataObject; after: IDataObject }>;
  addedConnections: IWorkflowDraftDiffConnection[];
  removedConnections: IWorkflowDraftDiffConnection[];
}

/** The draft's current full workflow — what GET .../draft returns, an IWorkflowBase shape (see @runnel/workflow). */
export interface IDraftWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
}
