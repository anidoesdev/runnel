export type IDataObject = {
  [key: string]: string | number | boolean | null | undefined | IDataObject | IDataObject[];
};

export interface IPairedItemData {
  item: number;
  input?: number;
  sourceOverwrite?: {
    previousNode: string;
    previousNodeOutput?: number;
    previousNodeRun?: number;
  };
}

export interface IBinaryData {
  id: string;
  mimeType: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: string;
  directory?: string;
  /** Inline base64 payload — reserved for small generated files only. Everything else is referenced by id. */
  data?: string;
}

/**
 * Structural shape shared by NodeApiError and NodeOperationError (defined in errors.ts).
 * Declared here — rather than importing those classes — so this file has no dependency
 * on errors.ts, which itself depends on node.interfaces.ts, which depends back on this file.
 */
export interface INodeExecutionErrorLike {
  name: string;
  message: string;
  description?: string;
}

export interface INodeExecutionData {
  json: IDataObject;
  binary?: Record<string, IBinaryData>;
  pairedItem?: IPairedItemData | IPairedItemData[];
  error?: INodeExecutionErrorLike;
  index?: number;
}

/** Node output: outer array = output branch index, inner array = items on that branch. */
export type NodeOutput = INodeExecutionData[][];
