import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { MessageRow, OwnerOverview } from '../lib/types';

const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

// The backend stamps location messages with the sender's role enum as the name;
// prettify known roles for display, and leave real names (e.g. "System Owner") as-is.
const ROLE_LABELS: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  LOCATION_PARTNER: 'Location Partner',
  PHARMACIST_IN_CHARGE: 'Pharmacist-in-Charge',
  PHARMACY_TECHNICIAN: 'Pharmacy Technician',
  CASHIER: 'Cashier',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
};
const senderLabel = (name: string) => ROLE_LABELS[name] ?? name;

interface LocationOpt {
  id: string;
  name: string;
}

export function Messages() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canSend = can('message:send');
  const canBroadcast = can('message:broadcast');

  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await api<MessageRow[]>('/messages'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    if (isOwner) {
      api<OwnerOverview>('/dashboard/owner')
        .then((o) => setLocations(o.locations.map((l) => ({ id: l.id, name: l.name }))))
        .catch(() => {});
    }
  }, [load, isOwner]);

  const locationName = useMemo(() => {
    const map = new Map(locations.map((l) => [l.id, l.name]));
    return (id: string | null) => (id ? map.get(id) ?? 'A location' : 'All locations');
  }, [locations]);

  return (
    <div>
      <header className="page-head">
        <h1>Messages</h1>
        <p className="muted">
          {isOwner
            ? 'Broadcast to every location or one, and read location traffic'
            : 'Team messages for your location and owner broadcasts'}
        </p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {canBroadcast ? (
        <BroadcastComposer
          locations={locations}
          onSent={(m) => {
            setNotice(m);
            void load();
          }}
          onError={setError}
        />
      ) : canSend ? (
        <LocationComposer
          pharmacyName={user?.pharmacy?.name ?? 'your location'}
          onSent={(m) => {
            setNotice(m);
            void load();
          }}
          onError={setError}
        />
      ) : null}

      <section className="panel">
        <div className="page-head row">
          <h2 style={{ margin: 0 }}>Inbox</h2>
          <button className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {!messages && <div className="muted">Loading messages…</div>}
        {messages && messages.length === 0 && (
          <div className="muted">No messages yet.</div>
        )}

        <div className="msg-list">
          {messages?.map((m) => (
            <article key={m.id} className="msg-item">
              <div className="msg-meta">
                <span
                  className={`badge ${m.scope === 'BROADCAST' ? 'badge-warn' : 'badge-muted'}`}
                >
                  {m.scope === 'BROADCAST' ? 'Broadcast' : 'Location'}
                </span>
                <span className="msg-sender">{senderLabel(m.senderName)}</span>
                {isOwner && (
                  <span className="muted">· {locationName(m.pharmacyId)}</span>
                )}
                <span className="muted msg-time">{fmtDate(m.createdAt)}</span>
              </div>
              {m.subject && <div className="msg-subject">{m.subject}</div>}
              <div className="msg-body">{m.body}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner broadcast composer (to all locations or a specific one)
// ---------------------------------------------------------------------------

function BroadcastComposer({
  locations,
  onSent,
  onError,
}: {
  locations: LocationOpt[];
  onSent: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const [target, setTarget] = useState(''); // '' = all locations
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api('/messages/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          body: body.trim(),
          pharmacyId: target || undefined,
        }),
      });
      setSubject('');
      setBody('');
      onSent(target ? 'Broadcast sent to the selected location.' : 'Broadcast sent to all locations.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to send broadcast');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Compose broadcast</h2>
      <div className="form-grid">
        <label className="field">
          Send to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Subject (optional)
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Policy update" />
        </label>
      </div>
      <label className="field" style={{ margin: '14px 0' }}>
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Type your announcement…" />
      </label>
      <button className="btn btn-primary" onClick={send} disabled={busy || !body.trim()}>
        {busy ? 'Sending…' : 'Send broadcast'}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Intra-location composer (auto-scoped to the sender's pharmacy)
// ---------------------------------------------------------------------------

function LocationComposer({
  pharmacyName,
  onSent,
  onError,
}: {
  pharmacyName: string;
  onSent: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api('/messages', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim() || undefined, body: body.trim() }),
      });
      setSubject('');
      setBody('');
      onSent('Message sent to your team.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to send message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>New message</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        Visible to staff at {pharmacyName}.
      </p>
      <label className="field" style={{ marginBottom: 12 }}>
        Subject (optional)
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Fridge temp check" />
      </label>
      <label className="field" style={{ marginBottom: 14 }}>
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Type a note for your team…" />
      </label>
      <button className="btn btn-primary" onClick={send} disabled={busy || !body.trim()}>
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </section>
  );
}
