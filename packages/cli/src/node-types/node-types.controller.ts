import { Get, RestController } from '../http/decorators.js';
import type { INodeTypeDescription } from '@runnel/workflow';

/** Lets the editor build its node palette and parameter forms from the same descriptions the backend registered — no separately-maintained metadata. */
@RestController('/rest/node-types')
export class NodeTypesController {
  constructor(private readonly descriptions: INodeTypeDescription[]) {}

  @Get('/')
  list(): INodeTypeDescription[] {
    return this.descriptions;
  }
}
