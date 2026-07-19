import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CustomFieldsEditor } from '../components/CustomFieldsEditor';
import type { CustomFieldDefinition, Paginated, ProductDetail } from '../lib/types';

const FORMS = ['TABLET', 'CAPSULE', 'LIQUID', 'CREAM', 'OINTMENT', 'INJECTION', 'INHALER', 'DROPS', 'PATCH', 'SUPPOSITORY', 'OTHER'] as const;
const SCHEDULES = ['UNSCHEDULED', 'OTC', 'SCHEDULE_I', 'SCHEDULE_II', 'SCHEDULE_III', 'NARCOTIC', 'CONTROLLED', 'TARGETED'] as const;

const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

export function Products() {
  const { can } = useAuth();
  const canManage = can('product:manage');

  const [data, setData] = useState<Paginated<ProductDetail> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ProductDetail | 'new' | null>(null);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    api<CustomFieldDefinition[]>('/custom-fields/definitions?entityType=PRODUCT').then(setDefinitions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search.trim()) params.set('search', search.trim());
      setData(await api<Paginated<ProductDetail>>(`/products?${params.toString()}`));
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
          <h1>Product Catalog</h1>
          <p className="muted">{data ? `${data.total} product(s)` : ' '}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + New product
          </button>
        )}
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          definitions={definitions}
          onSaved={(msg) => {
            setNotice(msg);
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
          onError={setError}
        />
      )}

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
          placeholder="Search by name, generic name, or DIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>DIN</th>
                <th>Name</th>
                <th>Strength</th>
                <th>Form</th>
                <th>Schedule</th>
                <th className="num">Default price</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="muted">
                    No products yet.
                  </td>
                </tr>
              )}
              {!loading &&
                data?.items.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.din}</td>
                    <td>
                      {p.name}
                      {p.isControlled && <span className="badge badge-error" style={{ marginLeft: 6 }}>Controlled</span>}
                    </td>
                    <td>{p.strength}</td>
                    <td>{p.form}</td>
                    <td>{p.schedule.replace(/_/g, ' ')}</td>
                    <td className="num">{money(p.defaultPriceCents)}</td>
                    {canManage && (
                      <td>
                        <button className="btn btn-ghost" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                      </td>
                    )}
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

function ProductForm({
  product,
  definitions,
  onSaved,
  onCancel,
  onError,
}: {
  product: ProductDetail | null;
  definitions: CustomFieldDefinition[];
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onError: (m: string | null) => void;
}) {
  const [din, setDin] = useState(product?.din ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [genericName, setGenericName] = useState(product?.genericName ?? '');
  const [strength, setStrength] = useState(product?.strength ?? '');
  const [form, setForm] = useState<(typeof FORMS)[number]>((product?.form as never) ?? 'TABLET');
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? '');
  const [schedule, setSchedule] = useState<(typeof SCHEDULES)[number]>((product?.schedule as never) ?? 'UNSCHEDULED');
  const [isControlled, setIsControlled] = useState(product?.isControlled ?? false);
  const [priceDollars, setPriceDollars] = useState(product ? (product.defaultPriceCents / 100).toFixed(2) : '');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(product?.customFields ?? {});
  const [busy, setBusy] = useState(false);

  const valid = din.trim() && name.trim() && strength.trim();

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      const body = {
        din: din.trim(),
        name: name.trim(),
        genericName: genericName.trim() || null,
        strength: strength.trim(),
        form,
        manufacturer: manufacturer.trim() || null,
        schedule,
        isControlled,
        defaultPriceCents: priceDollars ? Math.round(Number(priceDollars) * 100) : 0,
        customFields,
      };
      if (product) {
        await api(`/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        onSaved('Product updated.');
      } else {
        await api('/products', { method: 'POST', body: JSON.stringify(body) });
        onSaved('Product created.');
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to save product');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{product ? 'Edit product' : 'New product'}</h2>
      <div className="form-grid">
        <label className="field">
          DIN
          <input value={din} onChange={(e) => setDin(e.target.value)} placeholder="00000001" />
        </label>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Generic name (optional)
          <input value={genericName} onChange={(e) => setGenericName(e.target.value)} />
        </label>
        <label className="field">
          Strength
          <input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="500 mg" />
        </label>
        <label className="field">
          Form
          <select value={form} onChange={(e) => setForm(e.target.value as typeof form)}>
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Manufacturer (optional)
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </label>
        <label className="field">
          Schedule
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}>
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Default price (CAD, optional)
          <input type="number" min="0" step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} />
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={isControlled} onChange={(e) => setIsControlled(e.target.checked)} />
          Controlled substance
        </label>

        <CustomFieldsEditor
          definitions={definitions}
          values={customFields}
          onChange={(key, value) => setCustomFields((prev) => ({ ...prev, [key]: value }))}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
