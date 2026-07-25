'use client';
import React, { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { ProfileMenu } from './ProfileMenu';
import { DarkModeToggle } from './DarkModeToggle';
import { ReviewFormButton } from './ReviewFormButton';
import { TurnosIcon } from '@/components/Icons';

/**
 * Shared dashboard header.
 *
 * The Turnos logo is intentionally NON-interactive — clicking it does nothing.
 * Navigating away from a dashboard should go through the Profile menu
 * ("Log out") or the browser's back button, never through the logo.
 */
export function Header({ title = 'Turnos', subtitle, actions }: { title?: string; subtitle?: string | null; actions?: React.ReactNode }) {
  const { hydrate, loaded } = useAuth();

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/70 backdrop-blur-2xl border-b border-white/10 shadow-glass">
      {/* Brand accent strip */}
      <div className="h-[2px] bg-gradient-to-r from-brand-500 via-emerald-400 to-purple-500" />
      <div className="mx-auto max-w-7xl flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2.5">
        {/* Logo + title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <TurnosIcon className="h-9 sm:h-11 shrink-0 select-none" />
          {title && title !== 'Turnos' && (
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-white tracking-tight truncate block leading-tight">
                {title}
              </span>
              {subtitle && (
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal truncate block leading-tight">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {actions}
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
