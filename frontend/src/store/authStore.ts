import { create } from 'zustand';
import type { PlayerAvatar } from '../shared/types';

export interface AuthUser {
  id: string;
  login: string;
  name: string;
  avatar?: PlayerAvatar;
}

interface AuthState {
  jwt: string | null;
  user: AuthUser | null;
  initializing: boolean;
  busy: boolean;
  error: string | null;
}

const TOKEN_STORAGE_KEY = 'tte_jwt_token';

function getStoredToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export const useAuthStore = create<AuthState>(() => ({
  jwt: getStoredToken(),
  user: null,
  initializing: !!getStoredToken(),
  busy: false,
  error: null,
}));

export async function verifyStoredSession(): Promise<void> {
  const token = useAuthStore.getState().jwt;
  if (!token) {
    useAuthStore.setState({ initializing: false, user: null });
    return;
  }
  useAuthStore.setState({ initializing: true, error: null });
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStoredToken(null);
      useAuthStore.setState({ jwt: null, user: null, initializing: false });
      return;
    }
    const user = (await res.json()) as AuthUser;
    useAuthStore.setState({ user, initializing: false });
  } catch {
    useAuthStore.setState({ initializing: false });
  }
}

export async function loginWithPassword(login: string, password: string): Promise<boolean> {
  useAuthStore.setState({ busy: true, error: null });
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) {
      useAuthStore.setState({
        busy: false,
        error: data?.message || 'Неверный логин или пароль.',
      });
      return false;
    }
    setStoredToken(data.token);
    useAuthStore.setState({ jwt: data.token, user: data.user, busy: false, error: null });
    return true;
  } catch {
    useAuthStore.setState({ busy: false, error: 'Не удалось связаться с сервером авторизации.' });
    return false;
  }
}

export async function registerAccount(login: string, password: string, name: string, avatar?: PlayerAvatar): Promise<boolean> {
  useAuthStore.setState({ busy: true, error: null });
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password, name, avatar }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) {
      useAuthStore.setState({
        busy: false,
        error: data?.message || 'Не удалось зарегистрировать пользователя.',
      });
      return false;
    }
    setStoredToken(data.token);
    useAuthStore.setState({ jwt: data.token, user: data.user, busy: false, error: null });
    return true;
  } catch {
    useAuthStore.setState({ busy: false, error: 'Не удалось связаться с сервером авторизации.' });
    return false;
  }
}

export async function updateAvatar(avatar: PlayerAvatar): Promise<boolean> {
  const token = useAuthStore.getState().jwt;
  if (!token) return false;
  try {
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(avatar),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; avatar: PlayerAvatar };
    useAuthStore.setState(s => ({
      user: s.user ? { ...s.user, avatar: data.avatar ?? avatar } : null,
    }));
    return true;
  } catch {
    return false;
  }
}

export function logoutAccount() {
  setStoredToken(null);
  useAuthStore.setState({ jwt: null, user: null, busy: false, error: null, initializing: false });
}
