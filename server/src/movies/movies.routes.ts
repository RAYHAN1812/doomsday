import { Router } from 'express';
import type { Db } from '../db.js';
import { parseId } from '../params.js';
import { movieCreateSchema, movieUpdateSchema } from './movies.schema.js';
import { MovieService } from './movies.service.js';

export function moviesRouter(db: Db): Router {
  const movies = new MovieService(db);
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await movies.list());
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await movies.create(movieCreateSchema.parse(req.body)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await movies.get(parseId(req.params.id)));
  });

  router.patch('/:id', async (req, res) => {
    res.json(await movies.update(parseId(req.params.id), movieUpdateSchema.parse(req.body)));
  });

  router.delete('/:id', async (req, res) => {
    await movies.delete(parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/rewatch-order', async (req, res) => {
    res.json(await movies.rewatchPlan(parseId(req.params.id)));
  });

  return router;
}
