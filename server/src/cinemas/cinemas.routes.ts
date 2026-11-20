import { Router } from 'express';
import type { Db } from '../db.js';
import { parseId } from '../params.js';
import { cinemaCreateSchema, groupSizeSchema } from './cinemas.schema.js';
import { CinemaService } from './cinemas.service.js';

export function cinemasRouter(db: Db): Router {
  const cinemas = new CinemaService(db);
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(cinemas.list());
  });

  router.post('/', (req, res) => {
    res.status(201).json(cinemas.create(cinemaCreateSchema.parse(req.body)));
  });

  router.get('/:id', (req, res) => {
    res.json(cinemas.get(parseId(req.params.id)));
  });

  router.delete('/:id', (req, res) => {
    cinemas.delete(parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/booking', (req, res) => {
    const id = parseId(req.params.id);
    const groupSize = groupSizeSchema.parse(req.query.groupSize);
    res.json(cinemas.booking(id, groupSize));
  });

  return router;
}
