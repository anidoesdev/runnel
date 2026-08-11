import type { IExecuteFunctions, INodeType, ITriggerFunctions, ITriggerResponse, NodeOutput } from '@n8n-clone/workflow';

type IntervalUnit = 'seconds' | 'minutes' | 'hours';

const unitToMs: Record<IntervalUnit, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000 };

/**
 * Runs the workflow on a fixed interval. Real n8n's Schedule Trigger also accepts full cron
 * expressions via a cron-parsing library; this is scoped to a simple interval (matching the
 * project's other deliberate scope decisions, e.g. HttpRequest's proxy option or the Code
 * node's vm sandbox) — ActiveWorkflowManager just needs *a* node that proves the trigger()
 * lifecycle (setInterval + emit + closeFunction) end-to-end.
 */
export const scheduleTrigger: INodeType = {
  description: {
    displayName: 'Schedule Trigger',
    name: 'scheduleTrigger',
    icon: 'fa:clock',
    group: ['trigger'],
    version: 1,
    description: 'Runs the workflow repeatedly on a fixed interval',
    defaults: { name: 'Schedule Trigger' },
    inputs: [],
    outputs: ['main'],
    properties: [
      { displayName: 'Interval', name: 'interval', type: 'number', default: 1, typeOptions: { minValue: 1 } },
      {
        displayName: 'Unit',
        name: 'unit',
        type: 'options',
        default: 'minutes',
        options: [
          { name: 'Seconds', value: 'seconds' },
          { name: 'Minutes', value: 'minutes' },
          { name: 'Hours', value: 'hours' },
        ],
      },
    ],
  },
  /**
   * ActiveWorkflowManager runs the rest of the workflow via WorkflowExecute.run(workflow,
   * node.name, emittedData) — which executes the *start* node too, feeding it the emitted
   * data as its own input. Every node WorkflowExecute can start from needs an execute(); for
   * a trigger, that's just an identity passthrough (same pattern as ManualTrigger).
   */
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const interval = Math.max(1, this.getNodeParameter('interval', 0, 1) as number);
    const unit = this.getNodeParameter('unit', 0, 'minutes') as IntervalUnit;
    const intervalMs = interval * unitToMs[unit];

    const fire = (): void => {
      this.emit([[{ json: { timestamp: new Date().toISOString() } }]]);
    };

    const timer = setInterval(fire, intervalMs);

    return {
      closeFunction: async () => {
        clearInterval(timer);
      },
      manualTriggerFunction: async () => {
        fire();
      },
    };
  },
};
