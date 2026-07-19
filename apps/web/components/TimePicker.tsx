'use client';

import { useEffect, useId, useRef, useState } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseTime(value: string): { hour: string; minute: string } {
  const [hour = '09', minute = '00'] = value.split(':');
  return { hour: hour.padStart(2, '0').slice(0, 2), minute: minute.padStart(2, '0').slice(0, 2) };
}

export function TimePicker({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    const p = parseTime(value);
    setHour(p.hour);
    setMinute(p.minute);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const apply = (h: string, m: string) => {
    onChange(`${h}:${m}`);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="input-sm !w-[5.5rem] text-center font-semibold tabular-nums tracking-wide hover:border-brand-400 dark:hover:border-brand-500 transition-colors"
      >
        {value || '09:00'}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[15.5rem] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/80 p-4 animate-slide-up"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Select time (IST)</p>
          <div className="flex gap-2 items-center justify-center">
            <select
              aria-label="Hour"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className="input-sm !w-[4.5rem] text-center font-semibold appearance-none cursor-pointer"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-lg font-bold text-slate-300 dark:text-slate-600">:</span>
            <select
              aria-label="Minute"
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className="input-sm !w-[4.5rem] text-center font-semibold appearance-none cursor-pointer"
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 !py-2 !text-xs">
              Cancel
            </button>
            <button type="button" onClick={() => apply(hour, minute)} className="btn-primary flex-1 !py-2 !text-xs">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
