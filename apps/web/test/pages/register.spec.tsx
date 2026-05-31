// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Receptionist self-registration page. Validates that:
 *   - The submit button is gated until every required field is valid
 *     (invite code length, name length, phone validity, password strength,
 *      password confirmation match).
 *   - Submission sends the canonical phone (+91…) to the API.
 *   - Successful registration redirects to /reception.
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const registerMock = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    registerReceptionist: (...args: unknown[]) => registerMock(...args),
  };
});

import RegisterPage from '@/app/register/page';

beforeEach(() => {
  routerPush.mockReset();
  registerMock.mockReset();
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
});

describe('<RegisterPage />', () => {
  it('keeps submit disabled until ALL fields are valid', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const submit = screen.getByRole('button', { name: /create account/i });
    expect(submit).toBeDisabled();

    // Fill everything except confirm — still disabled
    await user.type(screen.getByLabelText(/invite code/i), 'ABCD-EFGH');
    await user.type(screen.getByLabelText(/your name/i), 'Alice');
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.type(screen.getByLabelText(/^password$/i), 'goodpass1');
    expect(submit).toBeDisabled();

    // Confirm matches → enabled
    await user.type(screen.getByLabelText(/confirm password/i), 'goodpass1');
    expect(submit).toBeEnabled();
  });

  it('shows mismatch message when passwords differ', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByLabelText(/^password$/i), 'goodpass1');
    await user.type(screen.getByLabelText(/confirm password/i), 'different1');
    expect(screen.getByText(/passwords don/i)).toBeInTheDocument();
  });

  it('keeps submit disabled when password is weak (no digit)', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByLabelText(/invite code/i), 'ABCD-EFGH');
    await user.type(screen.getByLabelText(/your name/i), 'Alice');
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.type(screen.getByLabelText(/^password$/i), 'allletters');
    await user.type(screen.getByLabelText(/confirm password/i), 'allletters');

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('submits with canonical +91 phone and redirects to /reception', async () => {
    registerMock.mockResolvedValueOnce({
      token: 't',
      user: { id: 'u', role: 'RECEPTIONIST', name: 'Alice' },
    });

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/invite code/i), 'ABCD-EFGH');
    await user.type(screen.getByLabelText(/your name/i), 'Alice');
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.type(screen.getByLabelText(/^password$/i), 'goodpass1');
    await user.type(screen.getByLabelText(/confirm password/i), 'goodpass1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        inviteCode: 'ABCD-EFGH',
        name: 'Alice',
        phone: '+919876543210',
        password: 'goodpass1',
      });
      expect(routerPush).toHaveBeenCalledWith('/reception');
    });
  });

  it('surfaces server-side error', async () => {
    const { ApiError } = await import('@/lib/api');
    registerMock.mockRejectedValueOnce(new ApiError(400, 'Invite code already used'));

    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByLabelText(/invite code/i), 'ABCD-EFGH');
    await user.type(screen.getByLabelText(/your name/i), 'Alice');
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.type(screen.getByLabelText(/^password$/i), 'goodpass1');
    await user.type(screen.getByLabelText(/confirm password/i), 'goodpass1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Invite code already used')).toBeInTheDocument();
  });
});
