export { manualTrigger } from './nodes/ManualTrigger/ManualTrigger.node.js';
export { chatTrigger } from './nodes/ChatTrigger/ChatTrigger.node.js';
export { start } from './nodes/Start/Start.node.js';
export { noOp } from './nodes/NoOp/NoOp.node.js';
export { setNode } from './nodes/Set/Set.node.js';
export { ifNode } from './nodes/If/If.node.js';
export { merge } from './nodes/Merge/Merge.node.js';
export { splitInBatches } from './nodes/SplitInBatches/SplitInBatches.node.js';
export { httpRequestNode } from './nodes/HttpRequest/HttpRequest.node.js';
export { codeNode } from './nodes/Code/Code.node.js';
export { scheduleTrigger } from './nodes/ScheduleTrigger/ScheduleTrigger.node.js';
export { webhook } from './nodes/Webhook/Webhook.node.js';
export { pollTrigger } from './nodes/PollTrigger/PollTrigger.node.js';
export { switchNode } from './nodes/Switch/Switch.node.js';
export { filterNode } from './nodes/Filter/Filter.node.js';
export { sortNode } from './nodes/Sort/Sort.node.js';
export { limitNode } from './nodes/Limit/Limit.node.js';
export { removeDuplicatesNode } from './nodes/RemoveDuplicates/RemoveDuplicates.node.js';
export { renameKeysNode } from './nodes/RenameKeys/RenameKeys.node.js';
export { postgresNode } from './nodes/Postgres/Postgres.node.js';
export { aiAgent } from './nodes/AiAgent/AiAgent.node.js';
export { languageModelOpenAi } from './nodes/LanguageModelOpenAi/LanguageModelOpenAi.node.js';
export { toolCalculator } from './nodes/ToolCalculator/ToolCalculator.node.js';

export { httpBasicAuth } from './credentials/HttpBasicAuth.credentials.js';
export { httpHeaderAuth } from './credentials/HttpHeaderAuth.credentials.js';
export { httpQueryAuth } from './credentials/HttpQueryAuth.credentials.js';
export { httpBearerAuth } from './credentials/HttpBearerAuth.credentials.js';
export { oAuth2Api } from './credentials/OAuth2Api.credentials.js';
export { postgresApi } from './credentials/PostgresApi.credentials.js';
export { openAiApi } from './credentials/OpenAiApi.credentials.js';

import type { MapCredentialTypes, MapNodeTypes } from '@runnel/core';
import { manualTrigger } from './nodes/ManualTrigger/ManualTrigger.node.js';
import { chatTrigger } from './nodes/ChatTrigger/ChatTrigger.node.js';
import { start } from './nodes/Start/Start.node.js';
import { noOp } from './nodes/NoOp/NoOp.node.js';
import { setNode } from './nodes/Set/Set.node.js';
import { ifNode } from './nodes/If/If.node.js';
import { merge } from './nodes/Merge/Merge.node.js';
import { splitInBatches } from './nodes/SplitInBatches/SplitInBatches.node.js';
import { httpRequestNode } from './nodes/HttpRequest/HttpRequest.node.js';
import { codeNode } from './nodes/Code/Code.node.js';
import { scheduleTrigger } from './nodes/ScheduleTrigger/ScheduleTrigger.node.js';
import { webhook } from './nodes/Webhook/Webhook.node.js';
import { pollTrigger } from './nodes/PollTrigger/PollTrigger.node.js';
import { switchNode } from './nodes/Switch/Switch.node.js';
import { filterNode } from './nodes/Filter/Filter.node.js';
import { sortNode } from './nodes/Sort/Sort.node.js';
import { limitNode } from './nodes/Limit/Limit.node.js';
import { removeDuplicatesNode } from './nodes/RemoveDuplicates/RemoveDuplicates.node.js';
import { renameKeysNode } from './nodes/RenameKeys/RenameKeys.node.js';
import { postgresNode } from './nodes/Postgres/Postgres.node.js';
import { aiAgent } from './nodes/AiAgent/AiAgent.node.js';
import { languageModelOpenAi } from './nodes/LanguageModelOpenAi/LanguageModelOpenAi.node.js';
import { toolCalculator } from './nodes/ToolCalculator/ToolCalculator.node.js';
import { httpBasicAuth } from './credentials/HttpBasicAuth.credentials.js';
import { httpHeaderAuth } from './credentials/HttpHeaderAuth.credentials.js';
import { httpQueryAuth } from './credentials/HttpQueryAuth.credentials.js';
import { httpBearerAuth } from './credentials/HttpBearerAuth.credentials.js';
import { oAuth2Api } from './credentials/OAuth2Api.credentials.js';
import { postgresApi } from './credentials/PostgresApi.credentials.js';
import { openAiApi } from './credentials/OpenAiApi.credentials.js';

/** All built-in node types, ready to register with a MapNodeTypes (or any INodeTypes) instance. */
export const allNodeTypes = [
  manualTrigger,
  chatTrigger,
  start,
  noOp,
  setNode,
  ifNode,
  merge,
  splitInBatches,
  httpRequestNode,
  codeNode,
  scheduleTrigger,
  webhook,
  pollTrigger,
  switchNode,
  filterNode,
  sortNode,
  limitNode,
  removeDuplicatesNode,
  renameKeysNode,
  postgresNode,
  aiAgent,
  languageModelOpenAi,
  toolCalculator,
];

export function registerAllNodeTypes(registry: MapNodeTypes): MapNodeTypes {
  for (const nodeType of allNodeTypes) registry.register(nodeType);
  return registry;
}

/** All built-in credential types, ready to register with a MapCredentialTypes instance. */
export const allCredentialTypes = [httpBasicAuth, httpHeaderAuth, httpQueryAuth, httpBearerAuth, oAuth2Api, postgresApi, openAiApi];

export function registerAllCredentialTypes(registry: MapCredentialTypes): MapCredentialTypes {
  for (const credentialType of allCredentialTypes) registry.register(credentialType);
  return registry;
}
