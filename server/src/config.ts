export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? 'data/doomsday.db',
  seedSampleData: (process.env.SEED_SAMPLE_DATA ?? 'true') !== 'false',
};
