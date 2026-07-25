'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { Icon } from './Icons';

export function ProfileMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  if (!user) {
    return (
      <Link href="/login" className="btn-secondary text-sm">
        Sign in
      </Link>
    );
  }

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('') || 'U';

  const roleLabel =
    user.role === 'PATIENT' ? '—' :
    user.role === 'CLINIC_ADMIN' ? 'Business Admin' :
    user.role === 'MANAGER' ? 'Branch Manager' :
    user.role === 'RECEPTIONIST' ? 'Receptionist' :
    user.role === 'DOCTOR' ? 'Doctor' :
    user.role === 'ADMIN' ? 'Admin' :
    String(user.role);
  const roleColor =
    user.role === 'ADMIN' ? 'from-purple-500 to-purple-700' :
    user.role === 'DOCTOR' ? 'from-sky-500 to-sky-700' :
    user.role === 'RECEPTIONIST' || user.role === 'CLINIC_ADMIN' || user.role === 'MANAGER' ? 'from-emerald-500 to-emerald-700' :
    'from-slate-500 to-slate-700';

  const homePath =
    user.role === 'PATIENT' ? '/patient' :
    user.role === 'DOCTOR' ? '/doctor' :
    user.role === 'ADMIN' ? '/admin' :
    '/reception';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full p-0 sm:pl-1 sm:pr-3 sm:py-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group shrink-0"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`h-8 w-8 rounded-full bg-gradient-to-br ${roleColor} text-white font-semibold text-xs sm:text-sm flex items-center justify-center shadow-sm shrink-0`}>
          {initials}
        </span>
        <span className="hidden sm:block text-sm text-slate-700 dark:text-slate-200 font-medium">{user.name.split(' ')[0]}</span>
        <Icon.ChevronDown className={'hidden sm:block h-4 w-4 text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden animate-slide-up z-50"
        >
          {/* User info header */}
          <div className="p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700 dark:to-slate-700/60 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <span className={`h-10 w-10 rounded-full bg-gradient-to-br ${roleColor} text-white font-semibold flex items-center justify-center shadow-sm`}>
                {initials}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate dark:text-slate-100">{user.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.email || user.phone || roleLabel}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="pill bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-500">{roleLabel}</span>
            </div>
          </div>

          <div className="py-1">
            <MenuItem onClick={() => { setOpen(false); router.push(homePath); }} icon={<Icon.Activity className="h-4 w-4" />}>
              My dashboard
            </MenuItem>
            <MenuItem onClick={() => { setOpen(false); router.push('/profile'); }} icon={<Icon.User className="h-4 w-4" />}>
              Profile & account
            </MenuItem>
            <MenuItem onClick={() => { setOpen(false); router.push('/faq'); }} icon={<Icon.Sparkles className="h-4 w-4" />}>
              Help & FAQ
            </MenuItem>
            {user.role === 'ADMIN' && (
              <MenuItem onClick={() => { setOpen(false); router.push('/admin'); }} icon={<Icon.Settings className="h-4 w-4" />}>
                Manage businesses
              </MenuItem>
            )}
          </div>

          {/* Dark Mode toggle item inside ProfileMenu */}
          <div className="border-t border-slate-100 dark:border-slate-700 py-1">
            <ThemeMenuItem />
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 py-1">
            <MenuItem
              onClick={() => {
                setOpen(false);
                logout().catch(() => {}).finally(() => router.push('/'));
              }}
              icon={<Icon.Logout className="h-4 w-4" />}
              variant="danger"
            >
              Sign out
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  icon,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ' +
        (variant === 'danger'
          ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700')
      }
    >
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function ThemeMenuItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-slate-400 dark:text-slate-500">
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </span>
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </div>
      <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        {isDark ? 'Dark' : 'Light'}
      </span>
    </button>
  );
}
