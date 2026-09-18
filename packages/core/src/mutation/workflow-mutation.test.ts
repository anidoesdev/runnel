import { describe, expect, it } from 'vitest';
import {
  addNode,
  connectNodes,
  disconnectNodes,
  getWorkflowOutline,
  removeNode,
  renameNode,
  setNodeCredential,
  setNodeParameters,
} from './workflow-mutation.js';
import { MapNodeTypes } from '../execution/node-types.js';
import { testNoOpNode } from '../execution/test-nodes.js';
import type { INodeType, IWorkflowBase } from '@runnel/workflow';

const testSubNode: INodeType = {
  description: {
    displayName: 'Test Chat Model',
    name: 'test.chatModel',
    group: ['ai'],
    version: 1,
    description: 'Test chat model sub-node',
    defaults: { name: 'Test Chat Model' },
    inputs: [],
    outputs: ['ai_languageModel'],
    properties: [],
  },
};

const testAgentNode: INodeType = {
  description: {
    displayName: 'Test Agent',
    name: 'test.agent',
    group: ['ai'],
    version: 1,
    description: 'Test agent',
    defaults: { name: 'Test Agent' },
    inputs: ['main', 'ai_languageModel'],
    outputs: ['main'],
    properties: [
      { displayName: 'Prompt', name: 'prompt', type: 'string', default: '', required: true },
      { displayName: 'Options', name: 'nested', type: 'collection', default: {} },
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        default: 'fast',
        options: [
          { name: 'Fast', value: 'fast' },
          { name: 'Careful', value: 'careful' },
        ],
      },
    ],
    credentials: [{ name: 'testApi' }],
  },
};

function registry() {
  return new MapNodeTypes().register(testNoOpNode).register(testSubNode).register(testAgentNode);
}

function baseWorkflow(): IWorkflowBase {
  return { id: 'wf-1', name: 'Test Workflow', active: false, nodes: [], connections: {} };
}

describe('addNode', () => {
  it('adds a node with a deduped name and the resolved default version', () => {
    const nodeTypes = registry();
    const wf = baseWorkflow();
    const { workflow, name } = addNode(wf, nodeTypes, { type: 'test.noOp' });
    expect(name).toBe('Test Node');
    expect(workflow.nodes).toHaveLength(1);
    expect(workflow.nodes[0]).toMatchObject({ name: 'Test Node', type: 'test.noOp', typeVersion: 1 });
  });

  it('does not mutate the input workflow', () => {
    const wf = baseWorkflow();
    addNode(wf, registry(), { type: 'test.noOp' });
    expect(wf.nodes).toHaveLength(0);
  });

  it('uses the given position verbatim when provided', () => {
    const { workflow } = addNode(baseWorkflow(), registry(), { type: 'test.noOp', position: [500, 500] });
    expect(workflow.nodes[0]!.position).toEqual([500, 500]);
  });

  it('cascades a default position by node count when none is given, so agent-added nodes do not stack at [0,0]', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    expect(wf.nodes[0]!.position).not.toEqual(wf.nodes[1]!.position);
  });

  it('de-duplicates a requested name that already exists', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'Step' }).workflow;
    const second = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'Step' });
    expect(second.name).toBe('Step 2');
  });

  it('rejects an unknown node type instead of adding it', () => {
    expect(() => addNode(baseWorkflow(), registry(), { type: 'not.a.real.node' })).toThrow(/Unknown node type/);
  });
});

