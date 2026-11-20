import { config } from './config.js';
import { openDatabase } from './db.js';
import { seedSampleData } from './seed.js';

const db = openDatabase(config.databasePath);
const added = seedSampleData(db);
console.log(`Added ${added.movies} movies and ${added.cinemas} cinemas to ${config.databasePath}`);
db.close();
