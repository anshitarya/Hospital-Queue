// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Page-level test for /login (staff login). Mocks the api helper so we can
 * assert that:
 *   - the right backend endpoint is called with the user-entered values
 *   - on success, the session is persisted and the user is redirected
 *     according to their role (DOCTOR → /doctor, ADMIN → /admin, else /reception)
 *   - on failure, the error message is rendered
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const staffLoginMock = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    staffLogin: (...args: unknown[]) => staffLoginMock(...args),
    // Always return dev auth enabled so the password form renders in tests
    getAuthStatus: () => Promise.resolve({ googleAuthEnabled: false, devAuthEnabled: true, authMode: 'development' }),
  };
});

import StaffLoginPage from '@/app/login/page';

beforeEach(() => {
  routerPush.mockReset();
  staffLoginMock.mockReset();
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
});

describe('<StaffLoginPage />', () => {
  it('calls staffLogin with email + password and redirects DOCTOR to /doctor', async () => {
    staffLoginMock.mockResolvedValueOnce({
      token: 't1',
      user: { id: 'u1', role: 'DOCTOR', name: 'Dr A' },
    });

    const user = userEvent.setup();
    render(<StaffLoginPage />);

    // findByLabelText waits for the form to appear (after getAuthStatus resolves)
    await user.type(await screen.findByLabelText(/login id/i), 'doc@x.com');
    await user.type(await screen.findByLabelText(/^password$/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(staffLoginMock).toHaveBeenCalledWith('doc@x.com', 'hunter22');
      expect(routerPush).toHaveBeenCalledWith('/doctor');
    });
  });

  it('redirects ADMIN to /admin on success', async () => {
    staffLoginMock.mockResolvedValueOnce({
      token: 't',
      user: { id: 'u', role: 'ADMIN', name: 'A' },
    });
    const user = userEvent.setup();
    render(<StaffLoginPage />);
    await user.type(await screen.findByLabelText(/login id/i), 'admin@x.com');
    await user.type(await screen.findByLabelText(/^password$/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/admin');
    });
  });

  it('redirects RECEPTIONIST to /reception on success', async () => {
    staffLoginMock.mockResolvedValueOnce({
      token: 't',
      user: { id: 'u', role: 'RECEPTIONIST', name: 'R' },
    });
    const user = userEvent.setup();
    render(<StaffLoginPage />);
    await user.type(await screen.findByLabelText(/login id/i), 'r@x.com');
    await user.type(await screen.findByLabelText(/^password$/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/reception');
    });
  });

  it('renders backend error message on failed login', async () => {
    const { ApiError } = await import('@/lib/api');
    staffLoginMock.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));

    const user = userEvent.setup();
    render(<StaffLoginPage />);
    await user.type(await screen.findByLabelText(/login id/i), 'doc@x.com');
    await user.type(await screen.findByLabelText(/^password$/i), 'wrong'.repeat(2));
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in-flight', async () => {
    let resolve: (v: unknown) => void;
    staffLoginMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    const user = userEvent.setup();
    render(<StaffLoginPage />);
    await user.type(await screen.findByLabelText(/login id/i), 'doc@x.com');
    await user.type(await screen.findByLabelText(/^password$/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolve!({ token: 't', user: { id: 'u', role: 'DOCTOR', name: 'X' } });
  });
});
