import { describe, expect, it } from 'vitest';
import { Workflow } from './workflow.js';
import { makeNode, makeWorkflow } from './test-utils.js';

describe('Workflow.renameNode', () => {
  it('renames the node itself', () => {
    const workflow = new Workflow(makeWorkflow([makeNode({ name: 'Old' })], {}));
    const renamed = workflow.renameNode('Old', 'New');

    expect(renamed.getNode('New')).toBeDefined();
    expect(renamed.getNode('Old')).toBeUndefined();
  });

  it('does not mutate the original workflow', () => {
    const workflow = new Workflow(makeWorkflow([makeNode({ name: 'Old' })], {}));
    workflow.renameNode('Old', 'New');

    expect(workflow.getNode('Old')).toBeDefined();
  });

  it('rewrites the connection source key and every target reference', () => {
    const nodes = ['Old', 'B', 'C'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        Old: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
        B: { main: [[{ node: 'Old', type: 'main', index: 0 }]] }, // back-edge referencing Old as a target
      }),
    );

    const renamed = workflow.renameNode('Old', 'New');

    expect(renamed.getChildNodes('New')).toContain('B');
    // B's connection targeting "Old" must now target "New" — asserted via traversal
    // rather than reaching into the private definition field.
    expect(renamed.getParentNodes('New')).toContain('B');
  });

  it('rewrites the pinData key', () => {
    const workflow = new Workflow({
      ...makeWorkflow([makeNode({ name: 'Old' })], {}),
      pinData: { Old: [{ json: { a: 1 } }] },
    });

    const renamed = workflow.renameNode('Old', 'New');
    const snapshot = renamed.toJSON();

    expect(snapshot.pinData).toEqual({ New: [{ json: { a: 1 } }] });
  });

  it('rewrites $node["Old"] and $node[\'Old\'] references in expression parameters', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Consumer', parameters: { value: '={{ $node["Old"].json.foo }}' } }),
      makeNode({ name: 'Consumer2', parameters: { value: "={{ $node['Old'].json.foo }}" } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', 'New');

    expect(renamed.getNode('Consumer')!.parameters.value).toBe('={{ $node["New"].json.foo }}');
    expect(renamed.getNode('Consumer2')!.parameters.value).toBe("={{ $node['New'].json.foo }}");
  });

  it('rewrites $("Old") call-style references', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Consumer', parameters: { value: '={{ $("Old").item.json.foo }}' } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', 'New');
    expect(renamed.getNode('Consumer')!.parameters.value).toBe('={{ $("New").item.json.foo }}');
  });

  it('rewrites references nested inside objects and arrays within parameters', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({
        name: 'Consumer',
        parameters: {
          fields: {
            values: [{ name: 'x', value: '={{ $node["Old"].json.x }}' }, { name: 'y', value: 'plain' }],
          },
        },
      }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', 'New');
    const params = renamed.getNode('Consumer')!.parameters as {
      fields: { values: Array<{ name: string; value: string }> };
    };
    expect(params.fields.values[0]!.value).toBe('={{ $node["New"].json.x }}');
    expect(params.fields.values[1]!.value).toBe('plain');
  });

  it('does NOT rewrite matching text inside a non-expression (literal) string', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Consumer', parameters: { note: '$node["Old"] is just a code sample here' } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', 'New');
    expect(renamed.getNode('Consumer')!.parameters.note).toBe('$node["Old"] is just a code sample here');
  });

  it('handles a node name that itself contains a quote character', () => {
    const oldName = `Bob's Node`;
    const nodes = [
      makeNode({ name: oldName }),
      makeNode({ name: 'Consumer', parameters: { value: `={{ $node["Bob's Node"].json.x }}` } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode(oldName, 'Bob');
    expect(renamed.getNode('Consumer')!.parameters.value).toBe('={{ $node["Bob"].json.x }}');
  });

  it('renaming to a name containing a different quote style leaves it unescaped', () => {
    // The reference uses double quotes, so a single quote in the new name needs no escaping.
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Consumer', parameters: { value: '={{ $node["Old"].json.x }}' } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', `New's Node`);
    expect(renamed.getNode('Consumer')!.parameters.value).toBe(`={{ $node["New's Node"].json.x }}`);
  });

  it('renaming to a name containing the same quote style escapes it', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Consumer', parameters: { value: '={{ $node["Old"].json.x }}' } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', `New "Quoted" Node`);
    expect(renamed.getNode('Consumer')!.parameters.value).toBe(
      '={{ $node["New \\"Quoted\\" Node"].json.x }}',
    );
  });

  it('leaves a same-name expression to a different node untouched', () => {
    const nodes = [
      makeNode({ name: 'Old' }),
      makeNode({ name: 'Other' }),
      makeNode({ name: 'Consumer', parameters: { value: '={{ $node["Other"].json.x }}' } }),
    ];
    const workflow = new Workflow(makeWorkflow(nodes, {}));

    const renamed = workflow.renameNode('Old', 'New');
    expect(renamed.getNode('Consumer')!.parameters.value).toBe('={{ $node["Other"].json.x }}');
  });

  it('throws when renaming a node that does not exist', () => {
    const workflow = new Workflow(makeWorkflow([makeNode({ name: 'A' })], {}));
    expect(() => workflow.renameNode('Missing', 'New')).toThrow(/not found/);
  });

  it('throws when the new name is already taken', () => {
    const nodes = ['A', 'B'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, {}));
    expect(() => workflow.renameNode('A', 'B')).toThrow(/already exists/);
  });

  it('is a no-op that returns the same instance when old and new names match', () => {
    const workflow = new Workflow(makeWorkflow([makeNode({ name: 'A' })], {}));
    expect(workflow.renameNode('A', 'A')).toBe(workflow);
  });
});
