import type { ICredentialType } from '@n8n-clone/workflow';

export interface ICredentialTypes {
  getByName(name: string): ICredentialType;
}

export class MapCredentialTypes implements ICredentialTypes {
  private readonly types = new Map<string, ICredentialType>();

  register(type: ICredentialType): this {
    this.types.set(type.name, type);
    return this;
  }

  getByName(name: string): ICredentialType {
    const type = this.types.get(name);
    if (!type) {
      throw new Error(`Unknown credential type "${name}"`);
    }
    return type;
  }
}
