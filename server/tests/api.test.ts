import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { initializeDatabase, transaction, type Db } from '../src/db.js';
import { seedSampleData } from '../src/seed.js';

let app: ReturnType<typeof createApp>;
let db: Db;
let embeddedDb: PGlite;
let movieId: (title: string) => number;
let cinemaId: (name: string) => number;

beforeAll(async () => {
  embeddedDb = new PGlite();
  db = new Pool(createPgConfig(embeddedDb));
  await initializeDatabase(db);
});

beforeEach(async () => {
  await db.query('TRUNCATE movies, cinemas RESTART IDENTITY CASCADE');
  await seedSampleData(db);
  app = createApp(db);

  const movies: { id: number; title: string }[] = (await request(app).get('/api/movies')).body;
  movieId = (title) => movies.find((m) => m.title === title)!.id;
  const cinemas: { id: number; name: string }[] = (await request(app).get('/api/cinemas')).body;
  cinemaId = (name) => cinemas.find((c) => c.name === name)!.id;
});

afterAll(async () => {
  await db.end();
  await embeddedDb.close();
});

const titles = (body: { movies: { title: string }[] }) => body.movies.map((m) => m.title);

describe('movies', () => {
  it('lists the seeded movies with their prerequisites', async () => {
    const res = await request(app).get('/api/movies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    const avengers = res.body.find((m: { title: string }) => m.title === 'The Avengers');
    expect(avengers.prerequisiteIds.sort()).toEqual(
      [movieId('Iron Man'), movieId('Captain America: The First Avenger')].sort(),
    );
    expect(avengers.watched).toBe(false);
  });

  it('creates a movie with defaults', async () => {
    const res = await request(app)
      .post('/api/movies')
      .send({ title: '  Black Panther ', releaseYear: 2018, runtimeMinutes: 134 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Black Panther', watched: false, prerequisiteIds: [] });
  });

  it('rejects a duplicate title regardless of case', async () => {
    const res = await request(app)
      .post('/api/movies')
      .send({ title: 'iron man', releaseYear: 2008, runtimeMinutes: 126 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TITLE_TAKEN');
  });

  it.each([0, 301, 12.5])('rejects runtime %s', async (runtimeMinutes) => {
    const res = await request(app).post('/api/movies').send({ title: 'X', releaseYear: 2020, runtimeMinutes });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects prerequisites that do not exist', async () => {
    const res = await request(app)
      .post('/api/movies')
      .send({ title: 'X', releaseYear: 2020, runtimeMinutes: 100, prerequisiteIds: [999] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'UNKNOWN_PREREQUISITE', details: { missingIds: [999] } });
  });

  it('updates watched and prerequisites', async () => {
    const id = movieId('Thor: Ragnarok');
    const res = await request(app)
      .patch(`/api/movies/${id}`)
      .send({ watched: true, prerequisiteIds: [movieId('The Avengers')] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ watched: true, prerequisiteIds: [movieId('The Avengers')] });
  });

  it('returns 409 CIRCULAR_DEPENDENCY when Endgame becomes a prerequisite of Iron Man', async () => {
    const res = await request(app)
      .patch(`/api/movies/${movieId('Iron Man')}`)
      .send({ prerequisiteIds: [movieId('Avengers: Endgame')] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CIRCULAR_DEPENDENCY');

    const ironMan = await request(app).get(`/api/movies/${movieId('Iron Man')}`);
    expect(ironMan.body.prerequisiteIds).toEqual([]);
  });

  it('returns 409 CIRCULAR_DEPENDENCY when a movie depends on itself', async () => {
    const id = movieId('Thor: Ragnarok');
    const res = await request(app).patch(`/api/movies/${id}`).send({ prerequisiteIds: [id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CIRCULAR_DEPENDENCY');
  });

  it('returns 404 for an unknown movie and 400 for a bad id', async () => {
    expect((await request(app).patch('/api/movies/999').send({ watched: true })).status).toBe(404);
    expect((await request(app).get('/api/movies/abc/rewatch-order')).status).toBe(400);
  });

  it('removes a deleted movie from other movies’ prerequisites', async () => {
    await request(app).delete(`/api/movies/${movieId('Iron Man')}`).expect(204);
    const avengers = await request(app).get(`/api/movies/${movieId('The Avengers')}`);
    expect(avengers.body.prerequisiteIds).toEqual([movieId('Captain America: The First Avenger')]);
  });
});

describe('rewatch order', () => {
  it('returns all 7 other movies for Avengers: Doomsday, with progress and remaining time', async () => {
    await request(app).patch(`/api/movies/${movieId('Iron Man')}`).send({ watched: true });

    const res = await request(app).get(`/api/movies/${movieId('Avengers: Doomsday')}/rewatch-order`);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual([
      'Iron Man',
      'Captain America: The First Avenger',
      'The Avengers',
      'Captain America: Civil War',
      'Thor: Ragnarok',
      'Avengers: Infinity War',
      'Avengers: Endgame',
    ]);
    expect(res.body).toMatchObject({
      totalCount: 7,
      watchedCount: 1,
      unwatchedCount: 6,
      unwatchedRuntimeMinutes: 124 + 143 + 147 + 130 + 149 + 181,
    });
  });

  it('returns the First Avenger and Iron Man, then The Avengers, for Civil War', async () => {
    const res = await request(app).get(`/api/movies/${movieId('Captain America: Civil War')}/rewatch-order`);
    expect(titles(res.body).slice(0, 2).sort()).toEqual(['Captain America: The First Avenger', 'Iron Man']);
    expect(titles(res.body)[2]).toBe('The Avengers');
    expect(res.body.totalCount).toBe(3);
  });

  it('returns an empty list for Thor: Ragnarok', async () => {
    const res = await request(app).get(`/api/movies/${movieId('Thor: Ragnarok')}/rewatch-order`);
    expect(res.body).toMatchObject({ movies: [], totalCount: 0, watchedCount: 0, unwatchedRuntimeMinutes: 0 });
  });
});

describe('cinemas and booking', () => {
  it('lists cinemas and gets one cinema with its bundle sizes', async () => {
    const list = await request(app).get('/api/cinemas');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(4);

    const id = cinemaId('Asgard Odeon');
    const res = await request(app).get(`/api/cinemas/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, name: 'Asgard Odeon', bundleSizes: [4, 6] });
  });

  it.each([
    { name: 'Stark Tower Screens', group: 6, total: 2, bundles: [{ size: 3, count: 2 }] },
    { name: 'Wakanda Picture House', group: 11, total: 4, bundles: [{ size: 5, count: 1 }, { size: 2, count: 3 }] },
    {
      name: 'Sanctum Sanctorum IMAX',
      group: 44,
      total: 4,
      bundles: [{ size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 }],
    },
  ])('quotes $name for a group of $group', async ({ name, group, total, bundles }) => {
    const res = await request(app).get(`/api/cinemas/${cinemaId(name)}/booking?groupSize=${group}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ groupSize: group, possible: true, totalBundles: total, bundles });
  });

  it('says not possible for bundles 4, 6 and a group of 7', async () => {
    const res = await request(app).get(`/api/cinemas/${cinemaId('Asgard Odeon')}/booking?groupSize=7`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ possible: false, totalBundles: null, bundles: [] });
  });

  it.each(['0', '10001', '2.5', 'abc', ''])('rejects groupSize "%s"', async (groupSize) => {
    const res = await request(app).get(`/api/cinemas/${cinemaId('Asgard Odeon')}/booking?groupSize=${groupSize}`);
    expect(res.status).toBe(400);
  });

  it('creates a cinema, merging repeated bundle sizes', async () => {
    const res = await request(app).post('/api/cinemas').send({ name: 'Xandar Plex', bundleSizes: [5, 2, 5] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Xandar Plex', bundleSizes: [2, 5] });
  });

  it.each([
    { bundleSizes: [] },
    { bundleSizes: [0] },
    { bundleSizes: [501] },
    { bundleSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  ])('rejects bundle sizes $bundleSizes', async ({ bundleSizes }) => {
    const res = await request(app).post('/api/cinemas').send({ name: 'Bad', bundleSizes });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate cinema name', async () => {
    const res = await request(app).post('/api/cinemas').send({ name: 'asgard odeon', bundleSizes: [2] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NAME_TAKEN');
  });

  it('returns 404 when booking at an unknown cinema', async () => {
    expect((await request(app).get('/api/cinemas/999/booking?groupSize=4')).status).toBe(404);
  });

  it('deletes a cinema', async () => {
    const id = cinemaId('Asgard Odeon');
    await request(app).delete(`/api/cinemas/${id}`).expect(204);
    await request(app).get(`/api/cinemas/${id}`).expect(404);
  });
});

describe('database integrity', () => {
  it('rolls back related writes when a transaction fails', async () => {
    await expect(
      transaction(db, async (client) => {
        const result = await client.query<{ id: number }>(
          'INSERT INTO cinemas (name) VALUES ($1) RETURNING id',
          ['Rollback Test'],
        );
        await client.query('INSERT INTO cinema_bundle_sizes (cinema_id, size) VALUES ($1, $2)', [
          result.rows[0].id,
          7,
        ]);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const { rows } = await db.query('SELECT id FROM cinemas WHERE name = $1', ['Rollback Test']);
    expect(rows).toEqual([]);
  });

  it('enforces case-insensitive uniqueness and foreign-key cascades', async () => {
    const { rows: uniqueIndexes } = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname IN ('movies_title_lower_unique', 'cinemas_name_lower_unique')",
    );
    expect(uniqueIndexes.map((index) => index.indexname).sort()).toEqual([
      'cinemas_name_lower_unique',
      'movies_title_lower_unique',
    ]);

    const deletedMovieId = movieId('Iron Man');
    await db.query('DELETE FROM movies WHERE id = $1', [deletedMovieId]);
    const { rows: remainingPrerequisites } = await db.query(
      'SELECT movie_id FROM movie_prerequisites WHERE prerequisite_id = $1',
      [deletedMovieId],
    );
    expect(remainingPrerequisites).toEqual([]);

    const deletedCinemaId = cinemaId('Asgard Odeon');
    await db.query('DELETE FROM cinemas WHERE id = $1', [deletedCinemaId]);
    const { rows: remainingBundles } = await db.query(
      'SELECT size FROM cinema_bundle_sizes WHERE cinema_id = $1',
      [deletedCinemaId],
    );
    expect(remainingBundles).toEqual([]);
  });
});

it('returns a JSON 400 for a malformed body', async () => {
  const res = await request(app).post('/api/movies').set('Content-Type', 'application/json').send('{oops');
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('INVALID_JSON');
});

it('returns a successful API health check', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});
