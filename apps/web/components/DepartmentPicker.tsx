'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';

export interface DepartmentOption {
  id: string;
  name: string;
}

interface Props {
  options: DepartmentOption[];
  value: string;             // selected department id
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  label?: string;
}

/**
 * Accessible searchable combobox for departments.
 *
 * - Sorts options alphabetically (case-insensitive).
 * - Filter narrows by substring match.
 * - Keyboard: ↑/↓ to move, Enter to select, Esc to close.
 * - Closes on outside click.
 */
export function DepartmentPicker({
  options,
  value,
  onChange,
  placeholder = 'Search department…',
  required,
  label = 'Select department',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((d) => d.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const selected = sorted.find((d) => d.id === value);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep active item in view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  // Reset highlight when filter changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIdx];
      if (pick) {
        onChange(pick.id);
        setOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      {/* Hidden input to enforce HTML5 `required` */}
      {required && (
        <input
          type="text"
          value={value}
          required
          onChange={() => { /* controlled */ }}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />
      )}

      {/* Trigger / search input */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input w-full flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected ? selected.name : label}
        </span>
        <Icon.ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden animate-slide-up">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={placeholder}
                className="w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white"
              />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
          </div>

          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">
                No departments match “{query}”
              </li>
            ) : (
              filtered.map((d, i) => {
                const isActive = i === activeIdx;
                const isSelected = d.id === value;
                return (
                  <li
                    key={d.id}
                    data-idx={i}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => {
                      onChange(d.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={
                      'flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ' +
                      (isActive ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50')
                    }
                  >
                    <span className="truncate">{d.name}</span>
                    {isSelected && <Icon.Check className="h-4 w-4 text-brand-600 shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>

          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{filtered.length} of {sorted.length} departments</span>
            <span className="hidden sm:inline">↑↓ to navigate · Enter to select</span>
          </div>
        </div>
      )}
    </div>
  );
}
