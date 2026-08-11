export interface IAppConfig {
  encryptionKey: string;
  jwtSecret: Uint8Array;
  port: number;
  db: { type: 'sqlite'; database: string } | { type: 'postgres' };
  usingDevDefaults: { encryptionKey: boolean; jwtSecret: boolean };
}

const DEV_ENCRYPTION_KEY = 'dev-only-insecure-encryption-key-change-me';
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please-32bytes';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IAppConfig {
  const encryptionKey = env.N8N_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY;
  const jwtSecretString = env.N8N_JWT_SECRET ?? DEV_JWT_SECRET;

  return {
    encryptionKey,
    jwtSecret: new TextEncoder().encode(jwtSecretString),
    port: Number(env.PORT ?? 5678),
    db:
      (env.DB_TYPE as 'sqlite' | 'postgres' | undefined) === 'postgres'
        ? { type: 'postgres' }
        : { type: 'sqlite', database: env.DB_SQLITE_DATABASE ?? 'n8n-clone.sqlite' },
    usingDevDefaults: {
      encryptionKey: !env.N8N_ENCRYPTION_KEY,
      jwtSecret: !env.N8N_JWT_SECRET,
    },
  };
}
