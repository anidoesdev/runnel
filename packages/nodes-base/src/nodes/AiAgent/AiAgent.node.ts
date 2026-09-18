import { NodeOperationError } from '@runnel/workflow';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@runnel/workflow';
import type { IAiTool, IChatMessage, IChatModel, IToolSchema } from '../shared/ai-types.js';

export const aiAgent: INodeType = {
  description: {
    displayName: 'AI Agent',
    name: 'aiAgent',
    icon: 'fa:magic',
    group: ['ai'],
    version: 1,
    description: 'Sends a prompt to a connected chat model, optionally calling connected tools in a loop, and returns its final answer',
    defaults: { name: 'AI Agent' },
    inputs: ['main', 'ai_languageModel', 'ai_tool'],
    outputs: ['main'],
    properties: [
      { displayName: 'System Prompt', name: 'systemPrompt', type: 'string', default: '', typeOptions: { rows: 4 } },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 4 },
        placeholder: '={{ $json.chatInput }}',
      },
      { displayName: 'Max Iterations', name: 'maxIterations', type: 'number', default: 5 },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];

    const languageModels = (await this.getInputConnectionData('ai_languageModel', 0)) as IChatModel[];
    if (languageModels.length === 0) {
      throw new NodeOperationError(this.getNode(), 'No Chat Model connected', {
        description: 'Connect a chat model node (e.g. OpenAI Chat Model) to this node\'s "Chat Model" input.',
      });
    }
    const model = languageModels[0]!;

    const tools = (await this.getInputConnectionData('ai_tool', 0)) as IAiTool[];
    const toolSchemas: IToolSchema[] = tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.schema }));

    for (let i = 0; i < items.length; i++) {
      const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;
      const prompt = this.getNodeParameter('prompt', i, '') as string;
      const maxIterations = Math.max(this.getNodeParameter('maxIterations', i, 5) as number, 1);

      const messages: IChatMessage[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const toolCallLog: IDataObject[] = [];
      let finalContent = '';

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const result = await model.chat(messages, toolSchemas);

        if (result.toolCalls.length === 0) {
          finalContent = result.content ?? '';
          break;
        }

        messages.push({ role: 'assistant', content: result.content ?? '', toolCalls: result.toolCalls });

        for (const call of result.toolCalls) {
          const tool = tools.find((candidate) => candidate.name === call.name);
          let toolResult: string;

          if (!tool) {
            toolResult = `Error: no tool named "${call.name}" is connected.`;
          } else {
            try {
              const args = call.arguments ? (JSON.parse(call.arguments) as IDataObject) : {};
              toolResult = await tool.invoke(args);
            } catch (err) {
              toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          toolCallLog.push({ tool: call.name, arguments: call.arguments, result: toolResult });
          messages.push({ role: 'tool', content: toolResult, toolCallId: call.id });
        }

        if (iteration === maxIterations - 1) {
          finalContent = result.content ?? '(Reached the maximum number of iterations without a final answer.)';
        }
      }

      output.push({ json: { output: finalContent, toolCalls: toolCallLog }, pairedItem: { item: i } });
    }

    return [output];
  },
};
