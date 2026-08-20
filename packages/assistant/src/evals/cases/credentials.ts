import type { IEvalCase } from '../types.js';

/** Exercises list_credentials/request_credential, both with an existing credential available and with none. */
export const CREDENTIAL_CASES: IEvalCase[] = [
  {
    id: 'reuse-existing-openai-credential',
    prompt: 'build me an ai agent using my openai account',
    availableCredentials: [{ id: 'cred-1', name: 'My OpenAI', type: 'openAiApi' }],
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'calls_tool', name: 'list_credentials' },
      { type: 'does_not_call_tool', name: 'request_credential' },
      { type: 'uses_node_type', nodeType: 'lmChatOpenAi' },
    ],
  },
  {
    id: 'no-openai-credential-requests-one',
    prompt: 'set up an ai agent for me, I don\'t have anything configured yet',
    availableCredentials: [],
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'calls_tool', name: 'list_credentials' },
      { type: 'calls_tool', name: 'request_credential' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
    ],
  },
  {
    id: 'postgres-no-credential-requests-one',
    prompt: 'connect this to my postgres database, I haven\'t added the connection before',
    availableCredentials: [],
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'calls_tool', name: 'list_credentials' },
      { type: 'calls_tool', name: 'request_credential' },
      { type: 'uses_node_type', nodeType: 'postgres' },
    ],
  },
  {
    id: 'reuse-existing-postgres-credential',
    prompt: 'query my postgres db, I already have the connection saved',
    availableCredentials: [{ id: 'cred-2', name: 'Prod DB', type: 'postgresApi' }],
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'calls_tool', name: 'list_credentials' },
      { type: 'does_not_call_tool', name: 'request_credential' },
      { type: 'uses_node_type', nodeType: 'postgres' },
    ],
  },
];
