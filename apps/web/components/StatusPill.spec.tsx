import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoctorStatusPill, EntryStatusPill, LiveIndicator } from './StatusPill';

describe('<EntryStatusPill />', () => {
  it.each([
    ['WAITING', 'Waiting'],
    ['IN_CONSULTATION', 'In consultation'],
    ['COMPLETED', 'Completed'],
    ['SKIPPED', 'Skipped'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('renders %j status as %j', (status, displayed) => {
    render(<EntryStatusPill status={status} />);
    expect(screen.getByText(displayed)).toBeInTheDocument();
  });
});

describe('<DoctorStatusPill />', () => {
  it.each([
    ['AVAILABLE', 'Available'],
    ['BUSY', 'Busy'],
    ['PAUSED', 'Paused'],
    ['AWAY', 'Away'],
  ] as const)('renders %j status', (status, expectedText) => {
    render(<DoctorStatusPill status={status} />);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});

describe('<LiveIndicator />', () => {
  it('shows "Live" when connected', () => {
    render(<LiveIndicator connected />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows "Offline" when not connected', () => {
    render(<LiveIndicator connected={false} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('uses the custom label if provided', () => {
    render(<LiveIndicator connected label="Connecting…" />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });
});
