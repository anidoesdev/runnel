/** Material Symbols name per built-in node type, for previews that have no node-type catalog loaded. */
const ICONS: Record<string, string> = {
  manualTrigger: 'touch_app',
  scheduleTrigger: 'schedule',
  webhook: 'webhook',
  pollTrigger: 'sync',
  chatTrigger: 'chat',
  start: 'play_arrow',
  httpRequest: 'http',
  set: 'edit_note',
  code: 'code',
  if: 'call_split',
  switch: 'alt_route',
  filter: 'filter_alt',
  merge: 'merge',
  sort: 'sort',
  limit: 'vertical_align_top',
  removeDuplicates: 'difference',
  renameKeys: 'text_fields',
  splitInBatches: 'view_stream',
  postgres: 'database',
  aiAgent: 'smart_toy',
  lmChatOpenAi: 'psychology',
  toolCalculator: 'calculate',
  noOp: 'radio_button_unchecked',
};

export function nodeIcon(type: string): string {
  return ICONS[type] ?? 'widgets';
}

/** The built-in nodes' display names, for previews rendered without the node-type catalog. */
const LABELS: Record<string, string> = {
  httpRequest: 'HTTP Request',
  if: 'If',
  set: 'Edit Fields',
  aiAgent: 'AI Agent',
  lmChatOpenAi: 'OpenAI Chat Model',
  noOp: 'No Operation',
  splitInBatches: 'Loop Over Items',
};

/** A readable label when only the type is known: the real display name for built-ins, else "removeDuplicates" → "Remove Duplicates". */
export function nodeTypeLabel(type: string): string {
  if (LABELS[type]) return LABELS[type];
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
