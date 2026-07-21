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
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0a0b]/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60 supports-[backdrop-filter]:bg-white/75 dark:supports-[backdrop-filter]:bg-[#0a0a0b]/80">
      {/* Brand accent strip */}
      <div className="h-[2px] bg-gradient-to-r from-brand-500 via-brand-600 to-emerald-500" />
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
        {/* Logo + title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <TurnosIcon className="h-8 rounded-xl shrink-0 select-none" />
          {title !== 'Turnos' && (
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight truncate block leading-tight">
                {title}
              </span>
              {subtitle && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate block leading-tight">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1">
          {actions}
          <ReviewFormButton />
          <DarkModeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
