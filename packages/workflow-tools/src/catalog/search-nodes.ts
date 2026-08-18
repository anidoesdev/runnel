import { Bm25Index } from './bm25.js';
import { NODE_ALIASES } from './node-aliases.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

export interface INodeSearchResult {
  type: string;
  displayName: string;
  description: string;
  category: string;
  score: number;
}

function searchableText(description: INodeTypeDescription): string {
  const aliases = NODE_ALIASES[description.name] ?? [];
  return [description.displayName, description.description, description.name, ...aliases].join(' ');
}

/**
 * BM25 over displayName + description + type name + hand-seeded aliases (node-aliases.ts) —
 * no embedding blending. For the ~23-node catalog registered today that's a deliberate scoping
 * call (see the Milestone 2 discussion): embeddings mean a network call, latency, cost, and
 * non-determinism to mock in every test, for a search space small enough that lexical search
 * plus a maintained alias table clears the accuracy bar on its own. Revisit once the catalog is
 * large enough — hundreds of node types — that lexical matching alone starts missing genuinely
 * semantic queries the alias table hasn't anticipated.
 */
export function searchNodeTypes(descriptions: INodeTypeDescription[], query: string, limit = 10): INodeSearchResult[] {
  const index = new Bm25Index(descriptions.map((d) => ({ id: d.name, text: searchableText(d), payload: d })));
  return index.search(query, limit).map((result) => ({
    type: result.payload.name,
    displayName: result.payload.displayName,
    description: result.payload.description,
    category: result.payload.group[0] ?? 'other',
    score: result.score,
  }));
}
