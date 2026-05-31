import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoctorStatusPill, EntryStatusPill, LiveIndicator } from './StatusPill';

describe('<EntryStatusPill />', () => {
  it.each([
    ['WAITING', 'WAITING'],
    ['IN_CONSULTATION', 'IN CONSULTATION'], // underscore → space
    ['COMPLETED', 'COMPLETED'],
    ['SKIPPED', 'SKIPPED'],
    ['CANCELLED', 'CANCELLED'],
  ] as const)('renders %j status as %j', (status, displayed) => {
    render(<EntryStatusPill status={status} />);
    expect(screen.getByText(displayed)).toBeInTheDocument();
  });
});

describe('<DoctorStatusPill />', () => {
  it.each(['AVAILABLE', 'BUSY', 'PAUSED', 'AWAY'] as const)(
    'renders %j status',
    (status) => {
      render(<DoctorStatusPill status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );
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
