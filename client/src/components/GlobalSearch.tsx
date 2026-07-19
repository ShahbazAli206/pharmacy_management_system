import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface SearchResult {
  type: 'patient' | 'prescription' | 'product';
  id: string;
  label: string;
}

interface SearchResponse {
  query: string;
  results: {
    patients: SearchResult[];
    prescriptions: SearchResult[];
    products: SearchResult[];
  };
}

const DESTINATIONS: Record<SearchResult['type'], string> = {
  patient: '/patients',
  prescription: '/prescriptions',
  product: '/inventory',
};

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  patient: 'Patients',
  prescription: 'Prescriptions',
  product: 'Products',
};

/**
 * Global search command palette. Wraps the existing GET /search API (Phase 7,
 * search:global) — the backend has shipped since Phase 7 but had no client UI
 * until now. No entity has a per-record detail page anywhere in this app, so a
 * result navigates to the relevant list page, matching how the rest of the app
 * already works. Controlled by the parent (Layout owns both the Ctrl/Cmd+K
 * listener and a clickable nav button, so either path opens the same instance).
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse['results'] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    onClose();
    setQuery('');
    setResults(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      api<SearchResponse>(`/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => setResults(r.results))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [open, query]);

  if (!open) return null;

  const groups = (['patient', 'prescription', 'product'] as const).filter(
    (t) => (results?.[`${t}s` as keyof SearchResponse['results']] ?? []).length > 0,
  );

  const go = (r: SearchResult) => {
    close();
    navigate(DESTINATIONS[r.type]);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
      }}
      onClick={close}
    >
      <div
        className="panel"
        style={{ width: 560, maxWidth: '90vw', maxHeight: '60vh', overflowY: 'auto', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients, prescriptions, products… (Esc to close)"
          style={{ width: '100%', fontSize: 16, padding: '10px 12px', boxSizing: 'border-box' }}
        />

        {loading && (
          <p className="muted" style={{ marginTop: 12 }}>
            Searching…
          </p>
        )}

        {!loading && query.trim().length >= 2 && groups.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            No results.
          </p>
        )}

        {groups.map((type) => (
          <div key={type} style={{ marginTop: 16 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
              {GROUP_LABELS[type]}
            </div>
            {results![`${type}s` as keyof SearchResponse['results']].map((r) => (
              <button
                key={r.id}
                className="btn btn-ghost"
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
                onClick={() => go(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
