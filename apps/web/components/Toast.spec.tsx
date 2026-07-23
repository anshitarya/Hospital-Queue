import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from './Toast';

describe('<Toast />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when message is null', () => {
    const { container } = render(<Toast message={null} onDismiss={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the message text', () => {
    render(
      <Toast message={{ type: 'ok', msg: 'Saved!' }} onDismiss={() => undefined} />,
    );
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('shows icon for ok type', () => {
    render(
      <Toast message={{ type: 'ok', msg: 'good' }} onDismiss={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveClass('bg-emerald-950/95');
  });

  it('shows icon for err type', () => {
    render(
      <Toast message={{ type: 'err', msg: 'bad' }} onDismiss={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveClass('bg-rose-950/95');
  });

  it('auto-dismisses ok messages after duration', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        message={{ type: 'ok', msg: 'auto-bye' }}
        onDismiss={onDismiss}
        duration={1000}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the × button is clicked', async () => {
    // Need real timers for userEvent to work
    vi.useRealTimers();
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Toast message={{ type: 'err', msg: 'close me' }} onDismiss={onDismiss} />,
    );
    await user.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
