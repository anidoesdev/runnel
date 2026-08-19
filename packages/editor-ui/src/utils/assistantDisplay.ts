import type { IDataObject } from '@n8n-clone/workflow';

/**
 * "Render each tool call as a compact collapsible row: `⚙ Added node...` Do not dump raw JSON
 * args; humanize per tool." One case per tool the assistant can actually call — falls back to
 * the raw name for anything unrecognized rather than guessing at a phrasing.
 */
export function humanizeToolCall(name: string, args: unknown, result: unknown, running: boolean): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const r = (result ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'search_nodes':
      return `Searched for "${String(a.query ?? '')}"`;
    case 'get_node_schema':
      return `Looked up the schema for ${String(a.type ?? 'a node type')}`;
    case 'get_node_options':
      return `Looked up options for ${String(a.type ?? '')}.${String(a.field ?? '')}`;
    case 'add_node':
      return running ? `Adding a ${String(a.type ?? '')} node…` : `Added node "${String(r.name ?? a.name ?? '')}"`;
    case 'connect_nodes':
      return `Connected "${String(a.from ?? '')}" → "${String(a.to ?? '')}"`;
    case 'disconnect_nodes':
      return `Disconnected "${String(a.from ?? '')}" → "${String(a.to ?? '')}"`;
    case 'set_node_parameters':
      return `Configured "${String(a.name ?? '')}"`;
    case 'rename_node':
      return `Renamed "${String(a.oldName ?? '')}" to "${String(a.newName ?? '')}"`;
    case 'remove_node':
      return `Removed "${String(a.name ?? '')}"`;
    case 'set_node_credential':
      return a.credentialId ? `Attached a credential to "${String(a.name ?? '')}"` : `Cleared the credential on "${String(a.name ?? '')}"`;
    case 'list_credentials':
      return 'Checked stored credentials';
    case 'request_credential':
      return `Requested a new ${String(a.type ?? '')} credential`;
    case 'get_workflow_outline':
      return 'Reviewed the current workflow';
    default:
      return name;
  }
}

export interface IFieldDiff {
  key: string;
  before: unknown;
  after: unknown;
}

/** Shallow key-level diff between a changed node's before/after parameters — enough for a field-level before/after view without a full recursive diff. */
export function diffFields(before: IDataObject, after: IDataObject): IFieldDiff[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const fields: IFieldDiff[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      fields.push({ key, before: before[key], after: after[key] });
    }
  }
  return fields;
}
