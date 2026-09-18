import { describe, expect, it } from 'vitest';
import { explainDatabaseStartupError } from './startup-error.js';
import type { IDatabaseConfig } from './data-source.js';

const postgres = (database: string): IDatabaseConfig => ({
  type: 'postgres',
  host: 'postgres',
  port: 5432,
  username: 'postgres',
  password: 'secret-password',
  database,
});

describe('explainDatabaseStartupError', () => {
  it('names the variable to fix when the database does not exist', () => {
    const explained = explainDatabaseStartupError({ code: '3D000' }, postgres('runnel'))!;
    expect(explained.message).toContain('has no database named "runnel"');
    expect(explained.message).toContain('DB_POSTGRES_DATABASE');
    expect(explained.message).toContain('psql -U postgres -l');
  });

  it('calls out a SQLite file name given as a Postgres database', () => {
    const explained = explainDatabaseStartupError({ code: '3D000' }, postgres('runnel.sqlite'))!;
    expect(explained.message).toContain('"runnel.sqlite" is a SQLite file name');
  });

  it('points at credentials and at host/port for the other common failures', () => {
    expect(explainDatabaseStartupError({ code: '28P01' }, postgres('runnel'))!.message).toContain('DB_POSTGRES_PASSWORD');
    expect(explainDatabaseStartupError({ code: 'ECONNREFUSED' }, postgres('runnel'))!.message).toContain('postgres:5432');
  });

  it('never repeats the password', () => {
    for (const code of ['3D000', '28P01', 'ECONNREFUSED']) {
      expect(explainDatabaseStartupError({ code }, postgres('runnel'))!.message).not.toContain('secret-password');
    }
  });

  it('leaves anything else, and SQLite, to the original error', () => {
    expect(explainDatabaseStartupError({ code: 'XX000' }, postgres('runnel'))).toBeUndefined();
    expect(explainDatabaseStartupError(new Error('boom'), { type: 'sqlite', database: 'runnel.sqlite' })).toBeUndefined();
  });
});
