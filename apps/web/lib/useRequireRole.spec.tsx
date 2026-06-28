// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useRequireRole } from './useRequireRole';
import { useAuth } from './auth';

/**
 * Page-guard hook test. We mock `useRouter` so we can assert which path the
 * guard redirects to. The store is reset between tests so we can simulate:
 *   - unauthenticated  → /login (or /login/patient for patient-only routes)
 *   - wrong role       → /<role's home>
 *   - right role       → ready: true, no redirect
 */

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

function Probe({ allowed }: { allowed: Parameters<typeof useRequireRole>[0] }) {
  const { ready, user } = useRequireRole(allowed);
  return (
    <div>
      <span data-testid="ready">{ready ? 'yes' : 'no'}</span>
      <span data-testid="user">{user?.role ?? '-'}</span>
    </div>
  );
}

beforeEach(() => {
  routerReplace.mockReset();
  useAuth.setState({ user: null, loaded: false });
  window.localStorage.removeItem('hq_user');
});

afterEach(() => {
  useAuth.setState({ user: null, loaded: false });
});

describe('useRequireRole', () => {
  it('redirects unauthenticated users to /login for staff routes', async () => {
    render(<Probe allowed={['ADMIN']} />);
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('redirects unauthenticated users to /login/patient for patient-only route', async () => {
    render(<Probe allowed={['PATIENT']} />);
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/login/patient');
    });
  });

  it('redirects wrong-role authenticated user to their home', async () => {
    window.localStorage.setItem(
      'hq_user',
      JSON.stringify({ id: 'u', role: 'DOCTOR', name: 'Dr' }),
    );

    render(<Probe allowed={['ADMIN']} />);
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/doctor');
    });
  });

  it('does not redirect when role matches', async () => {
    window.localStorage.setItem(
      'hq_user',
      JSON.stringify({ id: 'u', role: 'DOCTOR', name: 'Dr' }),
    );

    const { getByTestId } = render(<Probe allowed={['DOCTOR']} />);
    await waitFor(() => {
      expect(getByTestId('ready').textContent).toBe('yes');
    });
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('returns ready=false until hydration completes', () => {
    const { getByTestId } = render(<Probe allowed={['DOCTOR']} />);
    expect(getByTestId('ready').textContent).toBe('no');
  });
});
