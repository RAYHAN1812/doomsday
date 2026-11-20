import express, { Router } from 'express';
import { cinemasRouter } from './cinemas/cinemas.routes.js';
import type { Db } from './db.js';
import { ApiError, errorHandler } from './errors.js';
import { moviesRouter } from './movies/movies.routes.js';

export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/movies', moviesRouter(db));
  api.use('/cinemas', cinemasRouter(db));
  api.use((req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
  });

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
