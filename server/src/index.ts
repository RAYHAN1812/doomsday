import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { seedSampleData } from './seed.js';

const db = await openDatabase(config.databaseUrl);

try {
  if (config.seedSampleData) {
    const added = await seedSampleData(db);
    if (added.movies || added.cinemas) {
      console.log(`Seeded ${added.movies} sample movies and ${added.cinemas} sample cinemas`);
    }
  }
} catch (error) {
  await db.end();
  throw error;
}

const server = createApp(db).listen(config.port, () => {
  console.log(`Doomsday Ready API listening on http://localhost:${config.port}/api`);
});

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async (error) => {
    try {
      await db.end();
      if (error) {
        console.error('HTTP server shutdown failed', error);
        process.exitCode = 1;
      }
    } catch (closeError) {
      console.error('Database pool shutdown failed', closeError);
      process.exitCode = 1;
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
