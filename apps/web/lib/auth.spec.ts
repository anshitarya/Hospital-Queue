// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuth } from './auth';

/**
 * The auth store is just thin state around localStorage. These tests verify:
 *   - hydrate() reads from localStorage
 *   - setSession() writes to localStorage AND state
 *   - logout() clears both
 *   - Hydration is safe when localStorage is empty (no JSON parse crash)
 */

function resetStore() {
  useAuth.setState({ token: null, user: null, loaded: false });
}

beforeEach(() => {
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
  resetStore();
});

describe('useAuth store', () => {
  it('starts unhydrated with no user', () => {
    const s = useAuth.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
    expect(s.loaded).toBe(false);
  });

  it('hydrate() reads token + user from localStorage', () => {
    window.localStorage.setItem('hq_token', 'tok-1');
    window.localStorage.setItem(
      'hq_user',
      JSON.stringify({ id: 'u1', role: 'PATIENT', name: 'Alice' }),
    );

    useAuth.getState().hydrate();

    const s = useAuth.getState();
    expect(s.token).toBe('tok-1');
    expect(s.user?.name).toBe('Alice');
    expect(s.loaded).toBe(true);
  });

  it('hydrate() leaves user=null when localStorage is empty', () => {
    useAuth.getState().hydrate();
    const s = useAuth.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
    expect(s.loaded).toBe(true);
  });

  it('setSession() writes to localStorage and state', () => {
    useAuth.getState().setSession({
      token: 'NEW',
      user: { id: 'u2', role: 'DOCTOR', name: 'Bob' },
    });

    expect(window.localStorage.getItem('hq_token')).toBe('NEW');
    const stored = JSON.parse(window.localStorage.getItem('hq_user') ?? 'null');
    expect(stored).toMatchObject({ id: 'u2', role: 'DOCTOR' });

    const s = useAuth.getState();
    expect(s.token).toBe('NEW');
    expect(s.user?.role).toBe('DOCTOR');
    expect(s.loaded).toBe(true);
  });

  it('logout() clears localStorage and state', () => {
    useAuth.getState().setSession({
      token: 'tok',
      user: { id: 'u', role: 'PATIENT', name: 'A' },
    });
    useAuth.getState().logout();

    expect(window.localStorage.getItem('hq_token')).toBeNull();
    expect(window.localStorage.getItem('hq_user')).toBeNull();
    const s = useAuth.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
  });
});
