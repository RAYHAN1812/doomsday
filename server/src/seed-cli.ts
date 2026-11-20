import { config } from './config.js';
import { openDatabase } from './db.js';
import { seedSampleData } from './seed.js';

const db = await openDatabase(config.databaseUrl);
try {
  const added = await seedSampleData(db);
  console.log(`Added ${added.movies} movies and ${added.cinemas} cinemas`);
} finally {
  await db.end();
}
