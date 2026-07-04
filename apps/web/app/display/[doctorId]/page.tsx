'use client';

import { useDoctorQueue } from '@/lib/socket';
import { tokenDisplay } from '@/lib/tokenCode';

/**
 * Public TV display. Mount this on a clinic-room screen at
 *   /display/{doctorId}
 *
 * High-contrast, glanceable — current token + next few in queue.
 */
export default function DisplayPage({ params }: { params: { doctorId: string } }) {
  const { snapshot, connected } = useDoctorQueue(params.doctorId);
  const upcoming = (snapshot?.entries ?? [])
    .filter((e) => e.status === 'WAITING')
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="px-10 pt-10 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            {snapshot?.doctor?.user.name ?? 'Loading…'}
          </h1>
          <div className="text-slate-400 text-lg">
            {snapshot?.doctor?.department?.name ?? ''}
            {snapshot?.doctor?.status === 'PAUSED' && (
              <span className="ml-3 inline-block rounded bg-amber-500 px-2 py-0.5 text-sm font-medium text-amber-950">
                PAUSED
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {connected ? '● live' : '○ reconnecting…'}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400 uppercase tracking-widest text-xl">Now serving</div>
          <div className="text-[10rem] font-bold leading-none mt-4 font-mono tracking-widest">
            {snapshot?.currentToken ? tokenDisplay(snapshot.currentToken) : '—'}
          </div>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="px-10 pb-10">
          <div className="text-slate-400 uppercase tracking-widest text-sm mb-3">
            Up next
          </div>
          <div className="flex gap-3 flex-wrap">
            {upcoming.map((e, i) => (
              <div
                key={e.id}
                className="bg-slate-800 rounded-lg px-6 py-4 text-center min-w-[120px]"
              >
                <div className="text-slate-400 text-xs mb-1">#{i + 1}</div>
                <div className="text-3xl font-semibold font-mono">{tokenDisplay(e.tokenNumber)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
