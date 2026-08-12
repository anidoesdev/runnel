export interface IAppConfig {
  encryptionKey: string;
  jwtSecret: Uint8Array;
  port: number;
  db: { type: 'sqlite'; database: string } | { type: 'postgres' };
  usingDevDefaults: { encryptionKey: boolean; jwtSecret: boolean };
  /** Directory scanned for third-party nodes at startup (see @n8n-clone/node-dev and custom-nodes/load-custom-nodes.ts) — unset means "load none". */
  customNodesDir: string | undefined;
}

const DEV_ENCRYPTION_KEY = 'dev-only-insecure-encryption-key-change-me';
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please-32bytes';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IAppConfig {
  const encryptionKey = env.N8N_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY;
  const jwtSecretString = env.N8N_JWT_SECRET ?? DEV_JWT_SECRET;

  return {
    encryptionKey,
    jwtSecret: new TextEncoder().encode(jwtSecretString),
    // Not 5678 (n8n's usual default) — that port is commonly already taken by a real n8n
    // instance (e.g. a Docker container) on a dev machine that also has this project checked
    // out, and the two silently fight over it instead of one cleanly failing to bind.
    port: Number(env.PORT ?? 5679),
    db:
      (env.DB_TYPE as 'sqlite' | 'postgres' | undefined) === 'postgres'
        ? { type: 'postgres' }
        : { type: 'sqlite', database: env.DB_SQLITE_DATABASE ?? 'n8n-clone.sqlite' },
    usingDevDefaults: {
      encryptionKey: !env.N8N_ENCRYPTION_KEY,
      jwtSecret: !env.N8N_JWT_SECRET,
    },
    customNodesDir: env.CUSTOM_NODES_DIR,
  };
}
