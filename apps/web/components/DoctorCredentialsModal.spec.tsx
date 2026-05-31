// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DoctorCredentialsModal } from './DoctorCredentialsModal';

/**
 * The modal is the ONLY UI surface where the temp password is shown. These
 * tests assert that it stays visible, surfaces the right values, and doesn't
 * close on accident.
 */

const writeText = vi.fn<[string], Promise<void>>(() => Promise.resolve());
beforeEach(() => {
  writeText.mockClear();
  // jsdom doesn't ship a real clipboard. Install our spy at the prototype
  // level — `configurable: true` so we can re-define between tests. We
  // re-assign on every test in case a previous test mutated the object.
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('<DoctorCredentialsModal />', () => {
  it('renders nothing when credentials is null', () => {
    const { container } = render(
      <DoctorCredentialsModal credentials={null} onClose={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the doctor name, email, and temp password', () => {
    render(
      <DoctorCredentialsModal
        credentials={{
          name: 'Dr Alice',
          email: 'alice@x.com',
          phone: null,
          tempPassword: 'abc123def456',
          clinicName: 'Sunrise Clinic',
        }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByDisplayValue('Dr Alice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alice@x.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('abc123def456')).toBeInTheDocument();
    expect(screen.getByText(/Sunrise Clinic/)).toBeInTheDocument();
  });

  it('shows phone when email is absent', () => {
    render(
      <DoctorCredentialsModal
        credentials={{
          name: 'Dr Bob',
          email: null,
          phone: '+919876543210',
          tempPassword: 'pw',
        }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue('+919876543210')).toBeInTheDocument();
    expect(screen.queryByText('Login email')).not.toBeInTheDocument();
  });

  it('shows both email and phone when both are present', () => {
    render(
      <DoctorCredentialsModal
        credentials={{
          name: 'Dr C',
          email: 'c@x.com',
          phone: '+919876543210',
          tempPassword: 'pw',
        }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Login email')).toBeInTheDocument();
    expect(screen.getByText('Login mobile')).toBeInTheDocument();
  });

  it('hides the password by default (type=password) and reveals on click', async () => {
    const user = userEvent.setup();
    render(
      <DoctorCredentialsModal
        credentials={{ name: 'D', email: 'd@x.com', phone: null, tempPassword: 'pw123' }}
        onClose={() => undefined}
      />,
    );

    const pwInput = screen.getByDisplayValue('pw123') as HTMLInputElement;
    expect(pwInput.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /show/i }));
    expect(pwInput.type).toBe('text');
  });

  // Why fireEvent (not userEvent) for these two? userEvent.setup() v14 installs
  // its own navigator.clipboard mock that overrides ours, swallowing the calls
  // we actually want to assert against. fireEvent.click skips that machinery.
  it('copies the temp password to clipboard', async () => {
    render(
      <DoctorCredentialsModal
        credentials={{ name: 'D', email: 'd@x.com', phone: null, tempPassword: 'secret-pw' }}
        onClose={() => undefined}
      />,
    );

    // There are multiple Copy buttons (one per field). The last one is the
    // password row.
    const buttons = screen.getAllByRole('button', { name: /^copy$/i });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(writeText).toHaveBeenCalledWith('secret-pw');
  });

  it('"Copy everything" puts a multi-line summary in clipboard', () => {
    render(
      <DoctorCredentialsModal
        credentials={{
          name: 'Dr Alice',
          email: 'alice@x.com',
          phone: '+919876543210',
          tempPassword: 'pw',
          clinicName: 'C',
        }}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy everything/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain('Dr Alice');
    expect(arg).toContain('alice@x.com');
    expect(arg).toContain('+919876543210');
    expect(arg).toContain('pw');
    expect(arg).toContain('C');
  });

  it('calls onClose only when the user explicitly confirms', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DoctorCredentialsModal
        credentials={{ name: 'D', email: 'd@x.com', phone: null, tempPassword: 'pw' }}
        onClose={onClose}
      />,
    );

    // Show/hide and Copy actions should NOT close the modal.
    await user.click(screen.getByRole('button', { name: /show/i }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /i've saved these/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes role=dialog with aria-modal=true', () => {
    render(
      <DoctorCredentialsModal
        credentials={{ name: 'D', email: 'd@x.com', phone: null, tempPassword: 'pw' }}
        onClose={() => undefined}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
