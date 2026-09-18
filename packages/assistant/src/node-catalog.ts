import type { INodeTypes } from '@runnel/core';

/** Past this many node types a full list costs more than it saves, and search_nodes is the better tool. */
export const MAX_CATALOG_ENTRIES = 80;

/**
 * Every node type this server has, as a short section appended to the system prompt.
 *
 * search_nodes only finds what the model thinks to search for: asked to "remove duplicate
 * contacts", it searched for "filter" and "merge", never learned a Remove Duplicates node exists,
 * and built the wrong thing. With the whole catalog in view (it's small), the model picks from
 * what exists instead of guessing at queries. Generated from the registry, not written into the
 * prompt, so custom nodes loaded from CUSTOM_NODES_DIR are listed too.
 *
 * Returns undefined for an empty registry, and for one too large to list usefully.
 */
export function renderNodeCatalog(nodeTypes: INodeTypes): string | undefined {
  const descriptions = nodeTypes.list();
  if (descriptions.length === 0 || descriptions.length > MAX_CATALOG_ENTRIES) return undefined;

  const lines = [...descriptions]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((description) => `- \`${description.name}\` — ${description.displayName}: ${description.description}`);

  return [
    '## Node types available here',
    '',
    'This is every node type that exists. Use these exact type names; use `get_node_schema` for a',
    "node's parameters. If none fits the request, say so rather than forcing the closest one.",
    '',
    ...lines,
  ].join('\n');
}

/** The prompt one model call actually receives: the base prompt (with any memory block the caller added), then the catalog. */
export function composeSystemPrompt(basePrompt: string, nodeTypes: INodeTypes): string {
  const catalog = renderNodeCatalog(nodeTypes);
  return catalog ? `${basePrompt}\n\n${catalog}` : basePrompt;
}
