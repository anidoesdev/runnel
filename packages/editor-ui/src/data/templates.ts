import type { IConnections, INode } from '@runnel/workflow';

export interface IWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Node names shown on the card, so the shape is readable before you open it. */
  steps: string[];
  build: () => { nodes: INode[]; connections: IConnections };
}

/**
 * Starter workflows, built from this project's own node types rather than fetched from a
 * template service. Each one is a working shape with the parameters that have obvious defaults
 * filled in — anything user-specific (a URL, a credential, a query) is left for the user to set,
 * which is also why templates open as an unsaved draft instead of running straight away.
 */

let counter = 0;
/** Node ids only need to be unique inside one workflow; the server never sees these as keys. */
function nodeId(): string {
  counter += 1;
  return `tpl-${Date.now().toString(36)}-${counter}`;
}

function node(name: string, type: string, position: [number, number], parameters: INode['parameters'] = {}): INode {
  return { id: nodeId(), name, type, typeVersion: 1, position, parameters };
}

function chain(...names: string[]): IConnections {
  const connections: IConnections = {};
  for (let i = 0; i < names.length - 1; i++) {
    connections[names[i]!] = { main: [[{ node: names[i + 1]!, type: 'main', index: 0 }]] };
  }
  return connections;
}

export const WORKFLOW_TEMPLATES: IWorkflowTemplate[] = [
  {
    id: 'scheduled-api-sync',
    name: 'Scheduled API sync',
    description: 'Every hour, call an API and reshape the response into the fields you care about.',
    icon: 'schedule',
    steps: ['Schedule Trigger', 'HTTP Request', 'Set'],
    build: () => ({
      nodes: [
        node('Schedule Trigger', 'scheduleTrigger', [0, 0], { interval: 1, unit: 'hours' }),
        node('HTTP Request', 'httpRequest', [260, 0], { method: 'GET', url: 'https://api.example.com/items' }),
        node('Set', 'set', [520, 0], {}),
      ],
      connections: chain('Schedule Trigger', 'HTTP Request', 'Set'),
    }),
  },
  {
    id: 'webhook-intake',
    name: 'Webhook intake',
    description: 'Receive a POST, keep only the valid records, and drop duplicates before you use them.',
    icon: 'webhook',
    steps: ['Webhook', 'Filter', 'Remove Duplicates'],
    build: () => ({
      nodes: [
        node('Webhook', 'webhook', [0, 0], { httpMethod: 'POST', path: 'intake', responseMode: 'onReceived' }),
        node('Filter', 'filter', [260, 0], {}),
        node('Remove Duplicates', 'removeDuplicates', [520, 0], {}),
      ],
      connections: chain('Webhook', 'Filter', 'Remove Duplicates'),
    }),
  },
  {
    id: 'ai-chat-agent',
    name: 'AI chat agent',
    description: 'A chat box wired to an AI agent, with a calculator tool it can call.',
    icon: 'smart_toy',
    steps: ['Chat Trigger', 'AI Agent', 'OpenAI Chat Model', 'Calculator'],
    build: () => ({
      nodes: [
        node('Chat Trigger', 'chatTrigger', [0, 0], {}),
        node('AI Agent', 'aiAgent', [280, 0], {}),
        node('OpenAI Chat Model', 'languageModelOpenAi', [180, 200]),
        node('Calculator', 'toolCalculator', [400, 200], {}),
      ],
      connections: {
        ...chain('Chat Trigger', 'AI Agent'),
        // Sub-nodes connect *into* the agent, each on its own port kind (see ai-agent-integration.test.ts).
        'OpenAI Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
        Calculator: { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] },
      },
    }),
  },
  {
    id: 'batch-processing',
    name: 'Batch processing',
    description: 'Run something by hand, then work through the results in small batches.',
    icon: 'stacks',
    steps: ['Manual Trigger', 'HTTP Request', 'Split In Batches', 'Set'],
    build: () => ({
      nodes: [
        node('Manual Trigger', 'manualTrigger', [0, 0], {}),
        node('HTTP Request', 'httpRequest', [260, 0], { method: 'GET', url: 'https://api.example.com/items' }),
        node('Split In Batches', 'splitInBatches', [520, 0], { batchSize: 10 }),
        node('Set', 'set', [780, 0], {}),
      ],
      connections: chain('Manual Trigger', 'HTTP Request', 'Split In Batches', 'Set'),
    }),
  },
];
