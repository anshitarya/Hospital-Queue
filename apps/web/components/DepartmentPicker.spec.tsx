import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentPicker, type DepartmentOption } from './DepartmentPicker';

const OPTIONS: DepartmentOption[] = [
  { id: '3', name: 'Cardiology' },
  { id: '1', name: 'Allergy & Immunology' },
  { id: '2', name: 'Pediatrics' },
  { id: '4', name: 'Vascular Surgery' },
];

describe('<DepartmentPicker />', () => {
  it('renders placeholder when nothing selected', () => {
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    expect(screen.getByText('Select department')).toBeInTheDocument();
  });

  it('renders the selected option name', () => {
    render(<DepartmentPicker options={OPTIONS} value="3" onChange={() => undefined} />);
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
  });

  it('opens on click and lists options alphabetically', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole('button'));

    const listbox = await screen.findByRole('listbox');
    const items = within(listbox).getAllByRole('option').map((li) => li.textContent);

    expect(items).toEqual([
      'Allergy & Immunology',
      'Cardiology',
      'Pediatrics',
      'Vascular Surgery',
    ]);
  });

  it('filters options by substring (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search department…');
    await user.type(searchInput, 'card');

    const items = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Cardiology');
  });

  it('shows empty-state when no options match the query', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search department…'), 'zzz');
    expect(screen.getByText(/No match/i)).toBeInTheDocument();
  });

  it('calls onChange with the option id when an item is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Pediatrics'));
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('selects highlighted item with Enter key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={onChange} />);
    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search department…');
    // First option (after alphabetical sort) is Allergy & Immunology, idx 0
    await user.type(searchInput, '{ArrowDown}');  // idx → 1 (Cardiology)
    await user.type(searchInput, '{Enter}');
    expect(onChange).toHaveBeenCalledWith('3'); // Cardiology
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the count footer reflecting the filter', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker options={OPTIONS} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/4 of 4/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search department…'), 'c');
    expect(screen.getByText(/3 of 4/)).toBeInTheDocument();
  });
});
