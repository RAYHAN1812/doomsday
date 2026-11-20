import { transaction, isUniqueViolation, type Db } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { quoteBundles, type BookingQuote } from '../logic/booking.js';
import type { CinemaCreateInput } from './cinemas.schema.js';
import type { PoolClient, QueryResultRow } from 'pg';

export interface Cinema {
  id: number;
  name: string;
  bundleSizes: number[];
}

export type Booking = { cinema: { id: number; name: string }; groupSize: number } & BookingQuote;

interface CinemaRow extends QueryResultRow {
  id: number;
  name: string;
}

interface BundleSizeRow extends QueryResultRow {
  cinema_id: number;
  size: number;
}

export class CinemaService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Cinema[]> {
    const [{ rows: cinemas }, { rows: sizes }] = await Promise.all([
      this.db.query<CinemaRow>('SELECT id, name FROM cinemas ORDER BY LOWER(name)'),
      this.db.query<BundleSizeRow>('SELECT cinema_id, size FROM cinema_bundle_sizes ORDER BY size'),
    ]);

    return cinemas.map((cinema) => ({
      id: cinema.id,
      name: cinema.name,
      bundleSizes: sizes.filter((size) => size.cinema_id === cinema.id).map((size) => size.size),
    }));
  }

  async get(id: number): Promise<Cinema> {
    const { rows } = await this.db.query<CinemaRow>('SELECT id, name FROM cinemas WHERE id = $1', [id]);
    const cinema = rows[0];
    if (!cinema) throw notFound('Cinema', id);
    const { rows: sizes } = await this.db.query<{ size: number }>(
      'SELECT size FROM cinema_bundle_sizes WHERE cinema_id = $1 ORDER BY size',
      [id],
    );
    return { id: cinema.id, name: cinema.name, bundleSizes: sizes.map((size) => size.size) };
  }

  async create(input: CinemaCreateInput): Promise<Cinema> {
    let id: number;
    try {
      id = await transaction(this.db, async (client) => {
        await this.assertNameFree(client, input.name);
        const result = await client.query<{ id: number }>(
          'INSERT INTO cinemas (name) VALUES ($1) RETURNING id',
          [input.name],
        );
        const newId = result.rows[0]?.id;
        if (newId === undefined) throw new Error('Cinema insert did not return an id');

        const values: number[] = [];
        const placeholders = input.bundleSizes.map((size) => {
          values.push(newId, size);
          const first = values.length - 1;
          return `($${first}, $${first + 1})`;
        });
        await client.query(
          `INSERT INTO cinema_bundle_sizes (cinema_id, size) VALUES ${placeholders.join(', ')}`,
          values,
        );
        return newId;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, 'NAME_TAKEN', `A cinema named "${input.name}" already exists`);
      throw error;
    }

    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    const result = await this.db.query('DELETE FROM cinemas WHERE id = $1', [id]);
    if (result.rowCount === 0) throw notFound('Cinema', id);
  }

  async booking(id: number, groupSize: number): Promise<Booking> {
    const cinema = await this.get(id);
    return {
      cinema: { id: cinema.id, name: cinema.name },
      groupSize,
      ...quoteBundles(cinema.bundleSizes, groupSize),
    };
  }

  private async assertNameFree(client: PoolClient, name: string): Promise<void> {
    const { rowCount } = await client.query(
      'SELECT id FROM cinemas WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [name],
    );
    if (rowCount !== 0) throw new ApiError(409, 'NAME_TAKEN', `A cinema named "${name}" already exists`);
  }
}
