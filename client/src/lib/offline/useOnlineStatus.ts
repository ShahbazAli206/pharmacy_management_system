import { useEffect, useState } from 'react';
import { syncPendingDispenses, type SyncResult } from './offlineDispense';

/**
 * Tracks browser connectivity and automatically flushes the offline-dispense
 * queue the moment connectivity returns (spec §13.2: "syncs on
 * reconnection"). `navigator.onLine` plus the 'online'/'offline' events is
 * the standard, dependency-free way to detect this — accurate enough for a
 * pharmacy terminal that stays on one network (it does not detect a merely
 * degraded connection, only a fully absent one, which is the outage scenario
 * the spec describes).
 */
export function useOnlineStatus(): { online: boolean; lastSync: SyncResult | null; syncing: boolean } {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setSyncing(true);
      syncPendingDispenses()
        .then(setLastSync)
        .finally(() => setSyncing(false));
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Also try once at mount — covers the case where the queue has leftover
    // jobs from a previous session that ended before they could sync.
    if (navigator.onLine) goOnline();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { online, lastSync, syncing };
}