describe('connectNodes', () => {
  it('refuses to connect a node to itself, leaving the workflow unchanged', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;

    expect(() => connectNodes(wf, nodeTypes, { from: 'A', to: 'A' })).toThrow(/can't be connected to itself/);
    expect(wf.connections).toEqual({});
  });

  it('connects two main-compatible nodes', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'A', to: 'B' });
    expect(wf.connections.A?.main?.[0]).toEqual([{ node: 'B', type: 'main', index: 0 }]);
  });

  it('is idempotent', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'A', to: 'B' });
    wf = connectNodes(wf, nodeTypes, { from: 'A', to: 'B' });
    expect(wf.connections.A?.main?.[0]).toHaveLength(1);
  });

  it('connects a sub-node output to an agent\'s matching input', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.chatModel', name: 'Model' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'Model', to: 'Agent', type: 'ai_languageModel' });
    expect(wf.connections.Model?.ai_languageModel?.[0]).toEqual([{ node: 'Agent', type: 'ai_languageModel', index: 0 }]);
  });

  it('rejects a connection type neither end declares — structurally impossible, not just discouraged', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.chatModel', name: 'Model' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    expect(() => connectNodes(wf, nodeTypes, { from: 'Model', to: 'B', type: 'ai_languageModel' })).toThrow(
      /has no "ai_languageModel" input/,
    );
  });

  it('rejects connecting from a node that does not exist', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    expect(() => connectNodes(wf, nodeTypes, { from: 'Missing', to: 'B' })).toThrow(/not found/);
  });
});

describe('disconnectNodes', () => {
  it('removes exactly the matching edge', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'A', to: 'B' });
    wf = disconnectNodes(wf, { from: 'A', to: 'B' });
    expect(wf.connections.A?.main?.[0]).toEqual([]);
  });

  it('is a no-op, not an error, when nothing was connected', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'B' }).workflow;
    expect(() => disconnectNodes(wf, { from: 'A', to: 'B' })).not.toThrow();
  });
});

describe('setNodeParameters', () => {
  it('deep-merges into existing parameters without clobbering untouched fields', () => {
    const nodeTypes = registry();
    let wf = addNode(baseWorkflow(), nodeTypes, {
      type: 'test.agent',
      name: 'Agent',
      parameters: { prompt: 'hi', nested: { a: 1, b: 2 } },
    }).workflow;
    wf = setNodeParameters(wf, { name: 'Agent', parameters: { nested: { b: 99 } } });
    const node = wf.nodes.find((n) => n.name === 'Agent')!;
    expect(node.parameters).toEqual({ prompt: 'hi', nested: { a: 1, b: 99 } });
  });

  it('rejects an unknown node name', () => {
    expect(() => setNodeParameters(baseWorkflow(), { name: 'Missing', parameters: {} })).toThrow(/not found/);
  });
});

describe('unknown parameter names', () => {
  it('addNode rejects a parameter the node type does not declare, and lists the valid ones', () => {
    expect(() => addNode(baseWorkflow(), registry(), { type: 'test.agent', parameters: { method: 'POST' } })).toThrow(
      /no parameter "method"\. Valid parameters: prompt, nested, mode/,
    );
  });

  it('setNodeParameters rejects unknown names when given the catalog, and leaves the node untouched', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.agent', name: 'Agent', parameters: { prompt: 'hi' } }).workflow;

    expect(() => setNodeParameters(wf, { name: 'Agent', parameters: { promt: 'typo' } }, nodeTypes)).toThrow(/no parameter "promt"/);
    expect(wf.nodes[0]!.parameters).toEqual({ prompt: 'hi' });
  });

  it('rejects a value an options parameter does not offer, listing the ones it does', () => {
    expect(() => addNode(baseWorkflow(), registry(), { type: 'test.agent', parameters: { mode: 'immediate' } })).toThrow(
      /"immediate" is not a valid value for "mode".*Valid values: "fast", "careful"/,
    );
  });

  it('lets an expression through an options parameter, since its value is only known at run time', () => {
    const { workflow } = addNode(baseWorkflow(), registry(), { type: 'test.agent', parameters: { mode: '={{ $json.mode }}' } });
    expect(workflow.nodes[0]!.parameters.mode).toBe('={{ $json.mode }}');
  });

  it('accepts declared names', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    expect(setNodeParameters(wf, { name: 'Agent', parameters: { prompt: 'ok' } }, nodeTypes).nodes[0]!.parameters).toEqual({ prompt: 'ok' });
  });
});

describe('renameNode', () => {
  it('renames the node and rewrites connections and expressions (delegates to Workflow.renameNode)', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    wf = addNode(wf, nodeTypes, {
      type: 'test.agent',
      name: 'B',
      parameters: { prompt: '={{ $node["A"].json.value }}' },
    }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'A', to: 'B' });

    wf = renameNode(wf, { oldName: 'A', newName: 'Start' });

    expect(wf.nodes.map((n) => n.name)).toEqual(['Start', 'B']);
    expect(wf.connections.Start?.main?.[0]).toEqual([{ node: 'B', type: 'main', index: 0 }]);
    expect(wf.connections.A).toBeUndefined();
    expect(wf.nodes.find((n) => n.name === 'B')!.parameters.prompt).toBe('={{ $node["Start"].json.value }}');
  });
});

