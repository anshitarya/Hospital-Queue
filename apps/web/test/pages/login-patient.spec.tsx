// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Customer login is a two-step form:
 *   step 1: phone number
 *   step 2: 4-digit Customer PIN → POST /auth/customer/login → /patient
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const loginCustomerMock = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    loginCustomer: (...args: unknown[]) => loginCustomerMock(...args),
  };
});

import PatientLoginPage from '@/app/login/patient/page';

beforeEach(() => {
  routerPush.mockReset();
  loginCustomerMock.mockReset();
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
});

describe('<PatientLoginPage />', () => {
  it('rejects invalid phone numbers — Continue button stays disabled', () => {
    render(<PatientLoginPage />);
    const btn = screen.getByRole('button', { name: /continue/i });
    expect(btn).toBeDisabled();
  });

  it('enables Continue only when phone is valid', async () => {
    const user = userEvent.setup();
    render(<PatientLoginPage />);
    const input = screen.getByLabelText(/mobile number/i);

    await user.type(input, '5876543210');
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    await user.clear(input);
    await user.type(input, '9876543210');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('advances to PIN step after valid phone', async () => {
    const user = userEvent.setup();
    render(<PatientLoginPage />);

    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter your customer pin/i)).toBeInTheDocument();
    });
  });

  it('logs in with PIN and redirects to /patient on success', async () => {
    loginCustomerMock.mockResolvedValueOnce({
      token: 't',
      user: { id: 'p1', role: 'PATIENT', name: 'Patient 3210' },
    });

    const user = userEvent.setup();
    render(<PatientLoginPage />);

    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await screen.findByText(/enter your customer pin/i);

    // Enter PIN via numpad buttons
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '5' }));

    await waitFor(() => {
      expect(loginCustomerMock).toHaveBeenCalledWith('+919876543210', '4315');
      expect(routerPush).toHaveBeenCalledWith('/patient');
    });
  });

  it('shows error message if login fails', async () => {
    const { ApiError } = await import('@/lib/api');
    loginCustomerMock.mockRejectedValueOnce(new ApiError(401, 'Incorrect PIN. 4 attempts remaining.'));

    const user = userEvent.setup();
    render(<PatientLoginPage />);

    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/enter your customer pin/i);

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));

    expect(await screen.findByText('Incorrect PIN. 4 attempts remaining.')).toBeInTheDocument();
  });

  it('"Use a different number" goes back to step 1', async () => {
    const user = userEvent.setup();
    render(<PatientLoginPage />);
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/enter your customer pin/i);

    await user.click(screen.getByRole('button', { name: /different number/i }));
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });
});
