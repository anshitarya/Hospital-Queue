'use client';

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0b]">
      <div className="flex flex-col items-center gap-5">
        {/* Spinning gradient ring with inner glow */}
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full spinner-gradient-ring" />
          <div className="absolute inset-[5px] rounded-full bg-slate-50 dark:bg-[#0a0a0b] flex items-center justify-center">
            <div className="h-4 w-4 rounded-full bg-gradient-to-br from-brand-400 to-emerald-500 animate-pulse-slow shadow-sm" />
          </div>
        </div>

        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 tracking-wide">
          {label}
        </div>

        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-brand-400"
              style={{ animation: `dots-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

/** Compact inline spinner for buttons and inline loading states */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <div
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin opacity-80 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Section-level loading placeholder (smaller than PageLoader) */
export function SectionLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full spinner-gradient-ring" />
        <div className="absolute inset-[4px] rounded-full bg-white dark:bg-slate-900" />
      </div>
      {label && <p className="text-xs font-medium">{label}</p>}
    </div>
  );
}
