import { ApiError } from './errors.js';

export function parseId(raw: string): number {
  if (!/^[1-9]\d{0,9}$/.test(raw)) {
    throw new ApiError(400, 'INVALID_ID', `"${raw}" is not a valid id`);
  }
  return Number(raw);
}
