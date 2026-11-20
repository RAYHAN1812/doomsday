import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, formatRuntime, type Movie } from '../api';
import { PrerequisitePicker } from '../components/PrerequisitePicker';

export function MoviesView() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      setMovies(await api.listMovies());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const titleOf = (id: number) => movies.find((m) => m.id === id)?.title ?? `#${id}`;

  async function toggleWatched(movie: Movie) {
    setMovies((list) => list.map((m) => (m.id === movie.id ? { ...m, watched: !m.watched } : m)));
    try {
      await api.updateMovie(movie.id, { watched: !movie.watched });
    } catch (e) {
      setError(errorMessage(e));
      void reload();
    }
  }

  async function remove(movie: Movie) {
    if (!window.confirm(`Delete "${movie.title}"? It will also be removed from other movies’ prerequisites.`)) return;
    try {
      await api.deleteMovie(movie.id);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const watchedCount = movies.filter((m) => m.watched).length;

  return (
    <div className="grid two">
      <section className="card">
        <h2>Add a movie</h2>
        <AddMovieForm movies={movies} onCreated={reload} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Movies</h2>
          {movies.length > 0 && (
            <span className="pill">
              {watchedCount} of {movies.length} watched
            </span>
          )}
        </div>

        {error && <p className="alert">{error}</p>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && movies.length === 0 && <p className="muted">No movies yet. Add one to get started.</p>}

        <ul className="movie-list">
          {movies.map((movie) => (
            <li key={movie.id} className={movie.watched ? 'movie watched' : 'movie'}>
              <div className="movie-row">
                <label className="check" title={movie.watched ? 'Mark as not watched' : 'Mark as watched'}>
                  <input type="checkbox" checked={movie.watched} onChange={() => toggleWatched(movie)} />
                  <span className="sr-only">Watched</span>
                </label>
                <div className="movie-main">
                  <div className="movie-title">{movie.title}</div>
                  <div className="muted small">
                    {movie.releaseYear} · {formatRuntime(movie.runtimeMinutes)}
                  </div>
                  <div className="chips">
                    {movie.prerequisiteIds.length === 0 ? (
                      <span className="muted small">No prerequisites</span>
                    ) : (
                      <>
                        <span className="muted small">Watch first:</span>
                        {movie.prerequisiteIds.map((id) => (
                          <span key={id} className="chip">
                            {titleOf(id)}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="ghost"
                    onClick={() => setEditingId(editingId === movie.id ? null : movie.id)}
                    aria-expanded={editingId === movie.id}
                  >
                    Edit prerequisites
                  </button>
                  <button className="ghost danger" onClick={() => remove(movie)} aria-label={`Delete ${movie.title}`}>
                    Delete
                  </button>
                </div>
              </div>

              {editingId === movie.id && (
                <EditPrerequisites
                  movie={movie}
                  movies={movies}
                  onDone={() => {
                    setEditingId(null);
                    void reload();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AddMovieForm({ movies, onCreated }: { movies: Movie[]; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [runtime, setRuntime] = useState('');
  const [prerequisiteIds, setPrerequisiteIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createMovie({
        title,
        releaseYear: Number(releaseYear),
        runtimeMinutes: Number(runtime),
        prerequisiteIds,
      });
      setTitle('');
      setReleaseYear('');
      setRuntime('');
      setPrerequisiteIds([]);
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </label>
      <div className="form-row">
        <label>
          Release year
          <input
            type="number"
            value={releaseYear}
            onChange={(e) => setReleaseYear(e.target.value)}
            required
            min={1888}
            max={2100}
          />
        </label>
        <label>
          Runtime (minutes)
          <input type="number" value={runtime} onChange={(e) => setRuntime(e.target.value)} required min={1} max={300} />
        </label>
      </div>
      <fieldset>
        <legend>Watch these first (optional)</legend>
        <PrerequisitePicker movies={movies} selected={prerequisiteIds} onChange={setPrerequisiteIds} />
      </fieldset>
      {error && <p className="alert">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Adding…' : 'Add movie'}
      </button>
    </form>
  );
}

function EditPrerequisites({
  movie,
  movies,
  onDone,
  onCancel,
}: {
  movie: Movie;
  movies: Movie[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(movie.prerequisiteIds);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateMovie(movie.id, { prerequisiteIds: selected });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <p className="small">
        What should you watch before <strong>{movie.title}</strong>?
      </p>
      <PrerequisitePicker movies={movies} selected={selected} onChange={setSelected} excludeId={movie.id} />
      {error && <p className="alert">{error}</p>}
      <div className="editor-actions">
        <button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
