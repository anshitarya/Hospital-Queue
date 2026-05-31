import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput } from './PhoneInput';
import type { PhoneValidationResult } from '@/lib/phone';

/**
 * Tiny wrapper so we can drive the controlled component from tests.
 */
function Controlled({
  onResult,
  initial = '',
}: {
  onResult?: (r: PhoneValidationResult) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput
      value={value}
      onChange={(raw, result) => {
        setValue(raw);
        onResult?.(result);
      }}
    />
  );
}

describe('<PhoneInput />', () => {
  it('renders the +91 prefix badge', () => {
    render(<Controlled />);
    expect(screen.getByText('+91')).toBeInTheDocument();
  });

  it('renders the default label', () => {
    render(<Controlled />);
    expect(screen.getByText('Mobile number')).toBeInTheDocument();
  });

  it('renders without a label when label={null}', () => {
    render(
      <PhoneInput label={null} value="" onChange={() => undefined} />,
    );
    expect(screen.queryByText('Mobile number')).not.toBeInTheDocument();
  });

  it('strips non-digits from user input', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn<[PhoneValidationResult]>();
    render(<Controlled onResult={onResult} />);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '98a76-543b210');

    expect(input.value).toBe('9876543210');
  });

  it('caps input at 10 digits', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '98765432109999');
    expect(input.value).toBe('9876543210');
  });

  it('shows error message for invalid prefix', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '5876543210');
    expect(screen.getByText(/6, 7, 8, or 9/)).toBeInTheDocument();
  });

  it('shows ✓ success message for valid mobile', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), '9876543210');
    expect(screen.getByText(/Valid Indian mobile/)).toBeInTheDocument();
  });

  it('calls onChange with the validation result', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn<[PhoneValidationResult]>();
    render(<Controlled onResult={onResult} />);

    await user.type(screen.getByRole('textbox'), '9876543210');

    // Last call should be the fully valid 10-digit form
    const lastCall = onResult.mock.calls.at(-1)?.[0];
    expect(lastCall?.ok).toBe(true);
    expect(lastCall?.e164).toBe('+919876543210');
  });

  it('passes `required` through to the underlying input', () => {
    render(<PhoneInput value="" onChange={() => undefined} required />);
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  it('shows no feedback when value is empty', () => {
    render(<Controlled />);
    expect(screen.queryByText(/Valid Indian mobile/)).not.toBeInTheDocument();
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
  });

  /**
   * Paste behaviour — the user often copies a number from an email or
   * messaging app that still has the country code attached. We strip "91"
   * if and only if the cleaned digits are exactly 12 and start with "91",
   * otherwise a legitimate 10-digit number starting with 91 (rare but
   * possible) would be incorrectly modified.
   */
  describe('country-code paste handling', () => {
    it.each([
      ['919438946367', '9438946367'],
      ['+919876543210', '9876543210'],
      ['91 98765 43210', '9876543210'],
      ['+91-9876-543-210', '9876543210'],
    ])('paste %j → input becomes %j', async (pasted, expected) => {
      const user = userEvent.setup();
      render(<Controlled />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      // userEvent.paste is the closest analogue to real clipboard paste —
      // it fires the same change events as typing the whole string at once.
      input.focus();
      await user.paste(pasted);
      expect(input.value).toBe(expected);
    });

    it('does NOT strip "91" from a typed 10-digit number starting with 91', async () => {
      // 9143894636 starts with "91" but is only 10 digits — should pass through.
      const user = userEvent.setup();
      render(<Controlled />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.type(input, '9143894636');
      expect(input.value).toBe('9143894636');
    });

    it('still caps at 10 when a 13-digit number is pasted', async () => {
      const user = userEvent.setup();
      render(<Controlled />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      input.focus();
      await user.paste('9194389463671');
      // 13 digits doesn't match the 12-digit-91 rule → fall back to slice(0,10).
      expect(input.value).toBe('9194389463');
    });

    /**
     * Regression test for the maxLength=10 bug.
     *
     * Before the fix, the input had `maxLength={10}` which made the browser
     * truncate the paste BEFORE our onChange could run. That meant pasting
     * "+919876543210" arrived as "+919876543" and we never saw the country
     * code. We assert here that the input has no maxLength attribute so the
     * country-code strip can do its job.
     */
    it('input has no HTML maxLength — JS handles the cap', () => {
      render(<Controlled />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      // jsdom reports unset maxLength as -1.
      expect(input.maxLength).toBe(-1);
    });
  });
});
