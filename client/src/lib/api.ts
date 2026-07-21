const API_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000/api';

const ACCESS_KEY = 'pms_access';
const REFRESH_KEY = 'pms_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawRequest(path: string, options: RequestInit, withAuth: boolean): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (withAuth && tokenStore.access) {
    headers.set('Authorization', `Bearer ${tokenStore.access}`);
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore.refresh) return false;
  // Collapse concurrent 401s into a single refresh call.
  if (!refreshInFlight) {
    refreshInFlight = rawRequest(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken: tokenStore.refresh }) },
      false,
    )
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        tokenStore.set(data.accessToken, data.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** JSON request with automatic one-shot token refresh on 401. */
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  withAuth = true,
): Promise<T> {
  let res = await rawRequest(path, options, withAuth);

  if (res.status === 401 && withAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawRequest(path, options, withAuth);
    } else {
      tokenStore.clear();
    }
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? res.statusText, body?.error?.code);
  }
  return body as T;
}
