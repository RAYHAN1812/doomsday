import { transaction, type Db } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { quoteBundles, type BookingQuote } from '../logic/booking.js';
import type { CinemaCreateInput } from './cinemas.schema.js';

export interface Cinema {
  id: number;
  name: string;
  bundleSizes: number[];
}

export type Booking = { cinema: { id: number; name: string }; groupSize: number } & BookingQuote;

export class CinemaService {
  constructor(private readonly db: Db) {}

  list(): Cinema[] {
    const cinemas = this.db.prepare('SELECT id, name FROM cinemas ORDER BY name').all() as unknown as {
      id: number;
      name: string;
    }[];
    const sizes = this.db
      .prepare('SELECT cinema_id, size FROM cinema_bundle_sizes ORDER BY size')
      .all() as unknown as { cinema_id: number; size: number }[];

    return cinemas.map((c) => ({
      id: c.id,
      name: c.name,
      bundleSizes: sizes.filter((s) => s.cinema_id === c.id).map((s) => s.size),
    }));
  }

  get(id: number): Cinema {
    const cinema = this.db.prepare('SELECT id, name FROM cinemas WHERE id = ?').get(id) as
      | { id: number; name: string }
      | undefined;
    if (!cinema) throw notFound('Cinema', id);
    const sizes = this.db
      .prepare('SELECT size FROM cinema_bundle_sizes WHERE cinema_id = ? ORDER BY size')
      .all(id) as unknown as { size: number }[];
    return { id: cinema.id, name: cinema.name, bundleSizes: sizes.map((s) => s.size) };
  }

  create(input: CinemaCreateInput): Cinema {
    const id = transaction(this.db, () => {
      const clash = this.db.prepare('SELECT id FROM cinemas WHERE name = ? COLLATE NOCASE').get(input.name);
      if (clash) throw new ApiError(409, 'NAME_TAKEN', `A cinema named "${input.name}" already exists`);

      const result = this.db.prepare('INSERT INTO cinemas (name) VALUES (?)').run(input.name);
      const newId = Number(result.lastInsertRowid);
      const insert = this.db.prepare('INSERT INTO cinema_bundle_sizes (cinema_id, size) VALUES (?, ?)');
      for (const size of input.bundleSizes) insert.run(newId, size);
      return newId;
    });
    return this.get(id);
  }

  delete(id: number): void {
    const result = this.db.prepare('DELETE FROM cinemas WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Cinema', id);
  }

  booking(id: number, groupSize: number): Booking {
    const cinema = this.get(id);
    return {
      cinema: { id: cinema.id, name: cinema.name },
      groupSize,
      ...quoteBundles(cinema.bundleSizes, groupSize),
    };
  }
}
