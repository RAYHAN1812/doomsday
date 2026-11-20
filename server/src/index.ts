import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { seedSampleData } from './seed.js';

const db = openDatabase(config.databasePath);

if (config.seedSampleData) {
  const added = seedSampleData(db);
  if (added.movies || added.cinemas) {
    console.log(`Seeded ${added.movies} sample movies and ${added.cinemas} sample cinemas`);
  }
}

const server = createApp(db).listen(config.port, () => {
  console.log(`Doomsday Ready API listening on http://localhost:${config.port}/api`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
