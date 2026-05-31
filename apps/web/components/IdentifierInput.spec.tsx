import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentifierInput } from './IdentifierInput';

function Controlled({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <IdentifierInput value={v} onChange={setV} />;
}

describe('<IdentifierInput />', () => {
  it('renders the default label', () => {
    render(<Controlled />);
    expect(screen.getByText('Email or mobile')).toBeInTheDocument();
  });

  it('renders the neutral hint when empty', () => {
    render(<Controlled />);
    expect(screen.getByText(/registered email or 10-digit Indian mobile/i)).toBeInTheDocument();
  });

  it('hides the +91 badge in neutral / email mode', () => {
    render(<Controlled />);
    expect(screen.queryByText('+91')).not.toBeInTheDocument();
  });

  it('shows the +91 badge once the user types digits only', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), '98');
    expect(screen.getByText('+91')).toBeInTheDocument();
  });

  it('keeps the +91 badge hidden as soon as @ is typed', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), 'a@b');
    expect(screen.queryByText('+91')).not.toBeInTheDocument();
  });

  it('shows phone validation feedback for a 10-digit number', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), '9876543210');
    expect(screen.getByText(/Valid Indian mobile/)).toBeInTheDocument();
  });

  it('shows phone error when prefix is wrong in phone mode', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), '5876543210');
    expect(screen.getByText(/6, 7, 8, or 9/)).toBeInTheDocument();
  });

  it('does NOT show phone errors when the user is typing an email', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole('textbox'), 'foo@bar.com');
    expect(screen.queryByText(/Valid Indian mobile/)).not.toBeInTheDocument();
    expect(screen.queryByText(/10 digits/i)).not.toBeInTheDocument();
  });

  it('caps digit-only input at 10 characters', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '98765432101234');
    expect(input.value).toBe('9876543210');
  });

  it('strips a leading "91" country code from a 12-digit paste', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    input.focus();
    await user.paste('919438946367');
    expect(input.value).toBe('9438946367');
  });
});
