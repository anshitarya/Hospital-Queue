// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Patient login is a two-step form:
 *   step 1: phone number → POST /auth/otp/request
 *   step 2: 6-digit code → POST /auth/otp/verify → /patient
 *
 * We mock both endpoints and drive the entire flow end-to-end.
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const requestOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    requestOtp: (...args: unknown[]) => requestOtpMock(...args),
    verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
  };
});

import PatientLoginPage from '@/app/login/patient/page';

beforeEach(() => {
  routerPush.mockReset();
  requestOtpMock.mockReset();
  verifyOtpMock.mockReset();
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
});

describe('<PatientLoginPage />', () => {
  it('rejects invalid phone numbers — Send OTP button stays disabled', () => {
    render(<PatientLoginPage />);
    const btn = screen.getByRole('button', { name: /send otp/i });
    expect(btn).toBeDisabled();
  });

  it('enables Send OTP only when phone is valid', async () => {
    const user = userEvent.setup();
    render(<PatientLoginPage />);
    const input = screen.getByLabelText(/mobile number/i);

    // Type invalid number → button stays disabled
    await user.type(input, '5876543210');
    expect(screen.getByRole('button', { name: /send otp/i })).toBeDisabled();

    // Clear and type a valid one
    await user.clear(input);
    await user.type(input, '9876543210');
    expect(screen.getByRole('button', { name: /send otp/i })).toBeEnabled();
  });

  it('sends OTP to canonical +91 form and advances to the code step', async () => {
    requestOtpMock.mockResolvedValueOnce({ devCode: '123456' });
    const user = userEvent.setup();
    render(<PatientLoginPage />);

    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(requestOtpMock).toHaveBeenCalledWith('+919876543210');
      // Step 2 panel renders the OTP field
      expect(screen.getByLabelText(/^otp$/i)).toBeInTheDocument();
    });
  });

  it('verifies OTP and redirects to /patient on success', async () => {
    requestOtpMock.mockResolvedValueOnce({ devCode: '654321' });
    verifyOtpMock.mockResolvedValueOnce({
      token: 't',
      user: { id: 'p1', role: 'PATIENT', name: 'Patient 3210' },
    });

    const user = userEvent.setup();
    render(<PatientLoginPage />);

    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    const otpField = await screen.findByLabelText(/^otp$/i);
    await user.type(otpField, '654321');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith('+919876543210', '654321', undefined);
      expect(routerPush).toHaveBeenCalledWith('/patient');
    });
  });

  it('shows error message if OTP request fails', async () => {
    const { ApiError } = await import('@/lib/api');
    requestOtpMock.mockRejectedValueOnce(new ApiError(429, 'Too many OTP requests'));

    const user = userEvent.setup();
    render(<PatientLoginPage />);
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    expect(await screen.findByText('Too many OTP requests')).toBeInTheDocument();
  });

  it('"Use a different number" goes back to step 1', async () => {
    requestOtpMock.mockResolvedValueOnce({ devCode: '111111' });
    const user = userEvent.setup();
    render(<PatientLoginPage />);
    await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));
    await screen.findByLabelText(/^otp$/i);

    await user.click(screen.getByRole('button', { name: /different number/i }));
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });
});
