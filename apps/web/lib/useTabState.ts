'use client';

import { useCallback, useEffect, useState } from 'react';

export function useTabState<T extends string>(
  defaultTab: T,
  valid: readonly T[],
): [T, (next: T) => void] {
  const [tab, setTabState] = useState<T>(defaultTab);
  const [mounted, setMounted] = useState(false);

  // On mount, read the current URL once to initialise tab.
  useEffect(() => {
    setMounted(true);
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (fromUrl && (valid as readonly string[]).includes(fromUrl)) {
      setTabState(fromUrl as T);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL whenever tab changes (after mount).
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(window.location.search);
    if (tab === defaultTab) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [tab, defaultTab, mounted]);

  const setTab = useCallback((next: T) => setTabState(next), []);
  return [tab, setTab];
}
