import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, formatRuntime, type Movie, type RewatchPlan } from '../api';

const DEFAULT_TARGET = 'Avengers: Doomsday';

export function RewatchView() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [plan, setPlan] = useState<RewatchPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMovies()
      .then((list) => {
        setMovies(list);
        const preferred = list.find((m) => m.title === DEFAULT_TARGET) ?? list[list.length - 1];
        setTargetId(preferred?.id ?? null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadPlan = useCallback(async (id: number) => {
    try {
      setPlan(await api.rewatchOrder(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (targetId !== null) void loadPlan(targetId);
  }, [targetId, loadPlan]);

  async function toggleWatched(movie: Movie) {
    try {
      await api.updateMovie(movie.id, { watched: !movie.watched });
      if (targetId !== null) await loadPlan(targetId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (movies.length === 0) {
    return (
      <section className="card">
        <p className="muted">
          Add some movies first on the <a href="#/movies">Movies</a> tab.
        </p>
      </section>
    );
  }

  const percent = plan && plan.totalCount > 0 ? Math.round((plan.watchedCount / plan.totalCount) * 100) : 100;

  return (
    <section className="card narrow">
      <label className="field">
        <span>What are you getting ready for?</span>
        <select value={targetId ?? ''} onChange={(e) => setTargetId(Number(e.target.value))}>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} ({m.releaseYear})
            </option>
          ))}
        </select>
      </label>

      {error && <p className="alert">{error}</p>}

      {plan && (
        <>
          <div className="progress-block">
            <div className="progress-text">
              <strong>
                {plan.watchedCount} of {plan.totalCount} watched
              </strong>
              <span className="muted">
                {plan.unwatchedCount === 0
                  ? 'Nothing left to watch'
                  : `${formatRuntime(plan.unwatchedRuntimeMinutes)} left across ${plan.unwatchedCount} ${
                      plan.unwatchedCount === 1 ? 'movie' : 'movies'
                    }`}
              </span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={plan.totalCount}
              aria-valuenow={plan.watchedCount}
              aria-label="Rewatch progress"
            >
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          {plan.totalCount === 0 ? (
            <p className="ready">
              No prerequisites — you’re ready for <strong>{plan.target.title}</strong>.
            </p>
          ) : (
            <ol className="plan">
              {plan.movies.map((movie, i) => (
                <li key={movie.id} className={movie.watched ? 'watched' : ''}>
                  <span className="step">{i + 1}</span>
                  <label className="plan-item">
                    <input type="checkbox" checked={movie.watched} onChange={() => toggleWatched(movie)} />
                    <span className="plan-title">{movie.title}</span>
                    <span className="muted small">
                      {movie.releaseYear} · {formatRuntime(movie.runtimeMinutes)}
                    </span>
                  </label>
                </li>
              ))}
              <li className="target">
                <span className="step">★</span>
                <span className="plan-title">{plan.target.title}</span>
                <span className="muted small">the main event</span>
              </li>
            </ol>
          )}
        </>
      )}
    </section>
  );
}
