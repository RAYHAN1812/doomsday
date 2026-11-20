import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase, type Db } from '../src/db.js';
import { migrateSQLiteDatabase } from '../scripts/migrate-sqlite.js';

let source: DatabaseSync;
let embeddedDb: PGlite;
let db: Db;

beforeEach(async () => {
  source = new DatabaseSync(':memory:');
  source.exec(`
    CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT, release_year INTEGER, runtime_minutes INTEGER, watched INTEGER);
    CREATE TABLE movie_prerequisites (movie_id INTEGER, prerequisite_id INTEGER);
    CREATE TABLE cinemas (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE cinema_bundle_sizes (cinema_id INTEGER, size INTEGER);
    INSERT INTO movies VALUES (4, 'Earlier Movie', 2001, 123, 1);
    INSERT INTO movies VALUES (9, 'Later Movie', 2025, 99, 0);
    INSERT INTO movie_prerequisites VALUES (9, 4);
    INSERT INTO cinemas VALUES (13, 'Example Cinema');
    INSERT INTO cinema_bundle_sizes VALUES (13, 2);
    INSERT INTO cinema_bundle_sizes VALUES (13, 5);
  `);
  embeddedDb = new PGlite();
  db = new Pool(createPgConfig(embeddedDb));
  await initializeDatabase(db);
});

afterEach(async () => {
  source.close();
  await db.end();
  await embeddedDb.close();
});

describe('SQLite data migration', () => {
  it('preserves IDs, relationships, watched flags, bundle sizes, and identity sequences', async () => {
    await expect(migrateSQLiteDatabase(source, db)).resolves.toEqual({ movies: 2, cinemas: 1 });

    const { rows: movies } = await db.query(
      'SELECT id, title, watched FROM movies ORDER BY id',
    );
    expect(movies).toEqual([
      { id: 4, title: 'Earlier Movie', watched: true },
      { id: 9, title: 'Later Movie', watched: false },
    ]);

    const { rows: prerequisites } = await db.query(
      'SELECT movie_id, prerequisite_id FROM movie_prerequisites',
    );
    expect(prerequisites).toEqual([{ movie_id: 9, prerequisite_id: 4 }]);

    const { rows: bundles } = await db.query(
      'SELECT cinema_id, size FROM cinema_bundle_sizes ORDER BY size',
    );
    expect(bundles).toEqual([
      { cinema_id: 13, size: 2 },
      { cinema_id: 13, size: 5 },
    ]);

    const { rows: nextMovie } = await db.query(
      'INSERT INTO movies (title, release_year, runtime_minutes) VALUES ($1, $2, $3) RETURNING id',
      ['Next Movie', 2026, 100],
    );
    expect(nextMovie[0].id).toBe(10);
  });

  it('refuses to import into a non-empty PostgreSQL database', async () => {
    await migrateSQLiteDatabase(source, db);
    await expect(migrateSQLiteDatabase(source, db)).rejects.toThrow('Target PostgreSQL database is not empty');
  });
});
