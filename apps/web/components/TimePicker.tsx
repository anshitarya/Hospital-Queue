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
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    const p = parseTime(value);
    setHour(p.hour);
    setMinute(p.minute);
  }, [value]);

  // Auto-scroll columns to selected items when popover opens
  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      if (hourScrollRef.current) {
        const activeHourElem = hourScrollRef.current.querySelector('[data-active="true"]');
        if (activeHourElem) {
          activeHourElem.scrollIntoView({ block: 'center', behavior: 'instant' as any });
        }
      }
      if (minuteScrollRef.current) {
        const activeMinuteElem = minuteScrollRef.current.querySelector('[data-active="true"]');
        if (activeMinuteElem) {
          activeMinuteElem.scrollIntoView({ block: 'center', behavior: 'instant' as any });
        }
      }
    }, 50);
  }, [open]);

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
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[17rem] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/80 p-4 animate-slide-up"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Select time (IST)</p>
          
          <div className="flex gap-1.5 items-center justify-center bg-slate-50 dark:bg-slate-950/60 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
            {/* Hours Column */}
            <div className="flex flex-col items-center flex-1">
              <span className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Hour</span>
              <div 
                ref={hourScrollRef}
                className="h-32 w-full overflow-y-auto scrollbar-thin flex flex-col gap-1 pr-1"
              >
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    data-active={hour === h}
                    onClick={() => setHour(h)}
                    className={`py-1 rounded-lg text-sm font-semibold transition-all ${
                      hour === h
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-lg font-bold text-slate-300 dark:text-slate-600 self-center mt-3">:</span>

            {/* Minutes Column */}
            <div className="flex flex-col items-center flex-1">
              <span className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Min</span>
              <div 
                ref={minuteScrollRef}
                className="h-32 w-full overflow-y-auto scrollbar-thin flex flex-col gap-1 pr-1"
              >
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-active={minute === m}
                    onClick={() => setMinute(m)}
                    className={`py-1 rounded-lg text-sm font-semibold transition-all ${
                      minute === m
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 !py-2 !text-xs font-semibold">
              Cancel
            </button>
            <button type="button" onClick={() => apply(hour, minute)} className="btn-primary flex-1 !py-2 !text-xs font-semibold">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
