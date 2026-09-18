import type { IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@runnel/workflow';

function appendMode(input0: INodeExecutionData[], input1: INodeExecutionData[]): INodeExecutionData[] {
  return [...input0, ...input1];
}

function combineByPositionMode(input0: INodeExecutionData[], input1: INodeExecutionData[]): INodeExecutionData[] {
  const length = Math.max(input0.length, input1.length);
  const output: INodeExecutionData[] = [];
  for (let i = 0; i < length; i++) {
    const left = input0[i]?.json ?? {};
    const right = input1[i]?.json ?? {};
    output.push({ json: { ...left, ...right }, pairedItem: [{ item: i, input: 0 }, { item: i, input: 1 }] });
  }
  return output;
}

/** Inner join: only positions with a match on both sides are emitted. Unmatched rows on either side are dropped — a documented simplification, not an outer join. */
function combineByKeyMode(
  input0: INodeExecutionData[],
  input1: INodeExecutionData[],
  key: string,
): INodeExecutionData[] {
  const output: INodeExecutionData[] = [];
  input0.forEach((leftItem, leftIndex) => {
    const rightIndex = input1.findIndex((rightItem) => rightItem.json[key] === leftItem.json[key]);
    if (rightIndex === -1) return;
    output.push({
      json: { ...leftItem.json, ...input1[rightIndex]!.json },
      pairedItem: [{ item: leftIndex, input: 0 }, { item: rightIndex, input: 1 }],
    });
  });
  return output;
}

export const merge: INodeType = {
  description: {
    displayName: 'Merge',
    name: 'merge',
    icon: 'fa:code-branch',
    group: ['transform'],
    version: 1,
    description: 'Combines items from two inputs',
    defaults: { name: 'Merge' },
    inputs: ['main', 'main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        default: 'append',
        options: [
          { name: 'Append', value: 'append' },
          { name: 'Combine by Position', value: 'combineByPosition' },
          { name: 'Combine by Key', value: 'combineByKey' },
        ],
      },
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        default: 'id',
        displayOptions: { show: { mode: ['combineByKey'] } },
      },
    ],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const input0 = this.getInputData(0);
    const input1 = this.getInputData(1);
    const mode = this.getNodeParameter('mode', 0, 'append') as string;

    if (mode === 'combineByPosition') return [combineByPositionMode(input0, input1)];
    if (mode === 'combineByKey') {
      const key = this.getNodeParameter('key', 0, 'id') as string;
      return [combineByKeyMode(input0, input1, key)];
    }
    return [appendMode(input0, input1)];
  },
};

// Re-exported for direct unit testing of each merge strategy in isolation.
export const mergeModes = { appendMode, combineByPositionMode, combineByKeyMode };
