import { Pool, type PoolClient } from 'pg';

export type Db = Pool;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS movies (
    id              SERIAL PRIMARY KEY,
    title           TEXT    NOT NULL,
    release_year    INTEGER NOT NULL,
    runtime_minutes INTEGER NOT NULL CHECK (runtime_minutes BETWEEN 1 AND 300),
    watched         BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS movies_title_lower_unique
    ON movies (LOWER(title));

  CREATE TABLE IF NOT EXISTS movie_prerequisites (
    movie_id        INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    prerequisite_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, prerequisite_id),
    CHECK (movie_id <> prerequisite_id)
  );

  CREATE TABLE IF NOT EXISTS cinemas (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS cinemas_name_lower_unique
    ON cinemas (LOWER(name));

  CREATE TABLE IF NOT EXISTS cinema_bundle_sizes (
    cinema_id INTEGER NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
    size      INTEGER NOT NULL CHECK (size BETWEEN 1 AND 500),
    PRIMARY KEY (cinema_id, size)
  );
`;

export async function initializeDatabase(db: Db): Promise<void> {
  await db.query(SCHEMA);
}

export async function openDatabase(connectionString: string): Promise<Db> {
  if (!connectionString) throw new Error('DATABASE_URL must be set');

  const db = new Pool({ connectionString });
  try {
    await initializeDatabase(db);
    return db;
  } catch (error) {
    try {
      await db.end();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Database initialization and pool cleanup failed');
    }
    throw error;
  }
}

export async function transaction<T>(db: Db, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  let releaseError: Error | undefined;

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = new AggregateError([error, rollbackError], 'Transaction and rollback failed');
      throw releaseError;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
