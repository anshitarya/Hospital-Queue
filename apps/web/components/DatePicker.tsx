'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { addServiceDays, formatDateIst, serviceDay } from '@/lib/datetime';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return parseInt(addServiceDays(next, -1).slice(8), 10);
}

function buildMonthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const firstKey = `${y}-${String(m).padStart(2, '0')}-01`;
  const startPad = new Date(`${firstKey}T12:00:00+05:30`).getDay();
  const total = daysInMonth(month);
  const cells: (string | null)[] = Array.from({ length: startPad }, () => null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  let nm = m + delta;
  let ny = y;
  while (nm > 12) { nm -= 12; ny += 1; }
  while (nm < 1) { nm += 12; ny -= 1; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function inRange(day: string, min?: string, max?: string): boolean {
  if (min && day < min) return false;
  if (max && day > max) return false;
  return true;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  className = '',
  size = 'md',
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(monthKey(value || serviceDay()));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  useEffect(() => {
    if (open) setViewMonth(monthKey(value || serviceDay()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = value
    ? formatDateIst(`${value}T12:00:00+05:30`, { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Pick date';

  const btnClass = size === 'sm'
    ? 'input-sm !w-auto min-w-[7.5rem] justify-between gap-2 !py-1.5'
    : 'input !w-auto min-w-[9rem] justify-between gap-2';

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`${btnClass} inline-flex items-center font-medium text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 transition-colors`}
      >
        <span>{label}</span>
        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[17.5rem] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/80 p-4 animate-slide-up"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
              className="btn-icon !p-1.5 !rounded-xl"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatDateIst(`${viewMonth}-01T12:00:00+05:30`, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
              className="btn-icon !p-1.5 !rounded-xl"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="h-9" />;
              const disabled = !inRange(day, min, max);
              const selected = day === value;
              const isToday = day === serviceDay();
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(day); setOpen(false); }}
                  className={`h-9 rounded-xl text-sm font-medium transition-all ${
                    selected
                      ? 'bg-brand-600 text-white shadow-md scale-105'
                      : isToday
                        ? 'ring-2 ring-brand-400/60 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  } disabled:opacity-30 disabled:pointer-events-none`}
                >
                  {parseInt(day.slice(8), 10)}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => { onChange(serviceDay()); setOpen(false); }}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/40"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
