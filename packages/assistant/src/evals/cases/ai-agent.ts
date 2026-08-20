import type { IEvalCase } from '../types.js';

export const AI_AGENT_CASES: IEvalCase[] = [
  {
    id: 'agent-with-calculator',
    prompt: 'build me an ai agent that can do math when it needs to',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
      { type: 'uses_node_type', nodeType: 'toolCalculator' },
      { type: 'uses_node_type', nodeType: 'lmChatOpenAi' },
    ],
  },
  {
    id: 'gpt-powered-chatbot',
    prompt: 'i want a chatbot powered by gpt that people can talk to',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'chatTrigger' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
      { type: 'uses_node_type', nodeType: 'lmChatOpenAi' },
    ],
  },
  {
    id: 'agent-needs-language-model',
    prompt: 'set up an agent — make sure it actually has a model wired up, not just the agent node alone',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
      { type: 'uses_node_type', nodeType: 'lmChatOpenAi' },
    ],
  },
  {
    id: 'agent-system-prompt',
    prompt: 'make an assistant agent — give it instructions that it should be helpful and concise',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
    ],
  },
  {
    id: 'agent-with-both-tools',
    prompt: 'i want an agent that has access to a calculator to help answer questions',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
      { type: 'uses_node_type', nodeType: 'toolCalculator' },
    ],
  },
];
