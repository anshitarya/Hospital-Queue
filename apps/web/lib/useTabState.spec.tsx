// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabState } from './useTabState';

function Probe({
  defaultTab,
  valid,
}: {
  defaultTab: 'overview' | 'manage';
  valid: readonly ('overview' | 'manage')[];
}) {
  const [tab, setTab] = useTabState(defaultTab, valid);
  return (
    <div>
      <span data-testid="tab">{tab}</span>
      <button onClick={() => setTab('overview')}>go-overview</button>
      <button onClick={() => setTab('manage')}>go-manage</button>
    </div>
  );
}

describe('useTabState', () => {
  let replaceStateSpy: any;

  beforeEach(() => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/admin') as any;
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default tab when ?tab= is absent', () => {
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('manage');
  });

  it('reads a valid tab from the URL on mount', () => {
    window.location = new URL('http://localhost:3000/admin?tab=overview') as any;
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('overview');
  });

  it('ignores an invalid tab value in the URL and falls back to default', () => {
    window.location = new URL('http://localhost:3000/admin?tab=bogus') as any;
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('manage');
  });

  it('updates the URL when the tab changes', async () => {
    const user = userEvent.setup();
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);

    await user.click(screen.getByText('go-overview'));
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('removes ?tab= from the URL when switching back to the default', async () => {
    window.location = new URL('http://localhost:3000/admin?tab=overview') as any;
    const user = userEvent.setup();
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);

    await user.click(screen.getByText('go-manage'));
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
