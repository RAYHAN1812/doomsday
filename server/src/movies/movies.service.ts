import { transaction, isUniqueViolation, type Db } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { rewatchOrder, wouldCreateCycle, type PrerequisiteGraph, type SortKey } from '../logic/graph.js';
import type { MovieCreateInput, MovieUpdateInput } from './movies.schema.js';
import type { PoolClient, QueryResultRow } from 'pg';

export interface Movie {
  id: number;
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  watched: boolean;
  prerequisiteIds: number[];
}

export interface RewatchPlan {
  target: { id: number; title: string };
  movies: Movie[];
  totalCount: number;
  watchedCount: number;
  unwatchedCount: number;
  unwatchedRuntimeMinutes: number;
}

interface MovieRow extends QueryResultRow {
  id: number;
  title: string;
  release_year: number;
  runtime_minutes: number;
  watched: boolean;
}

const circular = () =>
  new ApiError(409, 'CIRCULAR_DEPENDENCY', 'A movie cannot depend on itself, directly or through other movies');

export class MovieService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Movie[]> {
    const { rows } = await this.db.query<MovieRow>('SELECT * FROM movies ORDER BY release_year, LOWER(title)');
    const graph = await this.loadGraph(this.db);
    return rows.map((row) => toMovie(row, graph));
  }

  async get(id: number): Promise<Movie> {
    const { rows } = await this.db.query<MovieRow>('SELECT * FROM movies WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) throw notFound('Movie', id);
    return toMovie(row, await this.loadGraph(this.db));
  }

  async create(input: MovieCreateInput): Promise<Movie> {
    const prerequisiteIds = unique(input.prerequisiteIds);
    let id: number;

    try {
      id = await transaction(this.db, async (client) => {
        await this.assertTitleFree(client, input.title);
        await this.assertMoviesExist(client, prerequisiteIds);
        const result = await client.query<{ id: number }>(
          'INSERT INTO movies (title, release_year, runtime_minutes, watched) VALUES ($1, $2, $3, $4) RETURNING id',
          [input.title, input.releaseYear, input.runtimeMinutes, input.watched],
        );
        const newId = result.rows[0]?.id;
        if (newId === undefined) throw new Error('Movie insert did not return an id');
        await this.replacePrerequisites(client, newId, prerequisiteIds);
        return newId;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, 'TITLE_TAKEN', `A movie titled "${input.title}" already exists`);
      throw error;
    }

    return this.get(id);
  }

  async update(id: number, input: MovieUpdateInput): Promise<Movie> {
    try {
      await transaction(this.db, async (client) => {
        const existing = await client.query('SELECT id FROM movies WHERE id = $1', [id]);
        if (existing.rowCount === 0) throw notFound('Movie', id);

        if (input.title !== undefined) await this.assertTitleFree(client, input.title, id);

        if (input.prerequisiteIds !== undefined) {
          const prerequisiteIds = unique(input.prerequisiteIds);
          if (prerequisiteIds.includes(id)) throw circular();
          await this.assertMoviesExist(client, prerequisiteIds);
          if (wouldCreateCycle(await this.loadGraph(client), id, prerequisiteIds)) throw circular();
          await this.replacePrerequisites(client, id, prerequisiteIds);
        }

        const sets: string[] = [];
        const values: unknown[] = [];
        if (input.title !== undefined) {
          values.push(input.title);
          sets.push(`title = $${values.length}`);
        }
        if (input.releaseYear !== undefined) {
          values.push(input.releaseYear);
          sets.push(`release_year = $${values.length}`);
        }
        if (input.runtimeMinutes !== undefined) {
          values.push(input.runtimeMinutes);
          sets.push(`runtime_minutes = $${values.length}`);
        }
        if (input.watched !== undefined) {
          values.push(input.watched);
          sets.push(`watched = $${values.length}`);
        }
        if (sets.length > 0) {
          values.push(id);
          await client.query(`UPDATE movies SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, 'TITLE_TAKEN', `A movie titled "${input.title}" already exists`);
      throw error;
    }

    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    const result = await this.db.query('DELETE FROM movies WHERE id = $1', [id]);
    if (result.rowCount === 0) throw notFound('Movie', id);
  }

  async rewatchPlan(targetId: number): Promise<RewatchPlan> {
    const target = await this.get(targetId);
    const all = await this.list();
    const byId = new Map(all.map((m) => [m.id, m]));
    const graph = await this.loadGraph(this.db);
    const sortKeys = new Map<number, SortKey>(all.map((m) => [m.id, { releaseYear: m.releaseYear, title: m.title }]));

    const movies = rewatchOrder(graph, targetId, sortKeys).map((id) => byId.get(id)!);
    const unwatched = movies.filter((m) => !m.watched);

    return {
      target: { id: target.id, title: target.title },
      movies,
      totalCount: movies.length,
      watchedCount: movies.length - unwatched.length,
      unwatchedCount: unwatched.length,
      unwatchedRuntimeMinutes: unwatched.reduce((sum, m) => sum + m.runtimeMinutes, 0),
    };
  }

  private async loadGraph(queryable: Db | PoolClient): Promise<PrerequisiteGraph> {
    const { rows } = await queryable.query<{ movie_id: number; prerequisite_id: number }>(
      'SELECT movie_id, prerequisite_id FROM movie_prerequisites ORDER BY movie_id, prerequisite_id',
    );
    const graph = new Map<number, number[]>();
    for (const { movie_id, prerequisite_id } of rows) {
      const list = graph.get(movie_id);
      if (list) list.push(prerequisite_id);
      else graph.set(movie_id, [prerequisite_id]);
    }
    return graph;
  }

  private async replacePrerequisites(client: PoolClient, movieId: number, prerequisiteIds: number[]): Promise<void> {
    await client.query('DELETE FROM movie_prerequisites WHERE movie_id = $1', [movieId]);
    if (prerequisiteIds.length === 0) return;

    const values: number[] = [];
    const placeholders = prerequisiteIds.map((prerequisiteId) => {
      values.push(movieId, prerequisiteId);
      const first = values.length - 1;
      return `($${first}, $${first + 1})`;
    });
    await client.query(
      `INSERT INTO movie_prerequisites (movie_id, prerequisite_id) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  private async assertTitleFree(client: PoolClient, title: string, exceptId?: number): Promise<void> {
    const { rowCount } = await client.query(
      'SELECT id FROM movies WHERE LOWER(title) = LOWER($1) AND ($2::INTEGER IS NULL OR id <> $2) LIMIT 1',
      [title, exceptId ?? null],
    );
    if (rowCount !== 0) throw new ApiError(409, 'TITLE_TAKEN', `A movie titled "${title}" already exists`);
  }

  private async assertMoviesExist(client: PoolClient, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const { rows } = await client.query<{ id: number }>(
      `SELECT id FROM movies WHERE id IN (${placeholders})`,
      ids,
    );
    const foundIds = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new ApiError(400, 'UNKNOWN_PREREQUISITE', 'Some prerequisites do not exist', { missingIds: missing });
    }
  }
}

function toMovie(row: MovieRow, graph: PrerequisiteGraph): Movie {
  return {
    id: row.id,
    title: row.title,
    releaseYear: row.release_year,
    runtimeMinutes: row.runtime_minutes,
    watched: row.watched,
    prerequisiteIds: [...(graph.get(row.id) ?? [])],
  };
}

const unique = (ids: number[]) => [...new Set(ids)];
