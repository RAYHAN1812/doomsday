import { CinemaService } from './cinemas/cinemas.service.js';
import type { Db } from './db.js';
import { MovieService } from './movies/movies.service.js';

const SAMPLE_MOVIES: { title: string; releaseYear: number; runtimeMinutes: number; after: string[] }[] = [
  { title: 'Iron Man', releaseYear: 2008, runtimeMinutes: 126, after: [] },
  { title: 'Captain America: The First Avenger', releaseYear: 2011, runtimeMinutes: 124, after: [] },
  { title: 'The Avengers', releaseYear: 2012, runtimeMinutes: 143, after: ['Iron Man', 'Captain America: The First Avenger'] },
  { title: 'Captain America: Civil War', releaseYear: 2016, runtimeMinutes: 147, after: ['The Avengers'] },
  { title: 'Thor: Ragnarok', releaseYear: 2017, runtimeMinutes: 130, after: [] },
  { title: 'Avengers: Infinity War', releaseYear: 2018, runtimeMinutes: 149, after: ['Captain America: Civil War', 'Thor: Ragnarok'] },
  { title: 'Avengers: Endgame', releaseYear: 2019, runtimeMinutes: 181, after: ['Avengers: Infinity War'] },
  { title: 'Avengers: Doomsday', releaseYear: 2026, runtimeMinutes: 150, after: ['Avengers: Endgame'] },
];

const SAMPLE_CINEMAS = [
  { name: 'Stark Tower Screens', bundleSizes: [1, 3, 4] },
  { name: 'Wakanda Picture House', bundleSizes: [2, 5] },
  { name: 'Sanctum Sanctorum IMAX', bundleSizes: [6, 9, 20] },
  { name: 'Asgard Odeon', bundleSizes: [4, 6] },
];

export async function seedSampleData(db: Db): Promise<{ movies: number; cinemas: number }> {
  const movieService = new MovieService(db);
  const cinemaService = new CinemaService(db);
  let movies = 0;
  let cinemas = 0;

  if ((await movieService.list()).length === 0) {
    const idByTitle = new Map<string, number>();
    for (const m of SAMPLE_MOVIES) {
      const created = await movieService.create({
        title: m.title,
        releaseYear: m.releaseYear,
        runtimeMinutes: m.runtimeMinutes,
        watched: false,
        prerequisiteIds: m.after.map((t) => idByTitle.get(t)!),
      });
      idByTitle.set(created.title, created.id);
      movies++;
    }
  }

  if ((await cinemaService.list()).length === 0) {
    for (const c of SAMPLE_CINEMAS) {
      await cinemaService.create(c);
      cinemas++;
    }
  }

  return { movies, cinemas };
}
