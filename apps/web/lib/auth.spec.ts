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
  useAuth.setState({ user: null, loaded: false });
}

beforeEach(() => {
  window.localStorage.removeItem('hq_user');
  resetStore();
});

describe('useAuth store', () => {
  it('starts unhydrated with no user', () => {
    const s = useAuth.getState();
    expect(s.user).toBeNull();
    expect(s.loaded).toBe(false);
  });

  it('hydrate() reads user from localStorage', () => {
    window.localStorage.setItem(
      'hq_user',
      JSON.stringify({ id: 'u1', role: 'PATIENT', name: 'Alice' }),
    );

    useAuth.getState().hydrate();

    const s = useAuth.getState();
    expect(s.user?.name).toBe('Alice');
    expect(s.loaded).toBe(true);
  });

  it('hydrate() leaves user=null when localStorage is empty', () => {
    useAuth.getState().hydrate();
    const s = useAuth.getState();
    expect(s.user).toBeNull();
    expect(s.loaded).toBe(true);
  });

  it('setSession() writes user to localStorage and state', () => {
    useAuth.getState().setSession({
      token: 'NEW',
      user: { id: 'u2', role: 'DOCTOR', name: 'Bob' },
    });

    const stored = JSON.parse(window.localStorage.getItem('hq_user') ?? 'null');
    expect(stored).toMatchObject({ id: 'u2', role: 'DOCTOR' });

    const s = useAuth.getState();
    expect(s.user?.role).toBe('DOCTOR');
    expect(s.loaded).toBe(true);
  });

  it('logout() clears localStorage and state', async () => {
    useAuth.getState().setSession({
      token: 'tok',
      user: { id: 'u', role: 'PATIENT', name: 'A' },
    });
    // logout is async but resolves quickly (api call throws, we ignore)
    await useAuth.getState().logout().catch(() => {});

    expect(window.localStorage.getItem('hq_user')).toBeNull();
    const s = useAuth.getState();
    expect(s.user).toBeNull();
  });
});
