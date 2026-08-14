import type { ICredentialType } from '@n8n-clone/workflow';

/** Base URL is deliberately overridable — any OpenAI-compatible chat completions endpoint (Azure OpenAI, a local server, etc.) works without a separate credential type. */
export const openAiApi: ICredentialType = {
  name: 'openAiApi',
  displayName: 'OpenAI API',
  properties: [
    { displayName: 'API Key', name: 'apiKey', type: 'string', default: '', required: true, typeOptions: { password: true } },
    { displayName: 'Base URL', name: 'baseUrl', type: 'string', default: 'https://api.openai.com/v1' },
  ],
};
