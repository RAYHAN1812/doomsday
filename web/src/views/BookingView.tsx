import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type BookingQuote, type Cinema } from '../api';

export function BookingView() {
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [cinemaId, setCinemaId] = useState<number | null>(null);
  const [groupSize, setGroupSize] = useState('');
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCinemas(selectId?: number) {
    try {
      const list = await api.listCinemas();
      setCinemas(list);
      setCinemaId((current) => selectId ?? current ?? list[0]?.id ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    void loadCinemas();
  }, []);

  async function getQuote(e: FormEvent) {
    e.preventDefault();
    if (cinemaId === null) return;
    setBusy(true);
    setError(null);
    try {
      setQuote(await api.booking(cinemaId, Number(groupSize)));
    } catch (err) {
      setQuote(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = cinemas.find((c) => c.id === cinemaId);

  return (
    <div className="grid two">
      <section className="card">
        <h2>Book the watch party</h2>
        {cinemas.length === 0 ? (
          <p className="muted">No cinemas yet. Add one to get a quote.</p>
        ) : (
          <form className="form" onSubmit={getQuote}>
            <label>
              Cinema
              <select
                value={cinemaId ?? ''}
                onChange={(e) => {
                  setCinemaId(Number(e.target.value));
                  setQuote(null);
                }}
              >
                {cinemas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <p className="muted small">
                Sells opening-night seats in bundles of {selected.bundleSizes.join(', ')}.
              </p>
            )}
            <label>
              Group size
              <input
                type="number"
                min={1}
                max={10000}
                step={1}
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Working it out…' : 'Get quote'}
            </button>
          </form>
        )}

        {error && <p className="alert">{error}</p>}

        {quote && (
          <div className={quote.possible ? 'quote ok' : 'quote nope'} aria-live="polite">
            {quote.possible ? (
              <>
                <p className="quote-headline">
                  {quote.totalBundles} {quote.totalBundles === 1 ? 'bundle' : 'bundles'}:{' '}
                  {quote.bundles.map((b) => `${b.size} × ${b.count}`).join(', ')}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Bundle size</th>
                      <th>How many</th>
                      <th>Seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.bundles.map((b) => (
                      <tr key={b.size}>
                        <td>{b.size} seats</td>
                        <td>× {b.count}</td>
                        <td>{b.size * b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{quote.totalBundles}</td>
                      <td>{quote.groupSize}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : (
              <>
                <p className="quote-headline">Not possible</p>
                <p className="small">
                  {quote.cinema.name} can’t seat exactly {quote.groupSize} people with its bundles without leaving
                  empty seats.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Add a cinema</h2>
        <AddCinemaForm onCreated={(c) => loadCinemas(c.id)} />
      </section>
    </div>
  );
}

function AddCinemaForm({ onCreated }: { onCreated: (cinema: Cinema) => Promise<void> }) {
  const [name, setName] = useState('');
  const [sizes, setSizes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parts = sizes.split(/[\s,]+/).filter(Boolean);
    if (parts.some((p) => !/^\d+$/.test(p))) {
      setError('Bundle sizes must be whole numbers, e.g. "2, 5"');
      return;
    }
    try {
      const cinema = await api.createCinema({ name, bundleSizes: parts.map(Number) });
      setName('');
      setSizes('');
      await onCreated(cinema);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Bundle sizes
        <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="e.g. 2, 5" required />
      </label>
      <p className="muted small">1 to 10 different sizes, each between 1 and 500 seats.</p>
      {error && <p className="alert">{error}</p>}
      <button type="submit">Add cinema</button>
    </form>
  );
}
