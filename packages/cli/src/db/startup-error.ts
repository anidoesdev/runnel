import type { IDatabaseConfig } from './data-source.js';

/**
 * Turns the database errors people actually hit at startup into a message that says what to
 * change. The raw driver error ("database \"x\" does not exist", a 40-line stack) names the
 * symptom; a deployment usually needs one variable fixed, and this names it.
 *
 * Returns undefined for anything it doesn't recognise, so the original error is rethrown as-is.
 */
export function explainDatabaseStartupError(err: unknown, config: IDatabaseConfig): Error | undefined {
  if (config.type !== 'postgres') return undefined;
  const code = (err as { code?: unknown } | null)?.code;
  const where = `${config.host}:${config.port}`;

  if (code === '3D000') {
    const looksLikeSqlite = /\.sqlite3?$|\.db$/i.test(config.database);
    return new Error(
      `Postgres at ${where} has no database named "${config.database}". ` +
        (looksLikeSqlite
          ? `"${config.database}" is a SQLite file name — with DB_TYPE=postgres, DB_POSTGRES_DATABASE must name a Postgres database. `
          : '') +
        `Set DB_POSTGRES_DATABASE to one that exists (list them with: psql -U ${config.username} -l). ` +
        'Postgres only creates the database named in POSTGRES_DB the first time an empty data volume starts, so an existing volume keeps the name it was first created with.',
    );
  }
  if (code === '28P01') {
    return new Error(`Postgres at ${where} rejected user "${config.username}". Check DB_POSTGRES_USER and DB_POSTGRES_PASSWORD.`);
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return new Error(`Can't reach Postgres at ${where}. Check DB_POSTGRES_HOST and DB_POSTGRES_PORT, and that Postgres is running.`);
  }
  return undefined;
}
