import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/User.entity.js';
import { WorkflowEntity } from './entities/Workflow.entity.js';
import { CredentialEntity } from './entities/Credential.entity.js';
import { ExecutionEntity } from './entities/Execution.entity.js';
import { sqliteMigrations } from './migrations/sqlite/index.js';
import { postgresMigrations } from './migrations/postgres/index.js';

const entities = [UserEntity, WorkflowEntity, CredentialEntity, ExecutionEntity];

export type IDatabaseConfig =
  | { type: 'sqlite'; database: string }
  | {
      type: 'postgres';
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
    };

/** `synchronize` is never used — schema changes only ever happen through a reviewed migration, on both dialects, per the project's own working agreement. */
export function createDataSource(config: IDatabaseConfig): DataSource {
  if (config.type === 'sqlite') {
    return new DataSource({
      type: 'better-sqlite3',
      database: config.database,
      entities,
      migrations: sqliteMigrations,
      synchronize: false,
    });
  }

  return new DataSource({
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    entities,
    migrations: postgresMigrations,
    synchronize: false,
  });
}

export function sqliteConfig(database = 'n8n-clone.sqlite'): IDatabaseConfig {
  return { type: 'sqlite', database };
}

export function postgresConfigFromEnv(): IDatabaseConfig {
  return {
    type: 'postgres',
    host: process.env.DB_POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_POSTGRES_PORT ?? 5432),
    username: process.env.DB_POSTGRES_USER ?? 'postgres',
    password: process.env.DB_POSTGRES_PASSWORD ?? 'postgres',
    database: process.env.DB_POSTGRES_DATABASE ?? 'n8n_clone',
  };
}
