export interface Movie {
  id: number;
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  watched: boolean;
  prerequisiteIds: number[];
}

export interface NewMovie {
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  prerequisiteIds: number[];
}

export interface RewatchPlan {
  target: { id: number; title: string };
  movies: Movie[];
  totalCount: number;
  watchedCount: number;
  unwatchedCount: number;
  unwatchedRuntimeMinutes: number;
}

export interface Cinema {
  id: number;
  name: string;
  bundleSizes: number[];
}

export type BookingQuote = { cinema: { id: number; name: string }; groupSize: number } & (
  | { possible: true; totalBundles: number; bundles: { size: number; count: number }[] }
  | { possible: false; totalBundles: null; bundles: [] }
);

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body?.error;
    const detail = error?.details?.[0]?.message;
    throw new ApiRequestError(
      res.status,
      error?.code ?? 'UNKNOWN',
      detail ? `${error.message}: ${detail}` : (error?.message ?? `Request failed (${res.status})`),
    );
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  listMovies: () => request<Movie[]>('/movies'),
  createMovie: (movie: NewMovie) => request<Movie>('/movies', json('POST', movie)),
  updateMovie: (id: number, patch: Partial<Omit<Movie, 'id'>>) =>
    request<Movie>(`/movies/${id}`, json('PATCH', patch)),
  deleteMovie: (id: number) => request<void>(`/movies/${id}`, { method: 'DELETE' }),
  rewatchOrder: (id: number) => request<RewatchPlan>(`/movies/${id}/rewatch-order`),

  listCinemas: () => request<Cinema[]>('/cinemas'),
  createCinema: (cinema: { name: string; bundleSizes: number[] }) =>
    request<Cinema>('/cinemas', json('POST', cinema)),
  booking: (id: number, groupSize: number) =>
    request<BookingQuote>(`/cinemas/${id}/booking?groupSize=${groupSize}`),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === 'CIRCULAR_DEPENDENCY') {
    return 'That would create a loop: a movie can’t end up depending on itself.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
