import { Get, RestController } from '../http/decorators.js';
import type { ICredentialType } from '@runnel/workflow';

/** Lets the editor build its credential-creation forms (and the node parameter panel's credential picker) from the same declarations the backend registered. */
@RestController('/rest/credential-types')
export class CredentialTypesController {
  constructor(private readonly types: ICredentialType[]) {}

  @Get('/')
  list(): ICredentialType[] {
    return this.types;
  }
}
