'use client';

import { FORMS } from '@/lib/config';
import { Icon } from '@/components/Icons';

export function ReviewFormButton({ className = '', variant = 'light' }: { className?: string; variant?: 'light' | 'dark' }) {
  if (!FORMS.reviewUrl) return null;

  const styles =
    variant === 'dark'
      ? 'text-slate-300 hover:text-white hover:bg-slate-800 ring-slate-600'
      : 'text-slate-600 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 ring-slate-200 dark:ring-slate-700';

  return (
    <a
      href={FORMS.reviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ' +
        'ring-1 transition-colors shrink-0 ' +
        styles +
        ' ' +
        className
      }
      title="Share your feedback"
    >
      <Icon.ClipboardList className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Review</span>
    </a>
  );
}
