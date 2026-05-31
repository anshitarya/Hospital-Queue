'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { ProfileMenu } from './ProfileMenu';

/**
 * Shared dashboard header.
 *
 * The HQ logo is intentionally NON-interactive — clicking it does nothing.
 * Navigating away from a dashboard should go through the Profile menu
 * ("Log out") or the browser's back button, never through the logo.
 */
export function Header({ title = 'Hospital Queue', subtitle }: { title?: string; subtitle?: string | null }) {
  const { hydrate, loaded } = useAuth();

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3 gap-3">
        {/* Logo — plain div, no navigation, no hover effect */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm shadow-sm shrink-0">
            HQ
          </span>
          <span className="text-sm font-semibold tracking-tight truncate">
            {title}
            {subtitle && (
              <span className="ml-2 text-slate-400 font-normal">· {subtitle}</span>
            )}
          </span>
        </div>
        <ProfileMenu />
      </div>
    </header>
  );
}
