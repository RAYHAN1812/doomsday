import { useState } from 'react';
import type { Movie } from '../api';

interface Props {
  movies: Movie[];
  selected: number[];
  onChange: (ids: number[]) => void;
  excludeId?: number;
}

export function PrerequisitePicker({ movies, selected, onChange, excludeId }: Props) {
  const [filter, setFilter] = useState('');
  const options = movies
    .filter((m) => m.id !== excludeId)
    .filter((m) => m.title.toLowerCase().includes(filter.trim().toLowerCase()));

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  if (movies.filter((m) => m.id !== excludeId).length === 0) {
    return <p className="muted small">No other movies yet.</p>;
  }

  return (
    <div className="picker">
      <input
        type="search"
        placeholder="Filter movies…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter prerequisites"
      />
      <ul>
        {options.map((m) => (
          <li key={m.id}>
            <label>
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
              <span>{m.title}</span>
              <span className="muted small">{m.releaseYear}</span>
            </label>
          </li>
        ))}
        {options.length === 0 && <li className="muted small">No matches</li>}
      </ul>
    </div>
  );
}
