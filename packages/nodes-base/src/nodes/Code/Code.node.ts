import { runCode } from '@n8n-clone/core';
import { NodeOperationError } from '@n8n-clone/workflow';
import type { CodeExecutionMode } from '@n8n-clone/core';
import type { IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

export const codeNode: INodeType = {
  description: {
    displayName: 'Code',
    name: 'code',
    icon: 'fa:code',
    group: ['transform'],
    version: 1,
    description: 'Runs custom JavaScript against the input items',
    defaults: { name: 'Code' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        default: 'runOnceForAllItems',
        options: [
          { name: 'Run Once for All Items', value: 'runOnceForAllItems' },
          { name: 'Run Once for Each Item', value: 'runOnceForEachItem' },
        ],
      },
      {
        displayName: 'Language',
        name: 'language',
        type: 'options',
        default: 'javaScript',
        options: [
          { name: 'JavaScript', value: 'javaScript' },
          { name: 'Python (not yet available)', value: 'python' },
        ],
      },
      {
        displayName: 'JavaScript',
        name: 'jsCode',
        type: 'string',
        default: 'return items;',
        typeOptions: { rows: 10 },
        // Deliberately not expression-resolved by getNodeParameter — code content is read
        // raw so a script that happens to start with "=" isn't misread as an n8n expression.
        noDataExpression: true,
      },
    ],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const mode = this.getNodeParameter('mode', 0, 'runOnceForAllItems') as CodeExecutionMode;
    const language = this.getNodeParameter('language', 0, 'javaScript') as string;
    const code = (this.getNode().parameters.jsCode as string | undefined) ?? '';

    if (language !== 'javaScript') {
      throw new NodeOperationError(this.getNode(), `Language "${language}" is not supported yet`, {
        description: 'Python execution via Pyodide is planned but out of scope for M5 — see sandbox.ts.',
      });
    }

    const result = await runCode({ code, mode, items });
    return [result];
  },
};
