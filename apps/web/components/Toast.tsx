'use client';

import { useEffect } from 'react';

export type ToastMessage = {
  type: 'ok' | 'err' | 'info';
  msg: string;
};

const ICONS = {
  ok: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ),
  err: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  ),
};

const PALETTES = {
  ok:   { wrap: 'bg-emerald-950/95 text-emerald-100 ring-emerald-700/50', icon: 'text-emerald-400', progress: 'bg-emerald-500' },
  err:  { wrap: 'bg-rose-950/95 text-rose-100 ring-rose-700/50',         icon: 'text-rose-400',    progress: 'bg-rose-500'    },
  info: { wrap: 'bg-slate-900/95 text-slate-100 ring-slate-700/50',       icon: 'text-blue-400',    progress: 'bg-blue-500'    },
};

export function Toast({
  message,
  onDismiss,
  duration = 5000,
}: {
  message: ToastMessage | null;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const p = PALETTES[message.type];

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
      <div
        className={`pointer-events-auto animate-toast-in rounded-2xl ring-1 shadow-modal backdrop-blur-sm overflow-hidden max-w-sm ${p.wrap}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="px-4 py-3.5 flex items-start gap-3">
          <span className={`shrink-0 mt-0.5 ${p.icon}`} aria-hidden>
            {ICONS[message.type]}
          </span>
          <div className="flex-1 text-sm font-medium leading-snug">{message.msg}</div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1 mt-0.5"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
        {/* Progress bar */}
        <div
          className={`h-0.5 ${p.progress} origin-left opacity-60`}
          style={{ animation: `progress ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
}
