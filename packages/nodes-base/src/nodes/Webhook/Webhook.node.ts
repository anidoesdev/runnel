import type {
  IDataObjectValue,
  IExecuteFunctions,
  INodeType,
  IWebhookFunctions,
  IWebhookResponseData,
  NodeOutput,
} from '@runnel/workflow';

/**
 * Starts the workflow when a matching HTTP request arrives at
 * `/webhook/<path>`. The concrete method/path are this node instance's own `httpMethod`/
 * `path` parameters — ActiveWorkflowManager reads them directly (via getNodeParameter) when
 * registering the workflow's webhooks rather than through `description.webhooks`, which would
 * otherwise need an expression-in-metadata resolution layer (a fuller implementation's
 * `={{$parameter["path"]}}` webhook-path syntax) that's out of scope here; "is this a webhook
 * node" is instead determined purely by `typeof nodeType.webhook === 'function'`.
 */
export const webhook: INodeType = {
  description: {
    displayName: 'Webhook',
    name: 'webhook',
    icon: 'fa:satellite-dish',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when a matching HTTP request is received',
    defaults: { name: 'Webhook' },
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        displayName: 'HTTP Method',
        name: 'httpMethod',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
      },
      {
        displayName: 'Path',
        name: 'path',
        type: 'string',
        default: '',
        required: true,
        description: 'The URL segment after /webhook/ — e.g. "my-hook" registers /webhook/my-hook',
      },
      {
        displayName: 'Response Mode',
        name: 'responseMode',
        type: 'options',
        default: 'onReceived',
        options: [
          { name: 'Immediately', value: 'onReceived' },
          { name: 'When Last Node Finishes', value: 'lastNode' },
        ],
      },
      { displayName: 'Response Code', name: 'responseCode', type: 'number', default: 200 },
    ],
  },
  dryRunSafety: () => 'safe',
  /** See ScheduleTrigger.node.ts — WorkflowExecute always calls execute() on the node it starts from. */
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    return {
      workflowData: [
        [
          {
            json: {
              headers: req.headers,
              params: {},
              query: req.query,
              body: (req.body ?? null) as IDataObjectValue,
            },
          },
        ],
      ],
    };
  },
};
