'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Tab-state hook that round-trips the selection through the URL search param
 * `?tab=...`. Replaces a plain `useState('overview')` so:
 *
 *   - Reloading the page keeps you on the same tab.
 *   - Browser back / forward navigates between tabs.
 *   - The URL is shareable — "look at the Overview tab" is a copyable link.
 *
 * Design choices:
 *   - We use `router.replace()` (not `push`) so each tab click doesn't pollute
 *     the history stack — back arrow should leave the dashboard, not cycle
 *     through tabs.
 *   - We omit `?tab=` from the URL when the default tab is active. Keeps the
 *     normal landing URL clean (no `/admin?tab=manage` if "manage" is default).
 *   - Invalid tab values in the URL are ignored — we fall back to the default
 *     and normalise the URL so the bad value doesn't linger.
 *
 * @param defaultTab  The fallback when the URL has no (or invalid) `?tab=`.
 * @param valid       The full set of allowed tab names. Acts as a runtime
 *                    guard against typos / stale URLs.
 */
export function useTabState<T extends string>(
  defaultTab: T,
  valid: readonly T[],
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Compute the initial tab from the URL exactly once on mount. After that the
  // component is the source of truth; we sync the URL back FROM state in the
  // effect below.
  const fromUrl = searchParams?.get('tab') ?? null;
  const initial: T =
    fromUrl && (valid as readonly string[]).includes(fromUrl) ? (fromUrl as T) : defaultTab;
  const [tab, setTabState] = useState<T>(initial);

  useEffect(() => {
    // Sync URL to match the current tab. Skip if it's already correct so we
    // don't generate redundant history entries.
    const current = searchParams?.get('tab') ?? null;
    const desired = tab === defaultTab ? null : tab;
    if (current === desired) return;

    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (desired) params.set('tab', desired);
    else params.delete('tab');

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, defaultTab, pathname, router, searchParams]);

  // Stable setter — useful if callers pass it into deep child components as a
  // dependency.
  const setTab = useCallback((next: T) => setTabState(next), []);

  return [tab, setTab];
}
