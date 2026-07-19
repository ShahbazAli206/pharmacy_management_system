import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
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
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('documents');
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <header className="page-head">
        <h1>{t('documentsHeading')}</h1>
        <p className="muted">{t('documentsSubtitle')}</p>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          {t('documentsTab')}
        </button>
        <button className={`tab ${tab === 'signatures' ? 'active' : ''}`} onClick={() => setTab('signatures')}>
          {t('esignaturesTab')}
        </button>
        {can('data:import') && (
          <button className={`tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
            {t('bulkImportTab')}
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
  const { t } = useI18n();
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
          <h2>{t('uploadDocumentHeading')}</h2>
          <div className="form-grid">
            <label className="field">
              {t('nameLabel')}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('documentNamePlaceholder')} />
            </label>
            <label className="field">
              {t('categoryLabel')}
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('fileLabel')}
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn btn-primary" onClick={upload} disabled={busy || !file || !name.trim()}>
              {busy ? t('uploadingEllipsis') : t('uploadButton')}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>{t('documentsHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colName')}</th>
                <th>{t('colCategory')}</th>
                <th>{t('colType')}</th>
                <th className="num">{t('colSize')}</th>
                <th>{t('colUploaded')}</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t('noDocumentsYet')}
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
  const { t } = useI18n();
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
        <h2>{t('requestSignatureHeading')}</h2>
        <div className="form-grid">
          <label className="field">
            {t('documentLabel')}
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">{t('selectDocumentOption')}</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('signerNameLabel')}
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label className="field">
            {t('signerEmailLabel')}
            <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={request} disabled={!documentId || !signerName.trim() || !signerEmail.trim()}>
            {t('requestSignatureButton')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>{t('signatureRequestsHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('documentLabel')}</th>
                <th>{t('colSigner')}</th>
                <th>{t('colStatus')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sigs.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {t('noSignatureRequests')}
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
                          {t('signButton')}
                        </button>
                        <button className="btn" onClick={() => sign(s.id, 'DECLINED')}>
                          {t('declineButton')}
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
  const { t } = useI18n();
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
      onError(t('selectLocationForPatientImport'));
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
      <h2>{t('bulkImportHeading')}</h2>
      <div className="form-row">
        <label className="field">
          {t('entityLabel')}
          <select value={entity} onChange={(e) => setEntity(e.target.value as 'products' | 'patients')}>
            <option value="products">{t('productsOption')}</option>
            <option value="patients">{t('patientsOption')}</option>
          </select>
        </label>
        {needsLocation && (
          <label className="field">
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">{t('selectLocationPlaceholder')}</option>
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
        {t('csvHeadersLabel')}
        <textarea className="mono" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={placeholder} rows={8} />
      </label>
      <button className="btn btn-primary" onClick={run} disabled={busy || !csv.trim()}>
        {busy ? t('importingEllipsis') : t('importButton')}
      </button>

      {result && (
        <div style={{ marginTop: 20 }}>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{t('statRows')}</div>
              <div className="stat-value">{result.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('statCreatedCount')}</div>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>
                {result.created}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('statFailed')}</div>
              <div className="stat-value" style={{ color: result.failed > 0 ? 'var(--danger)' : undefined }}>
                {result.failed}
              </div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colRow')}</th>
                  <th>{t('colError')}</th>
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
