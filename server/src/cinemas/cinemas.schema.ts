import { z } from 'zod';

export const cinemaCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    bundleSizes: z
      .array(z.number().int().min(1, 'A bundle holds at least 1 seat').max(500, 'A bundle holds at most 500 seats'))
      .transform((sizes) => [...new Set(sizes)].sort((a, b) => a - b))
      .refine((sizes) => sizes.length >= 1 && sizes.length <= 10, {
        message: 'A cinema needs between 1 and 10 different bundle sizes',
      }),
  })
  .strict();

export const groupSizeSchema = z
  .string({ required_error: 'groupSize is required' })
  .regex(/^\d+$/, 'groupSize must be a whole number')
  .transform(Number)
  .pipe(z.number().int().min(1, 'groupSize must be at least 1').max(10_000, 'groupSize must be at most 10,000'));

export type CinemaCreateInput = z.infer<typeof cinemaCreateSchema>;
