export { manualTrigger } from './nodes/ManualTrigger/ManualTrigger.node.js';
export { start } from './nodes/Start/Start.node.js';
export { noOp } from './nodes/NoOp/NoOp.node.js';
export { setNode } from './nodes/Set/Set.node.js';
export { ifNode } from './nodes/If/If.node.js';
export { merge } from './nodes/Merge/Merge.node.js';
export { splitInBatches } from './nodes/SplitInBatches/SplitInBatches.node.js';
export { httpRequestNode } from './nodes/HttpRequest/HttpRequest.node.js';
export { codeNode } from './nodes/Code/Code.node.js';

export { httpBasicAuth } from './credentials/HttpBasicAuth.credentials.js';
export { httpHeaderAuth } from './credentials/HttpHeaderAuth.credentials.js';
export { httpQueryAuth } from './credentials/HttpQueryAuth.credentials.js';
export { httpBearerAuth } from './credentials/HttpBearerAuth.credentials.js';
export { oAuth2Api } from './credentials/OAuth2Api.credentials.js';

import type { MapNodeTypes } from '@n8n-clone/core';
import { manualTrigger } from './nodes/ManualTrigger/ManualTrigger.node.js';
import { start } from './nodes/Start/Start.node.js';
import { noOp } from './nodes/NoOp/NoOp.node.js';
import { setNode } from './nodes/Set/Set.node.js';
import { ifNode } from './nodes/If/If.node.js';
import { merge } from './nodes/Merge/Merge.node.js';
import { splitInBatches } from './nodes/SplitInBatches/SplitInBatches.node.js';
import { httpRequestNode } from './nodes/HttpRequest/HttpRequest.node.js';
import { codeNode } from './nodes/Code/Code.node.js';

/** All built-in node types, ready to register with a MapNodeTypes (or any INodeTypes) instance. */
export const allNodeTypes = [
  manualTrigger,
  start,
  noOp,
  setNode,
  ifNode,
  merge,
  splitInBatches,
  httpRequestNode,
  codeNode,
];

export function registerAllNodeTypes(registry: MapNodeTypes): MapNodeTypes {
  for (const nodeType of allNodeTypes) registry.register(nodeType);
  return registry;
}
