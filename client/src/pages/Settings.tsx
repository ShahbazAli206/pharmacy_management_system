import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { LOCALE_LABELS, LOCALES } from '../lib/i18n/translations';
import type { SystemSettings, NotificationPreference } from '../lib/types';

export function Settings() {
  const { can } = useAuth();
  const { t, locale, setLocale, isOverride, clearOverride } = useI18n();
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
      setNotice(t('settingsSaved'));
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
        <h1>{t('settingsTitle')}</h1>
        <p className="muted">{t('settingsSubtitle')}</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
          {notice}
        </div>
      )}

      <section className="panel">
        <h2>{t('languageHeading')}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{t('languageDesc')}</p>
        <div className="form-row">
          <select value={locale} onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
          {isOverride && (
            <button className="btn btn-ghost" onClick={clearOverride}>
              {t('useSystemDefault')}
            </button>
          )}
        </div>
      </section>

      {canManage && settings && (
        <section className="panel">
          <h2>{t('systemSettingsHeading')}</h2>

          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>{t('maintenanceModeLabel')}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {t('maintenanceModeDesc')}
              </div>
            </div>
            <button
              className={`btn ${settings.maintenanceMode ? 'btn-primary' : ''}`}
              onClick={() => saveSettings({ maintenanceMode: !settings.maintenanceMode })}
            >
              {settings.maintenanceMode ? t('on') : t('off')}
            </button>
          </div>

          <SettingsForm settings={settings} onSave={saveSettings} />
        </section>
      )}

      {prefs && (
        <section className="panel">
          <h2>{t('myNotificationPrefsHeading')}</h2>
          {(['sms', 'email', 'push', 'inApp'] as const).map((ch) => (
            <div className="toggle-row" key={ch}>
              <div style={{ fontWeight: 500 }}>
                {ch === 'sms' && t('channelSms')}
                {ch === 'email' && t('channelEmail')}
                {ch === 'push' && t('channelPush')}
                {ch === 'inApp' && t('channelInApp')}
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
  const { t } = useI18n();
  const [retention, setRetention] = useState(settings.dataRetentionDays);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [timezone, setTimezone] = useState(settings.defaultTimezone);
  const [locale, setLocale] = useState(settings.defaultLocale);

  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="field">
        {t('dataRetentionLabel')}
        <input type="number" min={3650} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
      </label>
      <label className="field">
        {t('defaultCurrencyLabel')}
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </label>
      <label className="field">
        {t('defaultTimezoneLabel')}
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </label>
      <label className="field">
        {t('defaultLocaleLabel')}
        <input value={locale} onChange={(e) => setLocale(e.target.value)} />
      </label>
      <button
        className="btn btn-primary"
        onClick={() => onSave({ dataRetentionDays: retention, defaultCurrency: currency, defaultTimezone: timezone, defaultLocale: locale })}
      >
        {t('saveSettingsButton')}
      </button>
    </div>
  );
}
