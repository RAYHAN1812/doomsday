import { Router } from 'express';
import type { Db } from '../db.js';
import { parseId } from '../params.js';
import { cinemaCreateSchema, groupSizeSchema } from './cinemas.schema.js';
import { CinemaService } from './cinemas.service.js';

export function cinemasRouter(db: Db): Router {
  const cinemas = new CinemaService(db);
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await cinemas.list());
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await cinemas.create(cinemaCreateSchema.parse(req.body)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await cinemas.get(parseId(req.params.id)));
  });

  router.delete('/:id', async (req, res) => {
    await cinemas.delete(parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/booking', async (req, res) => {
    const id = parseId(req.params.id);
    const groupSize = groupSizeSchema.parse(req.query.groupSize);
    res.json(await cinemas.booking(id, groupSize));
  });

  return router;
}
