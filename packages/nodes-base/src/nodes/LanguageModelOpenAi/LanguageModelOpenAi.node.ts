import type { IDataObject, INodeType, ISupplyDataFunctions } from '@n8n-clone/workflow';
import type { IChatMessage, IChatModel, IChatToolCall, IToolSchema } from '../shared/ai-types.js';

function toApiMessage(message: IChatMessage): IDataObject {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        }
      : {}),
  };
}

function toApiTool(tool: IToolSchema): IDataObject {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

function parseToolCalls(message: IDataObject): IChatToolCall[] {
  const rawCalls = (message.tool_calls as IDataObject[] | undefined) ?? [];
  return rawCalls.map((call) => {
    const fn = (call.function as IDataObject | undefined) ?? {};
    return { id: call.id as string, name: (fn.name as string) ?? '', arguments: (fn.arguments as string) ?? '{}' };
  });
}

/**
 * `outputs: ['ai_languageModel']` with no `main` — this node is never scheduled through the
 * main queue (see NodeConnectionType). An AI Agent node connected to it resolves and calls
 * `supplyData()` directly via getInputConnectionData when the Agent itself runs.
 */
export const languageModelOpenAi: INodeType = {
  description: {
    displayName: 'OpenAI Chat Model',
    name: 'lmChatOpenAi',
    icon: 'fa:comment-dots',
    group: ['ai'],
    version: 1,
    description: 'A chat-completions language model an AI Agent node can reason and call tools with',
    defaults: { name: 'OpenAI Chat Model' },
    inputs: [],
    outputs: ['ai_languageModel'],
    credentials: [{ name: 'openAiApi', required: true }],
    properties: [
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        default: 'gpt-4o-mini',
        options: [
          { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
          { name: 'gpt-4o', value: 'gpt-4o' },
          { name: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' },
        ],
      },
      { displayName: 'Temperature', name: 'temperature', type: 'number', default: 0.7 },
    ],
  },
  async supplyData(this: ISupplyDataFunctions): Promise<IChatModel> {
    const { apiKey, baseUrl } = (await this.getCredentials('openAiApi')) as { apiKey: string; baseUrl: string };
    const model = this.getNodeParameter('model', 0, 'gpt-4o-mini') as string;
    const temperature = this.getNodeParameter('temperature', 0, 0.7) as number;
    // Captured here (not read off `this` inside `chat`) because `chat` is called as
    // `model.chat(...)` by the Agent node — a shorthand method there would rebind `this` to
    // the returned IChatModel object itself, which has no `.helpers`.
    const httpRequest = this.helpers.httpRequest;

    return {
      chat: async (messages, tools) => {
        const body: IDataObject = {
          model,
          temperature,
          messages: messages.map(toApiMessage),
          ...(tools.length > 0 ? { tools: tools.map(toApiTool) } : {}),
        };

        const response = (await httpRequest({
          url: `${baseUrl}/chat/completions`,
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body,
        })) as IDataObject;

        const message = (((response.choices as IDataObject[] | undefined)?.[0]?.message as IDataObject) ?? {}) as IDataObject;
        return { content: (message.content as string | null) ?? null, toolCalls: parseToolCalls(message) };
      },
    };
  },
};
