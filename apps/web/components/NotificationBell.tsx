'use client';

import { useRef, useState } from 'react';
import { useOutsideClick } from '@/lib/useOutsideClick';

export type PatientNotification = {
  id: string;
  type: 'urgent' | 'upcoming' | 'missed';
  title: string;
  body: string;
};

const TYPE_META: Record<PatientNotification['type'], { icon: string; bg: string; ring: string; titleColor: string }> = {
  urgent:   { icon: '🔔', bg: 'bg-emerald-50',  ring: 'ring-emerald-200', titleColor: 'text-emerald-800' },
  upcoming: { icon: '⏰', bg: 'bg-amber-50',    ring: 'ring-amber-200',   titleColor: 'text-amber-800'   },
  missed:   { icon: '⚠️', bg: 'bg-rose-50',     ring: 'ring-rose-200',    titleColor: 'text-rose-800'    },
};

export function NotificationBell({ notifications }: { notifications: PatientNotification[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const count   = notifications.length;
  const hasUrge = notifications.some((n) => n.type === 'urgent');

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${count > 0 ? ` (${count})` : ''}`}
        className="relative flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 transition-colors"
      >
        {/* Bell icon */}
        <svg
          className={`w-5 h-5 ${count > 0 ? (hasUrge ? 'text-emerald-600' : 'text-amber-500') : 'text-slate-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge */}
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1 ${
            hasUrge ? 'bg-emerald-500' : 'bg-rose-500'
          } ${hasUrge ? 'animate-pulse' : ''}`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Popup panel */}
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <div className="fixed inset-0 bg-black/20 z-40 sm:hidden" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-sm font-semibold text-slate-800">
                Notifications {count > 0 && <span className="text-slate-400 font-normal">({count})</span>}
              </span>
              <button type="button" onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Notification list */}
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {count === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-3xl mb-2">🔕</div>
                  <p className="text-sm font-medium text-slate-600">No notifications</p>
                  <p className="text-xs text-slate-400 mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const meta = TYPE_META[n.type];
                  return (
                    <div key={n.id} className={`px-4 py-3.5 flex items-start gap-3 ${meta.bg}`}>
                      <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${meta.titleColor}`}>{n.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            {count > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
                <p className="text-[11px] text-slate-400 text-center">
                  Updates automatically as your queue moves
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
