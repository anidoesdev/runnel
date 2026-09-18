import type { IDataObject, IExecuteFunctions, INodeType, IPollFunctions, NodeOutput } from '@runnel/workflow';

interface IPollableItem {
  id: string | number;
  [key: string]: unknown;
}

/**
 * A minimal "list items since last time" polling trigger: on each poll it compares the
 * configured static `items` list against the ids it has already emitted (persisted via
 * getWorkflowStaticData, so the cursor survives a server restart), and emits only the new
 * ones — or nothing at all, matching a real poll() that returns `null` when there's nothing
 * new. A real polling node (RSS Feed Trigger, Airtable Trigger, ...) would call an external
 * API here instead of reading a static parameter; this stands in for that the same way
 * HttpRequest stands in for many possible API-specific nodes.
 */
export const pollTrigger: INodeType = {
  description: {
    displayName: 'Poll Trigger',
    name: 'pollTrigger',
    icon: 'fa:sync',
    group: ['trigger'],
    version: 1,
    description: 'Polls a list of items on an interval and emits any not seen before',
    defaults: { name: 'Poll Trigger' },
    inputs: [],
    outputs: ['main'],
    properties: [
      { displayName: 'Interval (Seconds)', name: 'pollIntervalSeconds', type: 'number', default: 60, typeOptions: { minValue: 1 } },
      {
        displayName: 'Items (JSON Array)',
        name: 'items',
        type: 'json',
        default: '[]',
        description: 'A JSON array of objects, each with a unique "id" field, to poll over',
      },
    ],
  },
  dryRunSafety: () => 'safe',
  /** See ScheduleTrigger.node.ts — WorkflowExecute always calls execute() on the node it starts from. */
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
  async poll(this: IPollFunctions): Promise<NodeOutput | null> {
    const raw = this.getNodeParameter('items', 0, '[]');
    const items = (typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : raw) as IPollableItem[];

    const staticData = this.getWorkflowStaticData('node');
    const seenIds = new Set((staticData.seenIds as Array<string | number> | undefined) ?? []);

    const newItems = items.filter((item) => !seenIds.has(item.id));
    if (newItems.length === 0) return null;

    for (const item of newItems) seenIds.add(item.id);
    staticData.seenIds = Array.from(seenIds) as IDataObject[string];

    return [newItems.map((item) => ({ json: item as unknown as IDataObject }))];
  },
};
