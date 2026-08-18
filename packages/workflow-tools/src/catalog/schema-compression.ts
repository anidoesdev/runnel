import { WorkflowOperationError } from '@n8n-clone/workflow';
import { NODE_USAGE_EXAMPLES } from './node-examples.js';
import type { IDataObject, INodeProperties, INodePropertyOptions, INodeTypeDescription } from '@n8n-clone/workflow';

const MAX_INLINE_OPTIONS = 30;

/**
 * Mirrors n8n's displayOptions.show/hide semantics. Duplicated from
 * packages/editor-ui/src/utils/displayOptions.ts — that copy is Vue-component-facing and
 * editor-ui isn't a dependency workflow-tools can take (or should: it would drag Vue into a
 * server-side package). Worth promoting to packages/workflow if a third copy ever shows up.
 */
function isPropertyVisible(property: INodeProperties, values: IDataObject): boolean {
  const { show, hide } = property.displayOptions ?? {};
  if (show) {
    for (const [key, allowed] of Object.entries(show)) {
      if (!allowed.includes(values[key] as string | number | boolean)) return false;
    }
  }
  if (hide) {
    for (const [key, disallowed] of Object.entries(hide)) {
      if (disallowed.includes(values[key] as string | number | boolean)) return false;
    }
  }
  return true;
}

export interface ICompressedProperty {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  default: unknown;
  description?: string;
  placeholder?: string;
  /** Present (capped at MAX_INLINE_OPTIONS) for a short `options`/`multiOptions` enum. Omitted — with optionsTruncated: true instead — once the real list would blow the token budget; call get_node_options(type, field) for those. */
  options?: Array<{ name: string; value: string | number | boolean }>;
  optionsTruncated?: boolean;
}

export interface ICompressedNodeSchema {
  type: string;
  displayName: string;
  description: string;
  category: string;
  inputs: string[];
  outputs: string[];
  credentials: string[];
  properties: ICompressedProperty[];
  example?: IDataObject;
}

function compressProperty(property: INodeProperties): ICompressedProperty {
  const compressed: ICompressedProperty = {
    name: property.name,
    displayName: property.displayName,
    type: property.type,
    required: property.required ?? false,
    default: property.default,
  };
  if (property.description) compressed.description = property.description;
  if (property.placeholder) compressed.placeholder = property.placeholder;

  if ((property.type === 'options' || property.type === 'multiOptions') && Array.isArray(property.options)) {
    const options = property.options as INodePropertyOptions[];
    if (options.length > MAX_INLINE_OPTIONS) {
      compressed.optionsTruncated = true;
    } else {
      compressed.options = options.map((option) => ({ name: option.name, value: option.value }));
    }
  }

  return compressed;
}

/**
 * Compresses a node type's full description into the agent-facing shape get_node_schema
 * returns — never the raw INodeTypeDescription. The raw description carries displayOptions
 * rule objects, nested fixedCollection/collection sub-schemas, and (for some real-world nodes)
 * enum lists hundreds of entries long; none of that is reproduced here. Nested collection
 * structure is deliberately NOT expanded — `example` teaches the concrete shape (e.g. Set's
 * `fields.values[].{name,type,value}`) far more token-efficiently than a recursive schema tree
 * would, which is exactly the kind of bloat this function exists to cut.
 *
 * When `currentParameters` is given, properties whose displayOptions rule them out for those
 * values are dropped entirely — e.g. asking for Set's schema with `{ mode: 'json' }` already
 * set won't mention the manual-mode "Fields to Set" property at all.
 */
export function compressNodeSchema(description: INodeTypeDescription, currentParameters?: IDataObject): ICompressedNodeSchema {
  const properties = (currentParameters ? description.properties.filter((p) => isPropertyVisible(p, currentParameters)) : description.properties).filter(
    (property) => property.type !== 'hidden',
  );

  const schema: ICompressedNodeSchema = {
    type: description.name,
    displayName: description.displayName,
    description: description.description,
    category: description.group[0] ?? 'other',
    inputs: description.inputs,
    outputs: description.outputs,
    credentials: (description.credentials ?? []).map((credential) => credential.name),
    properties: properties.map(compressProperty),
  };

  const example = NODE_USAGE_EXAMPLES[description.name];
  if (example && Object.keys(example).length > 0) schema.example = example;

  return schema;
}

export interface INodeOptionEntry {
  name: string;
  value: string | number | boolean;
  description?: string;
}

/** The full option list for one `options`/`multiOptions` property — what get_node_options(type, field) exists to serve once compressNodeSchema has truncated it. */
export function getFieldOptions(description: INodeTypeDescription, fieldName: string): INodeOptionEntry[] {
  const property = description.properties.find((p) => p.name === fieldName);
  if (!property) {
    throw new WorkflowOperationError(`Node type "${description.name}" has no property "${fieldName}".`);
  }
  if ((property.type !== 'options' && property.type !== 'multiOptions') || !Array.isArray(property.options)) {
    throw new WorkflowOperationError(`Property "${fieldName}" on node type "${description.name}" has no selectable options.`);
  }
  return (property.options as INodePropertyOptions[]).map((option) => ({
    name: option.name,
    value: option.value,
    description: option.description,
  }));
}
