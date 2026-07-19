import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import type { MessageRow, OwnerOverview } from '../lib/types';

const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

// The backend stamps location messages with the sender's role enum as the name;
// prettify known roles for display, and leave real names (e.g. "System Owner") as-is.
function useSenderLabel() {
  const { t } = useI18n();
  const roleLabels: Record<string, string> = {
    SYSTEM_OWNER: t('roleSystemOwner'),
    LOCATION_PARTNER: t('roleLocationPartner'),
    PHARMACIST_IN_CHARGE: t('rolePharmacistInCharge'),
    PHARMACY_TECHNICIAN: t('rolePharmacyTechnician'),
    CASHIER: t('roleCashier'),
    INVENTORY_MANAGER: t('roleInventoryManager'),
    ACCOUNTANT: t('roleAccountant'),
  };
  return (name: string) => roleLabels[name] ?? name;
}

interface LocationOpt {
  id: string;
  name: string;
}

export function Messages() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const senderLabel = useSenderLabel();
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
    return (id: string | null) => (id ? map.get(id) ?? t('aLocationLabel') : t('allLocationsLabel'));
  }, [locations, t]);

  return (
    <div>
      <header className="page-head">
        <h1>{t('messagesHeading')}</h1>
        <p className="muted">
          {isOwner ? t('messagesSubtitleOwner') : t('messagesSubtitleStaff')}
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
          <h2 style={{ margin: 0 }}>{t('inboxHeading')}</h2>
          <button className="btn btn-ghost" onClick={() => void load()}>
            {t('refreshButton')}
          </button>
        </div>

        {!messages && <div className="muted">{t('loadingMessages')}</div>}
        {messages && messages.length === 0 && (
          <div className="muted">{t('noMessagesYet')}</div>
        )}

        <div className="msg-list">
          {messages?.map((m) => (
            <article key={m.id} className="msg-item">
              <div className="msg-meta">
                <span
                  className={`badge ${m.scope === 'BROADCAST' ? 'badge-warn' : 'badge-muted'}`}
                >
                  {m.scope === 'BROADCAST' ? t('broadcastBadge') : t('locationBadge')}
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
  const { t } = useI18n();
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
      onSent(target ? t('broadcastSentToLocationNotice') : t('broadcastSentToAllNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToSendBroadcast'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('composeBroadcastHeading')}</h2>
      <div className="form-grid">
        <label className="field">
          {t('sendToLabel')}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('allLocationsLabel')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('subjectOptionalLabel')}
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('broadcastSubjectPlaceholder')} />
        </label>
      </div>
      <label className="field" style={{ margin: '14px 0' }}>
        {t('messageLabel')}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={t('broadcastBodyPlaceholder')} />
      </label>
      <button className="btn btn-primary" onClick={send} disabled={busy || !body.trim()}>
        {busy ? t('sendingEllipsis') : t('sendBroadcastButton')}
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
  const { t } = useI18n();
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
      onSent(t('messageSentToTeamNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToSendMessage'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('newMessageHeading')}</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        {t('visibleToStaffAt', { pharmacyName })}
      </p>
      <label className="field" style={{ marginBottom: 12 }}>
        {t('subjectOptionalLabel')}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('locationSubjectPlaceholder')} />
      </label>
      <label className="field" style={{ marginBottom: 14 }}>
        {t('messageLabel')}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={t('locationBodyPlaceholder')} />
      </label>
      <button className="btn btn-primary" onClick={send} disabled={busy || !body.trim()}>
        {busy ? t('sendingEllipsis') : t('sendMessageButton')}
      </button>
    </section>
  );
}
