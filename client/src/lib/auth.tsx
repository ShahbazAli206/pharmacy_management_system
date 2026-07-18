import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api';
import type { CurrentUser, LoginResponse } from './types';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we hold a token, restore the session.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!tokenStore.access && !tokenStore.refresh) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<CurrentUser>('/auth/me');
        if (active) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    const me = await api<CurrentUser>('/auth/me');
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (tokenStore.refresh) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokenStore.refresh }),
        });
      }
    } catch {
      // ignore network errors on logout
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, can }),
    [user, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
