export interface ICredentialSummary {
  id: string;
  name: string;
  type: string;
}

/**
 * The only seam between this package and however credentials are actually stored — mirrors
 * IWorkflowRepositoryPort. Never exposes credential values (see list_credentials' own doc
 * comment); `createPlaceholder` backs request_credential, which creates an unconfigured
 * credential row and hands back a link for the *user* to fill in real values — the agent must
 * never invent or guess a credential value itself.
 */
export interface ICredentialRepositoryPort {
  list(type?: string): Promise<ICredentialSummary[]>;
  createPlaceholder(type: string, name: string): Promise<ICredentialSummary>;
}
