import { useEffect, useState } from 'react';
import { BookingView } from './views/BookingView';
import { MoviesView } from './views/MoviesView';
import { RewatchView } from './views/RewatchView';

const TABS = [
  { id: 'movies', label: 'Movies' },
  { id: 'rewatch', label: 'Rewatch Plan' },
  { id: 'booking', label: 'Booking' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const hash = window.location.hash.replace('#/', '');
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'movies';
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◐
          </span>
          <div>
            <h1>Doomsday Ready</h1>
            <p>Plan your MCU rewatch and book the opening-night watch party.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/${t.id}`}
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'movies' && <MoviesView />}
        {tab === 'rewatch' && <RewatchView />}
        {tab === 'booking' && <BookingView />}
      </main>
    </div>
  );
}
