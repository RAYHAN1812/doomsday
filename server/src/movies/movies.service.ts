import { transaction, type Db } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { rewatchOrder, wouldCreateCycle, type PrerequisiteGraph, type SortKey } from '../logic/graph.js';
import type { MovieCreateInput, MovieUpdateInput } from './movies.schema.js';

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

interface MovieRow {
  id: number;
  title: string;
  release_year: number;
  runtime_minutes: number;
  watched: number;
}

const circular = () =>
  new ApiError(409, 'CIRCULAR_DEPENDENCY', 'A movie cannot depend on itself, directly or through other movies');

export class MovieService {
  constructor(private readonly db: Db) {}

  list(): Movie[] {
    const rows = this.db
      .prepare('SELECT * FROM movies ORDER BY release_year, title')
      .all() as unknown as MovieRow[];
    const graph = this.loadGraph();
    return rows.map((row) => toMovie(row, graph));
  }

  get(id: number): Movie {
    const row = this.db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as MovieRow | undefined;
    if (!row) throw notFound('Movie', id);
    return toMovie(row, this.loadGraph());
  }

  create(input: MovieCreateInput): Movie {
    const prerequisiteIds = unique(input.prerequisiteIds);

    const id = transaction(this.db, () => {
      this.assertTitleFree(input.title);
      this.assertMoviesExist(prerequisiteIds);
      const result = this.db
        .prepare('INSERT INTO movies (title, release_year, runtime_minutes, watched) VALUES (?, ?, ?, ?)')
        .run(input.title, input.releaseYear, input.runtimeMinutes, input.watched ? 1 : 0);
      const newId = Number(result.lastInsertRowid);
      this.replacePrerequisites(newId, prerequisiteIds);
      return newId;
    });

    return this.get(id);
  }

  update(id: number, input: MovieUpdateInput): Movie {
    transaction(this.db, () => {
      this.get(id);

      if (input.title !== undefined) this.assertTitleFree(input.title, id);

      if (input.prerequisiteIds !== undefined) {
        const prerequisiteIds = unique(input.prerequisiteIds);
        if (prerequisiteIds.includes(id)) throw circular();
        this.assertMoviesExist(prerequisiteIds);
        if (wouldCreateCycle(this.loadGraph(), id, prerequisiteIds)) throw circular();
        this.replacePrerequisites(id, prerequisiteIds);
      }

      const sets: string[] = [];
      const values: (string | number)[] = [];
      if (input.title !== undefined) (sets.push('title = ?'), values.push(input.title));
      if (input.releaseYear !== undefined) (sets.push('release_year = ?'), values.push(input.releaseYear));
      if (input.runtimeMinutes !== undefined) (sets.push('runtime_minutes = ?'), values.push(input.runtimeMinutes));
      if (input.watched !== undefined) (sets.push('watched = ?'), values.push(input.watched ? 1 : 0));
      if (sets.length > 0) {
        this.db.prepare(`UPDATE movies SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
      }
    });

    return this.get(id);
  }

  delete(id: number): void {
    const result = this.db.prepare('DELETE FROM movies WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Movie', id);
  }

  rewatchPlan(targetId: number): RewatchPlan {
    const target = this.get(targetId);
    const all = this.list();
    const byId = new Map(all.map((m) => [m.id, m]));
    const graph = this.loadGraph();
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

  private loadGraph(): PrerequisiteGraph {
    const edges = this.db
      .prepare('SELECT movie_id, prerequisite_id FROM movie_prerequisites ORDER BY movie_id, prerequisite_id')
      .all() as unknown as { movie_id: number; prerequisite_id: number }[];
    const graph = new Map<number, number[]>();
    for (const { movie_id, prerequisite_id } of edges) {
      const list = graph.get(movie_id);
      if (list) list.push(prerequisite_id);
      else graph.set(movie_id, [prerequisite_id]);
    }
    return graph;
  }

  private replacePrerequisites(movieId: number, prerequisiteIds: number[]): void {
    this.db.prepare('DELETE FROM movie_prerequisites WHERE movie_id = ?').run(movieId);
    const insert = this.db.prepare('INSERT INTO movie_prerequisites (movie_id, prerequisite_id) VALUES (?, ?)');
    for (const p of prerequisiteIds) insert.run(movieId, p);
  }

  private assertTitleFree(title: string, exceptId?: number): void {
    const clash = this.db
      .prepare('SELECT id FROM movies WHERE title = ? COLLATE NOCASE AND id IS NOT ?')
      .get(title, exceptId ?? null);
    if (clash) throw new ApiError(409, 'TITLE_TAKEN', `A movie titled "${title}" already exists`);
  }

  private assertMoviesExist(ids: number[]): void {
    if (ids.length === 0) return;
    const found = this.db
      .prepare(`SELECT id FROM movies WHERE id IN (${ids.map(() => '?').join(', ')})`)
      .all(...ids) as unknown as { id: number }[];
    const foundIds = new Set(found.map((r) => r.id));
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
    watched: row.watched === 1,
    prerequisiteIds: [...(graph.get(row.id) ?? [])],
  };
}

const unique = (ids: number[]) => [...new Set(ids)];
