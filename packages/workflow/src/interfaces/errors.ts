import type { INode } from './node.interfaces.js';

export class NodeOperationError extends Error {
  public description?: string;

  constructor(
    public node: INode,
    message: string,
    options: { description?: string } = {},
  ) {
    super(message);
    this.name = 'NodeOperationError';
    this.description = options.description;
  }
}

export class NodeApiError extends Error {
  public httpCode?: string;
  public description?: string;

  constructor(
    public node: INode,
    message: string,
    options: { httpCode?: string; description?: string } = {},
  ) {
    super(message);
    this.name = 'NodeApiError';
    this.httpCode = options.httpCode;
    this.description = options.description;
  }
}

export class WorkflowOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowOperationError';
  }
}

export interface IExpressionErrorContext {
  nodeName: string;
  parameterPath?: string;
  itemIndex?: number;
}

export class ExpressionError extends Error {
  constructor(
    message: string,
    public context: IExpressionErrorContext,
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export class SubworkflowOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubworkflowOperationError';
  }
}
