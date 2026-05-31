'use client';

import { useState } from 'react';
import { Icon } from './Icons';

export interface FAQItem {
  q: string;
  a: React.ReactNode;
}

export function FAQ({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200/70 rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
      {items.map((item, idx) => {
        const isOpen = open === idx;
        return (
          <div key={idx}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : idx)}
              className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-left hover:bg-slate-50/60 transition-colors"
              aria-expanded={isOpen}
            >
              <span className="font-medium text-slate-900">{item.q}</span>
              <Icon.ChevronDown
                className={
                  'h-5 w-5 text-slate-400 shrink-0 transition-transform duration-200 ' +
                  (isOpen ? 'rotate-180 text-brand-600' : '')
                }
              />
            </button>
            <div
              className={
                'grid transition-[grid-template-rows] duration-300 ease-out ' +
                (isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')
              }
            >
              <div className="overflow-hidden">
                <div className="px-5 sm:px-6 pb-5 text-slate-600 text-sm leading-relaxed">
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
