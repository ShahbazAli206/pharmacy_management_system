import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './lib/auth';
import { I18nProvider } from './lib/i18n/I18nContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

// App-shell caching (spec §13.2) — production only. A service worker's
// aggressive caching fights the dev server's own HMR/rebuild cycle, so it
// would make local development confusing for no offline benefit there.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort: the app must still work with no offline app-shell
      // caching (e.g. an older browser) — only the IndexedDB dispense queue
      // is load-bearing for the actual offline-dispensing requirement.
    });
  });
}
