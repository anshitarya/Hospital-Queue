'use client';

import { useEffect } from 'react';

export type ToastMessage = {
  type: 'ok' | 'err' | 'info';
  msg: string;
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

  const palette =
    message.type === 'ok'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : message.type === 'err'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-sky-50 text-sky-800 border-sky-200';

  const icon =
    message.type === 'ok' ? '✓' : message.type === 'err' ? '⚠' : 'ℹ';

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className={`rounded-xl border shadow-lg px-4 py-3 max-w-sm ${palette}`}>
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5" aria-hidden>
            {icon}
          </span>
          <div className="flex-1 text-sm">{message.msg}</div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
