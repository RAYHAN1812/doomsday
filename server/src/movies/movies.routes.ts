import { Router } from 'express';
import type { Db } from '../db.js';
import { parseId } from '../params.js';
import { movieCreateSchema, movieUpdateSchema } from './movies.schema.js';
import { MovieService } from './movies.service.js';

export function moviesRouter(db: Db): Router {
  const movies = new MovieService(db);
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(movies.list());
  });

  router.post('/', (req, res) => {
    res.status(201).json(movies.create(movieCreateSchema.parse(req.body)));
  });

  router.get('/:id', (req, res) => {
    res.json(movies.get(parseId(req.params.id)));
  });

  router.patch('/:id', (req, res) => {
    res.json(movies.update(parseId(req.params.id), movieUpdateSchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    movies.delete(parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/rewatch-order', (req, res) => {
    res.json(movies.rewatchPlan(parseId(req.params.id)));
  });

  return router;
}