describe('removeNode', () => {
  it('removes the node and every connection referencing it, main or sub-node', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.chatModel', name: 'Model' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'Model', to: 'Agent', type: 'ai_languageModel' });

    wf = removeNode(wf, { name: 'Agent' });

    expect(wf.nodes.map((n) => n.name)).toEqual(['Model']);
    expect(wf.connections.Model?.ai_languageModel?.[0]).toEqual([]);
  });
});

describe('setNodeCredential', () => {
  it('names the credential types a node does take when given the wrong one', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    expect(() => setNodeCredential(wf, nodeTypes, { name: 'Agent', credentialType: 'openai', credentialId: 'c1' })).toThrow(
      /does not use a "openai" credential\. It uses: testApi\./,
    );
  });

  it('says so when the node takes no credentials at all', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    expect(() => setNodeCredential(wf, nodeTypes, { name: 'A', credentialType: 'testApi', credentialId: 'c1' })).toThrow(/It takes no credentials\./);
  });

  it('attaches a credential type the node declares', () => {
    const nodeTypes = registry();
    let wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    wf = setNodeCredential(wf, nodeTypes, { name: 'Agent', credentialType: 'testApi', credentialId: 'cred-1', credentialName: 'My Cred' });
    expect(wf.nodes[0]!.credentials).toEqual({ testApi: { id: 'cred-1', name: 'My Cred' } });
  });

  it('rejects a credential type the node does not declare — not a silent no-op', () => {
    const nodeTypes = registry();
    const wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.noOp', name: 'A' }).workflow;
    expect(() => setNodeCredential(wf, nodeTypes, { name: 'A', credentialType: 'testApi', credentialId: 'cred-1' })).toThrow(
      /does not use a "testApi" credential/,
    );
  });

  it('clears a credential when credentialId is null', () => {
    const nodeTypes = registry();
    let wf = addNode(baseWorkflow(), nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    wf = setNodeCredential(wf, nodeTypes, { name: 'Agent', credentialType: 'testApi', credentialId: 'cred-1' });
    wf = setNodeCredential(wf, nodeTypes, { name: 'Agent', credentialType: 'testApi', credentialId: null });
    expect(wf.nodes[0]!.credentials).toEqual({});
  });
});

describe('getWorkflowOutline', () => {
  it('reports unset required parameters and connections in a compact shape', () => {
    const nodeTypes = registry();
    let wf = baseWorkflow();
    wf = addNode(wf, nodeTypes, { type: 'test.chatModel', name: 'Model' }).workflow;
    wf = addNode(wf, nodeTypes, { type: 'test.agent', name: 'Agent' }).workflow;
    wf = connectNodes(wf, nodeTypes, { from: 'Model', to: 'Agent', type: 'ai_languageModel' });

    const outline = getWorkflowOutline(wf, nodeTypes);

    expect(outline.nodes).toEqual([
      { name: 'Model', type: 'test.chatModel', disabled: false, unsetRequiredParams: [] },
      { name: 'Agent', type: 'test.agent', disabled: false, unsetRequiredParams: ['prompt'] },
    ]);
    expect(outline.connections).toEqual([
      { from: 'Model', outputIndex: 0, to: 'Agent', inputIndex: 0, type: 'ai_languageModel' },
    ]);
  });

  it('does not throw on a node whose type is no longer registered', () => {
    const wf: IWorkflowBase = {
      ...baseWorkflow(),
      nodes: [{ id: '1', name: 'Ghost', type: 'nope.uninstalled', typeVersion: 1, position: [0, 0], parameters: {} }],
    };
    const outline = getWorkflowOutline(wf, registry());
    expect(outline.nodes).toEqual([{ name: 'Ghost', type: 'nope.uninstalled', disabled: false, unsetRequiredParams: [] }]);
  });
});
