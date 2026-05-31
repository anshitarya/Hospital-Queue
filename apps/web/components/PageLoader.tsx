'use client';

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
        <div className="text-sm">{label}</div>
      </div>
    </main>
  );
}
