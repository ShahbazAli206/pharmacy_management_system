import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { LOCALES, TRANSLATIONS, type Locale, type TranslationKey } from './translations';

const STORAGE_KEY = 'pms_locale';

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Whether the current locale is the user's own override vs. the system default. */
  isOverride: boolean;
  clearOverride: () => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nState | undefined>(undefined);

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (LOCALES as string[]).includes(v) ? (v as Locale) : null;
  } catch {
    return null; // private-mode storage errors
  }
}

/**
 * Locale is resolved as: personal override (localStorage) > system default
 * (GET /settings, best-effort — fails silently pre-login) > 'en'. Independent
 * of AuthProvider so the pre-login screen can still be translated.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<Locale | null>(readStoredLocale);
  const [systemDefault, setSystemDefault] = useState<Locale>('en');

  useEffect(() => {
    api<{ defaultLocale: string }>('/settings')
      .then((s) => {
        if (LOCALES.includes(s.defaultLocale as Locale)) setSystemDefault(s.defaultLocale as Locale);
      })
      .catch(() => {
        /* not logged in yet, or settings unavailable — 'en' fallback stands */
      });
  }, []);

  const locale = override ?? systemDefault;

  const setLocale = useCallback((l: Locale) => {
    setOverride(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore storage errors (private mode) */
    }
  }, []);

  const clearOverride = useCallback(() => {
    setOverride(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: TranslationKey) => TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key] ?? key, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, isOverride: override !== null, clearOverride, t }),
    [locale, setLocale, override, clearOverride, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
