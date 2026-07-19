import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n/I18nContext';
import type { CameraRow } from '../lib/types';

const statusColor: Record<string, string> = {
  ONLINE: 'var(--ok)',
  OFFLINE: 'var(--danger)',
  UNKNOWN: 'var(--muted)',
};

export function Cameras() {
  const { t } = useI18n();
  const [cameras, setCameras] = useState<CameraRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CameraRow[]>('/cameras')
      .then(setCameras)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!cameras) return <div className="muted">{t('loadingCameras')}</div>;

  const statusLabel = (s: string) =>
    s === 'OFFLINE' ? t('cameraStatusOffline') : s === 'UNKNOWN' ? t('cameraStatusUnknown') : s;

  return (
    <div>
      <header className="page-head">
        <h1>{t('camerasHeading')}</h1>
        <p className="muted">
          {t('camerasSubtitle', {
            count: cameras.length,
            online: cameras.filter((c) => c.status === 'ONLINE').length,
          })}
        </p>
      </header>

      {cameras.length === 0 ? (
        <div className="panel muted">{t('noCamerasRegistered')}</div>
      ) : (
        <div className="stat-grid">
          {cameras.map((c) => (
            <div key={c.id} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label">{c.placement}</span>
                <span className="dot" style={{ background: statusColor[c.status] }} />
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{c.label}</div>
              <div
                style={{
                  background: '#0f172a',
                  height: 120,
                  borderRadius: 8,
                  margin: '10px 0',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                {c.status === 'ONLINE' ? t('liveFeedLabel') : statusLabel(c.status)}
              </div>
              <div className="stat-sub" style={{ color: 'var(--muted)' }}>
                {c.pharmacy.code} · {c.ipAddress}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted">{t('camerasFooterNote')}</p>
    </div>
  );
}
