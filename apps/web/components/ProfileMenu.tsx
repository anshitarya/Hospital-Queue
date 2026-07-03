'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

  const roleLabel = user.role.charAt(0) + user.role.slice(1).toLowerCase();
  const roleColor =
    user.role === 'ADMIN' ? 'from-purple-500 to-purple-700' :
    user.role === 'DOCTOR' ? 'from-sky-500 to-sky-700' :
    user.role === 'RECEPTIONIST' ? 'from-emerald-500 to-emerald-700' :
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
        className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`h-8 w-8 rounded-full bg-gradient-to-br ${roleColor} text-white font-semibold text-sm flex items-center justify-center shadow-sm`}>
          {initials}
        </span>
        <span className="hidden sm:block text-sm text-slate-700 font-medium">{user.name.split(' ')[0]}</span>
        <Icon.ChevronDown className={'h-4 w-4 text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} />
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
            {user.role === 'ADMIN' && (
              <MenuItem onClick={() => { setOpen(false); router.push('/admin'); }} icon={<Icon.Settings className="h-4 w-4" />}>
                Manage clinics
              </MenuItem>
            )}
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
