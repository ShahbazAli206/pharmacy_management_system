import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SystemSettings, NotificationPreference } from '../lib/types';

export function Settings() {
  const { can } = useAuth();
  const canManage = can('settings:manage');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api<SystemSettings>('/settings'),
        api<NotificationPreference>('/settings/notification-preferences'),
      ]);
      setSettings(s);
      setPrefs(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (patch: Partial<SystemSettings>) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await api<SystemSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) });
      setSettings(updated);
      setNotice('Settings saved.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const savePrefs = async (patch: Partial<NotificationPreference>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await api('/settings/notification-preferences', { method: 'PUT', body: JSON.stringify(next) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Settings</h1>
        <p className="muted">System configuration and your notification preferences</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
          {notice}
        </div>
      )}

      {canManage && settings && (
        <section className="panel">
          <h2>System settings</h2>

          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Maintenance mode</div>
              <div className="muted" style={{ fontSize: 13 }}>
                When on, the system is read-only — all writes are blocked except sign-in and settings.
              </div>
            </div>
            <button
              className={`btn ${settings.maintenanceMode ? 'btn-primary' : ''}`}
              onClick={() => saveSettings({ maintenanceMode: !settings.maintenanceMode })}
            >
              {settings.maintenanceMode ? 'ON' : 'OFF'}
            </button>
          </div>

          <SettingsForm settings={settings} onSave={saveSettings} />
        </section>
      )}

      {prefs && (
        <section className="panel">
          <h2>My notification preferences</h2>
          {(['sms', 'email', 'push', 'inApp'] as const).map((ch) => (
            <div className="toggle-row" key={ch}>
              <div style={{ fontWeight: 500 }}>
                {ch === 'inApp' ? 'In-app' : ch.toUpperCase()}
              </div>
              <label style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={prefs[ch]} onChange={(e) => savePrefs({ [ch]: e.target.checked })} />
              </label>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function SettingsForm({ settings, onSave }: { settings: SystemSettings; onSave: (p: Partial<SystemSettings>) => void }) {
  const [retention, setRetention] = useState(settings.dataRetentionDays);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [timezone, setTimezone] = useState(settings.defaultTimezone);
  const [locale, setLocale] = useState(settings.defaultLocale);

  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="field">
        Data retention (days, ≥ 3650)
        <input type="number" min={3650} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
      </label>
      <label className="field">
        Default currency
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </label>
      <label className="field">
        Default timezone
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </label>
      <label className="field">
        Default locale
        <input value={locale} onChange={(e) => setLocale(e.target.value)} />
      </label>
      <button
        className="btn btn-primary"
        onClick={() => onSave({ dataRetentionDays: retention, defaultCurrency: currency, defaultTimezone: timezone, defaultLocale: locale })}
      >
        Save settings
      </button>
    </div>
  );
}
