import { z } from 'zod';

const fields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  releaseYear: z.number().int().min(1888).max(2100),
  runtimeMinutes: z.number().int().min(1).max(300),
  prerequisiteIds: z.array(z.number().int().positive()).max(1000),
  watched: z.boolean(),
};

export const movieCreateSchema = z
  .object({
    ...fields,
    prerequisiteIds: fields.prerequisiteIds.default([]),
    watched: fields.watched.default(false),
  })
  .strict();

export const movieUpdateSchema = z.object(fields).partial().strict();

export type MovieCreateInput = z.infer<typeof movieCreateSchema>;
export type MovieUpdateInput = z.infer<typeof movieUpdateSchema>;
