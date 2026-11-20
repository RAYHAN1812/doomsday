import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { openDatabase, transaction, type Db } from '../src/db.js';

export async function migrateSQLiteDatabase(source: DatabaseSync, db: Db): Promise<{ movies: number; cinemas: number }> {
  const movies = source
    .prepare('SELECT id, title, release_year, runtime_minutes, watched FROM movies ORDER BY id')
    .all()
    .map((row) => ({
      id: readNumber(row.id, 'movies.id'),
      title: readString(row.title, 'movies.title'),
      release_year: readNumber(row.release_year, 'movies.release_year'),
      runtime_minutes: readNumber(row.runtime_minutes, 'movies.runtime_minutes'),
      watched: readNumber(row.watched, 'movies.watched') !== 0,
    }));
  const prerequisites = source
    .prepare('SELECT movie_id, prerequisite_id FROM movie_prerequisites ORDER BY movie_id, prerequisite_id')
    .all()
    .map((row) => ({
      movie_id: readNumber(row.movie_id, 'movie_prerequisites.movie_id'),
      prerequisite_id: readNumber(row.prerequisite_id, 'movie_prerequisites.prerequisite_id'),
    }));
  const cinemas = source
    .prepare('SELECT id, name FROM cinemas ORDER BY id')
    .all()
    .map((row) => ({
      id: readNumber(row.id, 'cinemas.id'),
      name: readString(row.name, 'cinemas.name'),
    }));
  const bundleSizes = source
    .prepare('SELECT cinema_id, size FROM cinema_bundle_sizes ORDER BY cinema_id, size')
    .all()
    .map((row) => ({
      cinema_id: readNumber(row.cinema_id, 'cinema_bundle_sizes.cinema_id'),
      size: readNumber(row.size, 'cinema_bundle_sizes.size'),
    }));

  await transaction(db, async (client) => {
    const { rows } = await client.query<{ has_data: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM movies)
        OR EXISTS (SELECT 1 FROM movie_prerequisites)
        OR EXISTS (SELECT 1 FROM cinemas)
        OR EXISTS (SELECT 1 FROM cinema_bundle_sizes) AS has_data`,
    );
    if (rows[0]?.has_data) {
      throw new Error('Target PostgreSQL database is not empty; refusing to overwrite existing data');
    }

    for (const movie of movies) {
      await client.query(
        'INSERT INTO movies (id, title, release_year, runtime_minutes, watched) VALUES ($1, $2, $3, $4, $5)',
        [movie.id, movie.title, movie.release_year, movie.runtime_minutes, movie.watched],
      );
    }
    for (const prerequisite of prerequisites) {
      await client.query(
        'INSERT INTO movie_prerequisites (movie_id, prerequisite_id) VALUES ($1, $2)',
        [prerequisite.movie_id, prerequisite.prerequisite_id],
      );
    }
    for (const cinema of cinemas) {
      await client.query('INSERT INTO cinemas (id, name) VALUES ($1, $2)', [cinema.id, cinema.name]);
    }
    for (const bundle of bundleSizes) {
      await client.query(
        'INSERT INTO cinema_bundle_sizes (cinema_id, size) VALUES ($1, $2)',
        [bundle.cinema_id, bundle.size],
      );
    }

    await client.query(
      "SELECT setval(pg_get_serial_sequence('movies', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM movies",
    );
    await client.query(
      "SELECT setval(pg_get_serial_sequence('cinemas', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM cinemas",
    );
  });

  return { movies: movies.length, cinemas: cinemas.length };
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`SQLite field "${field}" is not an integer`);
  }
  return value;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`SQLite field "${field}" is not text`);
  return value;
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2] ?? 'data/doomsday.db';
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let db: Db | undefined;

  try {
    db = await openDatabase(config.databaseUrl);
    const result = await migrateSQLiteDatabase(source, db);
    console.log(`Migrated ${result.movies} movies and ${result.cinemas} cinemas from ${sourcePath}`);
  } finally {
    try {
      source.close();
    } finally {
      if (db) await db.end();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
