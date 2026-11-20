export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  seedSampleData: (process.env.SEED_SAMPLE_DATA ?? 'true') !== 'false',
};
