import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Paginated, Patient } from '../lib/types';

export function Patients() {
  const { can } = useAuth();
  const [data, setData] = useState<Paginated<Patient> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search.trim()) params.set('search', search.trim());
      setData(await api<Paginated<Patient>>(`/patients?${params.toString()}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>Patients</h1>
          <p className="muted">{data ? `${data.total} record(s)` : ' '}</p>
        </div>
        {can('patient:write') && <button className="btn btn-primary" disabled>+ New patient</button>}
      </header>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load();
        }}
      >
        <input
          className="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Gender</th>
                <th>Health card</th>
                <th>Allergies</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No patients yet.
                  </td>
                </tr>
              )}
              {!loading &&
                data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.lastName}, {p.firstName}
                    </td>
                    <td>{new Date(p.dateOfBirth).toLocaleDateString('en-CA')}</td>
                    <td>{p.gender}</td>
                    <td className="mono">{p.healthCard ?? '—'}</td>
                    <td>
                      {p.allergies.length === 0
                        ? '—'
                        : p.allergies.map((a) => a.substance).join(', ')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages}
          </span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
