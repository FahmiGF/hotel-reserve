const TOKEN_KEY = 'hotelReserveToken';
const USER_KEY = 'hotelReserveUser';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export const session = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: readUser(),
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function setSession({ token, user }) {
  session.token = token;
  session.user = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateUser(user) {
  session.user = user;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  session.token = '';
  session.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && session.token) headers.authorization = `Bearer ${session.token}`;

  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Tidak dapat menghubungi server. Periksa koneksi Anda.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && auth && session.token) {
      clearSession();
      window.dispatchEvent(new CustomEvent('hr:unauthorized'));
    }
    throw new ApiError(data.error || 'Terjadi kesalahan. Coba lagi.', response.status, data);
  }
  return data;
}

export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

let metaCache = null;
export function getMeta() {
  if (!metaCache) {
    metaCache = api('/meta').catch((error) => {
      metaCache = null;
      throw error;
    });
  }
  return metaCache;
}

export function refreshMe() {
  return api('/auth/me').then((data) => {
    updateUser(data.user);
    window.dispatchEvent(new CustomEvent('hr:session', { detail: data }));
    return data;
  });
}

export function requireLogin() {
  if (session.user && session.token) return true;
  return false;
}

export const role = () => session.user?.role ?? 'guest';
export const isStaff = () => ['partner', 'staff', 'admin'].includes(role());
