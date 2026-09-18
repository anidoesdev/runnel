import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  NodeOutput,
} from '@runnel/workflow';

/**
 * Synthetic node types used only by the execution-engine test suite. Real node
 * implementations (Set, IF, Merge, Split In Batches, ...) land in M5 — these exist purely to
 * exercise WorkflowExecute's graph-walking, branching, multi-input-wait, loop, and error
 * semantics without depending on unbuilt node infrastructure (property schemas, credentials).
 */

function description(overrides: Partial<INodeType['description']>): INodeType['description'] {
  return {
    displayName: overrides.name ?? 'Test Node',
    name: 'test.node',
    group: ['transform'],
    version: 1,
    description: 'Test node',
    defaults: { name: 'Test Node' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    ...overrides,
  };
}

export const testNoOpNode: INodeType = {
  description: description({ name: 'test.noOp' }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
};

/** Merges a fixed set of json fields (from the `assignments` parameter) into every item. */
export const testSetNode: INodeType = {
  description: description({ name: 'test.set' }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const output = items.map((item, i) => {
      const assignments = this.getNodeParameter('assignments', i, {}) as IDataObject;
      return { json: { ...item.json, ...assignments }, pairedItem: { item: i } };
    });
    return [output];
  },
};

/** Routes each item to output 0 (true) or output 1 (false) based on the `condition` parameter. */
export const testIfNode: INodeType = {
  description: description({ name: 'test.if', outputs: ['main', 'main'] }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const trueItems: INodeExecutionData[] = [];
    const falseItems: INodeExecutionData[] = [];
    items.forEach((item, i) => {
      const condition = this.getNodeParameter('condition', i, false);
      (condition ? trueItems : falseItems).push({ json: item.json, pairedItem: { item: i } });
    });
    return [trueItems, falseItems];
  },
};

/** Appends input 1's items after input 0's items. */
export const testMergeNode: INodeType = {
  description: description({ name: 'test.merge', inputs: ['main', 'main'] }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [[...this.getInputData(0), ...this.getInputData(1)]];
  },
};

/**
 * A Split-In-Batches-style loop: on first entry it snapshots the input batch into node
 * context; each subsequent run emits exactly one item on output 0 (loop back to the body)
 * until the batch is exhausted, then emits the whole batch on output 1 (done) with an empty
 * output 0 — which naturally stops the loop, since nothing is left to feed the body.
 */
export const testLoopNode: INodeType = {
  description: description({ name: 'test.loop', outputs: ['main', 'main'] }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const context = this.getContext('node') as { position?: number; items?: IDataObject[] };
    if (context.items === undefined) {
      context.items = this.getInputData().map((item) => item.json);
      context.position = 0;
    }
    const items = context.items;
    const position = context.position!;

    if (position < items.length) {
      context.position = position + 1;
      return [[{ json: items[position]!, pairedItem: { item: position } }], []];
    }

    return [[], items.map((json, i) => ({ json, pairedItem: { item: i } }))];
  },
};

export const testThrowingNode: INodeType = {
  description: description({ name: 'test.throwing' }),
  async execute(): Promise<NodeOutput> {
    throw new Error('Test node always fails');
  },
};

/** Fails on its first two invocations (tracked via node context) then succeeds — for retryOnFail tests. */
export const testFlakyNode: INodeType = {
  description: description({ name: 'test.flaky' }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const context = this.getContext('node') as { attempts?: number };
    context.attempts = (context.attempts ?? 0) + 1;
    if (context.attempts < 3) {
      throw new Error(`Flaky failure #${context.attempts}`);
    }
    return [this.getInputData()];
  },
};

export const testNoOutputNode: INodeType = {
  description: description({ name: 'test.noOutput' }),
  async execute(): Promise<NodeOutput> {
    return [[]];
  },
};

/** Tags every item with `ranReal: true` and declares itself dry-run safe — used to prove a dry run actually calls execute() for a node classified 'safe'. */
export const testDryRunSafeNode: INodeType = {
  description: description({ name: 'test.dryRunSafe' }),
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData().map((item) => ({ json: { ...item.json, ranReal: true } }))];
  },
};

/** Same body as testDryRunSafeNode but declares no dryRunSafety (defaults to 'mock') — used to prove a dry run never calls this execute() at all, instead recording a passthrough. */
export const testDryRunUnsafeNode: INodeType = {
  description: description({ name: 'test.dryRunUnsafe' }),
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData().map((item) => ({ json: { ...item.json, ranReal: true } }))];
  },
};
