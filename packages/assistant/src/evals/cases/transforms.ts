import type { IEvalCase } from '../types.js';

export const TRANSFORM_CASES: IEvalCase[] = [
  {
    id: 'if-branch',
    prompt: 'branch based on whether the amount is over 100',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'if' }],
  },
  {
    id: 'switch-route',
    prompt: 'route items into different paths depending on their tier',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'switch' }],
  },
  {
    id: 'filter-active',
    prompt: 'only keep the items where status equals active',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'filter' }],
  },
  {
    id: 'sort-by-date',
    prompt: 'sort my results by the created date',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'sort' }],
  },
  {
    id: 'limit-top-n',
    prompt: 'i only want the first 10 results, drop the rest',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'limit' }],
  },
  {
    id: 'dedupe-by-email',
    prompt: 'strip out duplicate entries, compare by email',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'removeDuplicates' }],
  },
  {
    id: 'rename-field',
    prompt: 'i need to rename a field from old_name to new_name',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'renameKeys' }],
  },
  {
    id: 'merge-two-sources',
    prompt: 'combine data coming from two different places into one list',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'merge' }],
  },
];
