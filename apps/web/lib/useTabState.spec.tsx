// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabState } from './useTabState';

/**
 * The hook integrates with next/navigation, so we mock the three primitives
 * it touches: useRouter, usePathname, useSearchParams. The mock keeps a
 * mutable search-string in module scope so we can simulate URL changes
 * round-trip — exactly what the hook needs to do its job.
 */

let mockSearch = '';
let mockPathname = '/admin';
const replaceSpy = vi.fn<[string, unknown?], void>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string, opts?: unknown) => {
      replaceSpy(url, opts);
      // Persist the new URL into our mock state so the next render of
      // useSearchParams reflects it. Strip the leading "/admin?" prefix.
      const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      mockSearch = q;
    },
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

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

beforeEach(() => {
  mockSearch = '';
  mockPathname = '/admin';
  replaceSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useTabState', () => {
  it('falls back to the default tab when ?tab= is absent', () => {
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('manage');
  });

  it('reads a valid tab from the URL on mount', () => {
    mockSearch = 'tab=overview';
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('overview');
  });

  it('ignores an invalid tab value in the URL and falls back to default', () => {
    mockSearch = 'tab=bogus';
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(screen.getByTestId('tab').textContent).toBe('manage');
  });

  it('updates the URL when the tab changes', async () => {
    const user = userEvent.setup();
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);

    await user.click(screen.getByText('go-overview'));
    // The hook should have called router.replace with ?tab=overview
    expect(replaceSpy).toHaveBeenCalled();
    const url = replaceSpy.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('tab=overview');
  });

  it('removes ?tab= from the URL when switching back to the default', async () => {
    mockSearch = 'tab=overview';
    const user = userEvent.setup();
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);

    await user.click(screen.getByText('go-manage'));
    const url = replaceSpy.mock.calls.at(-1)?.[0] as string;
    // Either no query string, or one without `tab=`.
    expect(url).not.toContain('tab=');
  });

  it('passes scroll:false to router.replace so the page does not jump', async () => {
    const user = userEvent.setup();
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    await user.click(screen.getByText('go-overview'));

    const opts = replaceSpy.mock.calls.at(-1)?.[1] as { scroll?: boolean } | undefined;
    expect(opts).toMatchObject({ scroll: false });
  });

  it('skips redundant URL updates when state already matches', () => {
    // URL already says overview, mount with overview as initial — useEffect
    // runs once but should NOT call replace because current matches desired.
    mockSearch = 'tab=overview';
    render(<Probe defaultTab="manage" valid={['overview', 'manage']} />);
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
