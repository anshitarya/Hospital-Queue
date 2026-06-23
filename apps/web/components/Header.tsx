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
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75 shadow-sm">
      {/* Green accent strip at top */}
      <div className="h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-700" />
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm shadow-sm shrink-0 select-none">
            HQ
          </span>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-800 tracking-tight truncate block leading-tight">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-slate-400 font-normal truncate block leading-tight">{subtitle}</span>
            )}
          </div>
        </div>
        <ProfileMenu />
      </div>
    </header>
  );
}
