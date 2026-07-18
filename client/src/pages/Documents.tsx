import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fetchLocations, type LocationOption } from '../lib/locations';
import type { DocumentRow, SignatureRow, ImportResult } from '../lib/types';

type Tab = 'documents' | 'signatures' | 'import';

const CATEGORIES = ['POLICY', 'LEASE', 'LICENSE', 'INVOICE', 'CONSENT', 'OTHER'];
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Documents() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('documents');
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <header className="page-head">
        <h1>Documents</h1>
        <p className="muted">Document manager, e-signatures, and bulk data import</p>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          Documents
        </button>
        <button className={`tab ${tab === 'signatures' ? 'active' : ''}`} onClick={() => setTab('signatures')}>
          E-signatures
        </button>
        {can('data:import') && (
          <button className={`tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
            Bulk import
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'documents' && <DocumentsTab onError={setError} />}
      {tab === 'signatures' && <SignaturesTab onError={setError} />}
      {tab === 'import' && <ImportTab onError={setError} />}
    </div>
  );
}

function DocumentsTab({ onError }: { onError: (m: string | null) => void }) {
  const { can } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('POLICY');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await api<DocumentRow[]>('/documents'));
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    if (!file || !name.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const contentBase64 = await readAsBase64(file);
      await api('/documents', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), category, mimeType: file.type || 'application/octet-stream', contentBase64 }),
      });
      setName('');
      setFile(null);
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {can('document:write') && (
        <section className="panel">
          <h2>Upload document</h2>
          <div className="form-grid">
            <label className="field">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lease agreement 2026" />
            </label>
            <label className="field">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              File
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn btn-primary" onClick={upload} disabled={busy || !file || !name.trim()}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Documents</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th className="num">Size</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No documents yet.
                  </td>
                </tr>
              )}
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>
                    <span className="badge badge-muted">{d.category}</span>
                  </td>
                  <td className="mono">{d.mimeType}</td>
                  <td className="num">{fmtBytes(d.sizeBytes)}</td>
                  <td>{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SignaturesTab({ onError }: { onError: (m: string | null) => void }) {
  const [sigs, setSigs] = useState<SignatureRow[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api<SignatureRow[]>('/signatures'), api<DocumentRow[]>('/documents')]);
      setSigs(s);
      setDocs(d);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const request = async () => {
    if (!documentId || !signerName.trim() || !signerEmail.trim()) return;
    onError(null);
    try {
      await api('/signatures', { method: 'POST', body: JSON.stringify({ documentId, signerName: signerName.trim(), signerEmail: signerEmail.trim() }) });
      setSignerName('');
      setSignerEmail('');
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const sign = async (id: string, decision: 'SIGNED' | 'DECLINED') => {
    onError(null);
    try {
      await api(`/signatures/${id}/sign`, {
        method: 'POST',
        body: JSON.stringify({ decision, signatureData: decision === 'SIGNED' ? `signed-${Date.now()}` : undefined }),
      });
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const docName = (id: string) => docs.find((d) => d.id === id)?.name ?? id;
  const statusBadge = (s: string) => (s === 'SIGNED' ? 'badge-ok' : s === 'DECLINED' ? 'badge-danger' : 'badge-warn');

  return (
    <>
      <section className="panel">
        <h2>Request a signature</h2>
        <div className="form-grid">
          <label className="field">
            Document
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">Select a document…</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Signer name
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label className="field">
            Signer email
            <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={request} disabled={!documentId || !signerName.trim() || !signerEmail.trim()}>
            Request signature
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Signature requests</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Signer</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sigs.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No signature requests.
                  </td>
                </tr>
              )}
              {sigs.map((s) => (
                <tr key={s.id}>
                  <td>{docName(s.documentId)}</td>
                  <td>
                    {s.signerName}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.signerEmail}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.status === 'PENDING' && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" onClick={() => sign(s.id, 'SIGNED')}>
                          Sign
                        </button>
                        <button className="btn" onClick={() => sign(s.id, 'DECLINED')}>
                          Decline
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ImportTab({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [entity, setEntity] = useState<'products' | 'patients'>('products');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');

  useEffect(() => {
    if (isOwner) fetchLocations().then(setLocations).catch(() => {});
  }, [isOwner]);

  const needsLocation = isOwner && entity === 'patients';

  const placeholder =
    entity === 'products'
      ? 'din,name,strength,form\n02240000,Amoxicillin,500mg,CAPSULE'
      : 'firstName,lastName,dateOfBirth,gender\nJane,Doe,1990-05-01,FEMALE';

  const run = async () => {
    if (!csv.trim()) return;
    if (needsLocation && !pharmacyId) {
      onError('Select a location for the patient import.');
      return;
    }
    setBusy(true);
    setResult(null);
    onError(null);
    try {
      const res = await api<ImportResult>(`/imports/${entity}`, {
        method: 'POST',
        body: JSON.stringify({ csv, ...(needsLocation ? { pharmacyId } : {}) }),
      });
      setResult(res);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Bulk import from CSV</h2>
      <div className="form-row">
        <label className="field">
          Entity
          <select value={entity} onChange={(e) => setEntity(e.target.value as 'products' | 'patients')}>
            <option value="products">Products</option>
            <option value="patients">Patients</option>
          </select>
        </label>
        {needsLocation && (
          <label className="field">
            Location
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="field" style={{ marginBottom: 14 }}>
        CSV (first row = headers)
        <textarea className="mono" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={placeholder} rows={8} />
      </label>
      <button className="btn btn-primary" onClick={run} disabled={busy || !csv.trim()}>
        {busy ? 'Importing…' : 'Import'}
      </button>

      {result && (
        <div style={{ marginTop: 20 }}>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Rows</div>
              <div className="stat-value">{result.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Created</div>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>
                {result.created}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Failed</div>
              <div className="stat-value" style={{ color: result.failed > 0 ? 'var(--danger)' : undefined }}>
                {result.failed}
              </div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((er, i) => (
                  <tr key={i}>
                    <td className="mono">{er.row}</td>
                    <td>{er.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
