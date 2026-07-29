'use client';

import { useEffect, useState, useRef } from 'react';
import { DEMO_DATA, DEMO_TIMING } from '@/lib/config';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shared helpers                                                             */
/*                                                                             */
/*  All timing-dependent state is initialised lazily and only advanced via     */
/*  useEffect — this guarantees identical server / first-client render so      */
/*  React doesn't throw a hydration mismatch.                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Marks `true` only after the component mounts on the client.
 * Used to gate any dynamic rendering that would otherwise differ from SSR.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/**
 * Detects if an element is currently in the viewport using IntersectionObserver.
 */
function useIsVisible(ref: React.RefObject<HTMLElement>) {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) =>
      setIntersecting(entry.isIntersecting)
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return isIntersecting;
}

/**
 * Returns an incrementing tick every `ms` milliseconds. Starts at 0.
 * Safe: only ticks after mount and when active.
 */
function useTicker(ms: number, active: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return tick;
}

/**
 * Drives a step machine 0 → steps-1 → reset.
 * Each step lasts `perStep` ms. Step transitions happen client-side only,
 * so initial render is always step 0 (matches SSR). Only advances when active.
 */
function useStep(steps: number, perStep: number, active: boolean) {
  const [step, setStep] = useState(0);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (restarting) {
      const t = setTimeout(() => { setStep(0); setRestarting(false); }, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (step < steps - 1) setStep((s) => s + 1);
      else setRestarting(true);
    }, perStep);
    return () => clearTimeout(t);
  }, [step, steps, perStep, restarting, active]);

  return { step, restarting };
}

/**
 * Returns a substring of `full` that grows by one character every
 * `intervalMs` ms, until complete. Tied to `enabled` so it only types
 * when active. Reset when `enabled` flips false.
 */
function useTyping(full: string, enabled: boolean, intervalMs: number) {
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (!enabled) { setChars(0); return; }
    if (chars >= full.length) return;
    const t = setTimeout(() => setChars((c) => c + 1), intervalMs);
    return () => clearTimeout(t);
  }, [enabled, chars, full.length, intervalMs]);
  return full.slice(0, chars);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TouchRipple — animated "tap" indicator                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Renders a finger-tap ripple at the configured spot. Use `active` to
 * show / hide. Position is absolute within the nearest relatively-
 * positioned ancestor.
 */
function TouchRipple({
  active,
  x,
  y,
  label,
}: {
  active: boolean;
  x: string; // e.g. "50%"
  y: string;
  label?: string;
}) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      aria-hidden
    >
      {/* Outer translucent ring — subtle, slate-tinted */}
      <span className="absolute inset-0 -m-2 rounded-full bg-slate-500/15 animate-tap-ring" />

      {/* Inner translucent dot — smaller than before */}
      <span className="relative block h-3 w-3 rounded-full bg-slate-700/40 ring-1 ring-white/70 animate-tap-dot" />

      {label && (
        <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/85 text-white text-[10px] font-medium px-1.5 py-0.5 shadow-sm">
          {label}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  1. Patient Demo                                                            */
/*                                                                             */
/*  Step plan (slow pace — ~2.8s each, total loop ~17s):                       */
/*   0 → idle, empty phone field      (tap on field appears)                   */
/*   1 → typing phone number                                                   */
/*   2 → tap on "Get OTP" button                                               */
/*   3 → OTP digits appear                                                     */
/*   4 → tap "Verify" → live token card                                        */
/*   5 → live ETA ticking down                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export function PatientDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(ref);
  const mounted = useMounted();
  const { step, restarting } = useStep(6, DEMO_TIMING.patientStepMs, isVisible);
  const tick = useTicker(1000, isVisible);

  const typing = useTyping(DEMO_DATA.patient.phone, step === 1, DEMO_TIMING.typeIntervalMs);
  const phoneText = step === 0 ? '' : step >= 2 ? DEMO_DATA.patient.phone : typing;

  // Live ETA in step 5: count down ahead, recompute eta
  const elapsed = step >= 5 ? tick : 0;
  const ahead = Math.max(0, DEMO_DATA.patient.initialAhead - Math.floor(elapsed / 3));
  const eta = Math.max(1, DEMO_DATA.patient.initialEtaMinutes - elapsed);

  // Tap positions: relative to demo container.
  // Step 0 — tap input. Step 2 — tap "Get OTP". Step 4 — tap Verify.
  const tapOnInput = step === 0 && mounted;
  const tapOnGetOtp = step === 2 && mounted;
  const tapOnVerify = step === 4 && mounted;

  const fade = restarting ? 'opacity-0' : 'opacity-100';

  return (
    <div ref={ref} className={`relative transition-opacity duration-400 ${fade} select-none`}>
      {/* ── Steps 0–2: Phone entry ── */}
      {step < 3 && (
        <div className="relative space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Customer sign-in
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Mobile number</label>
            <div className="relative rounded-lg border-2 border-brand-400 bg-white dark:bg-slate-800 px-3 py-2.5 shadow-sm flex items-center gap-2 min-h-[44px]">
              <span className="text-slate-600 dark:text-slate-400 text-sm">+91</span>
              <span className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
              <span className="text-slate-900 dark:text-white text-sm font-mono tracking-wider">{phoneText}</span>
              {step === 1 && (
                <span className="h-4 w-0.5 bg-brand-500 animate-pulse ml-0.5" />
              )}
            </div>
            <TouchRipple active={tapOnInput} x="20%" y="62%" label="Tap to enter phone" />
          </div>

          <div className="relative">
            <button
              className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 shadow-md transition-all ${step === 2 ? 'scale-95 brightness-110' : ''}`}
            >
              {step === 2 ? 'Sending OTP…' : 'Get OTP'}
            </button>
            <TouchRipple active={tapOnGetOtp} x="50%" y="50%" label="Tap to get OTP" />
          </div>
        </div>
      )}

      {/* ── Steps 3–4: OTP entry ── */}
      {(step === 3 || step === 4) && (
        <div className="relative space-y-4">
          <div className="text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">OTP sent to +91 {DEMO_DATA.patient.phone}</div>
            <div className="flex gap-2 justify-center">
              {DEMO_DATA.patient.otpDigits.map((d, i) => (
                <div
                  key={i}
                  className="h-11 w-9 rounded-lg border-2 border-brand-400 flex items-center justify-center text-lg font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 shadow-sm animate-fade-in"
                  style={{ animationDelay: `${i * 140}ms` }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <button className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 shadow-md ${step === 4 ? 'scale-95 brightness-110' : ''}`}>
              {step === 4 ? 'Verifying…' : 'Verify OTP'}
            </button>
            <TouchRipple active={tapOnVerify} x="50%" y="50%" label="Tap to verify" />
          </div>
        </div>
      )}

      {/* ── Step 5: Live token card ── */}
      {step === 5 && (
        <div className="space-y-3 animate-fade-in">
          {ahead === 0 && (
            <div className="rounded-lg bg-emerald-500 text-white text-xs font-semibold px-3 py-2 text-center flex items-center justify-center gap-2 animate-pulse-slow shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse inline-block" />
              It&apos;s your turn — head to the room!
            </div>
          )}

          <div className="rounded-xl border-2 border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white">{DEMO_DATA.patient.doctorName}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{DEMO_DATA.patient.doctorSpecialty}</div>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg bg-brand-50 dark:bg-brand-950/40 ring-1 ring-brand-200 dark:ring-brand-800 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">Your token</div>
                <div className="text-3xl font-bold text-brand-700 dark:text-brand-400">#{DEMO_DATA.patient.yourToken}</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">Serving</div>
                <div className="text-3xl font-bold text-slate-800 dark:text-white">#{DEMO_DATA.patient.yourToken - ahead}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-800 p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">Ahead</div>
                <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{ahead}</div>
              </div>
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/40 ring-1 ring-purple-200 dark:ring-purple-800 p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">ETA</div>
                <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{ahead === 0 ? 'Now!' : `~${eta}m`}</div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center">Updates live · No refresh needed</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  2. Reception Demo                                                          */
/*                                                                             */
/*  Steps (~2.6s each, total ~16s):                                            */
/*   0 → idle form, tap on name field                                          */
/*   1 → typing name                                                           */
/*   2 → tap "Add" button                                                      */
/*   3 → spinner ("assigning token")                                           */
/*   4 → patient added to queue, success                                       */
/*   5 → hold the success view                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export function ReceptionDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(ref);
  const mounted = useMounted();
  const { step, restarting } = useStep(6, DEMO_TIMING.receptionStepMs, isVisible);
  const typed = useTyping(DEMO_DATA.reception.newPatientName, step === 1, DEMO_TIMING.typeIntervalMs);

  const displayedName =
    step === 0 ? '' :
    step >= 2 ? DEMO_DATA.reception.newPatientName :
    typed;

  const queue = step >= 4
    ? [
        ...DEMO_DATA.reception.initialQueue.map((p) => ({ ...p, status: 'waiting' as const })),
        { n: DEMO_DATA.reception.newTokenNumber, name: DEMO_DATA.reception.newPatientName, status: 'new' as const },
      ]
    : DEMO_DATA.reception.initialQueue.map((p) => ({ ...p, status: 'waiting' as const }));

  const tapOnField = step === 0 && mounted;
  const tapOnAdd = step === 2 && mounted;

  const fade = restarting ? 'opacity-0' : 'opacity-100';

  return (
    <div ref={ref} className={`relative transition-opacity duration-400 ${fade} select-none space-y-4`}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse inline-block" />
          Receptionist dashboard
        </div>
      </div>

      {/* Add patient form */}
      <div className="relative rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3">Add customer to queue</div>
        <div className="flex gap-2 relative">
          <div className="flex-1 relative rounded-lg border-2 border-brand-400 bg-white dark:bg-slate-800 px-3 py-2 flex items-center min-h-[40px]">
            <span className="text-sm text-slate-900 dark:text-white font-medium">{displayedName}</span>
            {step === 1 && (
              <span className="h-4 w-0.5 bg-brand-500 animate-pulse ml-0.5" />
            )}
            <TouchRipple active={tapOnField} x="25%" y="50%" label="Tap to enter name" />
          </div>
          <div className="relative">
            <button
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 shadow transition-all ${step === 3 ? 'scale-90 opacity-70' : ''}`}
            >
              {step === 3 ? '+ Adding…' : '+ Add'}
            </button>
            <TouchRipple active={tapOnAdd} x="50%" y="50%" label="Tap Add" />
          </div>
        </div>
        {step === 3 && (
          <div className="mt-2 text-xs text-brand-700 dark:text-brand-400 font-medium flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <circle cx="12" cy="12" r="9" strokeOpacity=".3" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
            Assigning token…
          </div>
        )}
      </div>

      {/* Live queue */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Live queue</div>
          <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            LIVE
          </span>
        </div>
        <div className="space-y-1.5">
          {queue.map((p, i) => (
            <div
              key={p.n}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all duration-500 ${
                p.status === 'new'
                  ? 'bg-brand-50 dark:bg-brand-950/40 ring-1 ring-brand-300 dark:ring-brand-800 text-brand-900 dark:text-brand-200 font-semibold animate-fade-in'
                  : i === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium'
                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span>
                <span className="font-bold mr-1">#{p.n}</span>
                {p.name}
              </span>
              {p.status === 'new' && (
                <span className="text-[10px] rounded-full bg-brand-700 text-white px-2 py-0.5">New</span>
              )}
              {i === 0 && p.status !== 'new' && (
                <span className="text-[10px] rounded-full bg-emerald-700 text-white px-2 py-0.5">In consultation</span>
              )}
            </div>
          ))}
        </div>
        {step >= 4 && (
          <div className="mt-2 text-[11px] text-brand-700 dark:text-brand-400 font-medium text-center animate-fade-in">
            Token #{DEMO_DATA.reception.newTokenNumber} assigned · All customers notified ✓
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  3. Doctor Demo                                                             */
/*                                                                             */
/*  Steps (~2.6s each, total ~16s):                                            */
/*   0 → idle queue, tap on "Call next"                                        */
/*   1 → consultation card shown with timer starting                           */
/*   2 → timer running                                                         */
/*   3 → tap "Mark complete"                                                   */
/*   4 → completing animation                                                  */
/*   5 → next patient advanced                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export function DoctorDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(ref);
  const mounted = useMounted();
  const { step, restarting } = useStep(6, DEMO_TIMING.doctorStepMs, isVisible);
  const tick = useTicker(1000, isVisible);

  const fade = restarting ? 'opacity-0' : 'opacity-100';

  // Consultation timer counts up while step is 1–3.
  const elapsed = step >= 1 && step <= 3 ? Math.min(tick % 90, 47) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const current = step >= 1 && step <= 3 ? DEMO_DATA.doctor.initialQueue[0] : null;
  const remaining = step <= 3
    ? DEMO_DATA.doctor.initialQueue.slice(1)
    : DEMO_DATA.doctor.initialQueue.slice(2);

  const tapOnCallNext = step === 0 && mounted;
  const tapOnComplete = step === 3 && mounted;

  return (
    <div ref={ref} className={`relative transition-opacity duration-400 ${fade} select-none space-y-4`}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse inline-block" />
          Provider panel
        </div>
      </div>

      {/* Current consultation */}
      <div className={`relative rounded-xl p-4 shadow-sm transition-all duration-500 ${
        current
          ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white'
          : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
      }`}>
        {current ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-white/80 uppercase tracking-wider">In consultation</div>
              <div className="font-mono text-sm bg-white/20 rounded px-2 py-0.5">{mm}:{ss}</div>
            </div>
            <div className="text-2xl font-bold mt-1">#{current.n} · {current.name}</div>
            <div className="flex gap-2 mt-4 relative">
              <button
                className={`flex-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold py-2 transition-all ${step === 4 ? 'scale-95 opacity-60' : ''}`}
              >
                {step === 4 ? '✓ Completing…' : 'Mark complete'}
              </button>
              <button className="rounded-lg bg-white/20 text-white text-xs font-semibold px-3 py-2">
                Pause
              </button>
              <TouchRipple active={tapOnComplete} x="33%" y="50%" label="Tap to complete" />
            </div>
          </>
        ) : step === 0 ? (
          <div className="text-center py-2 text-sm text-slate-700 dark:text-slate-200">Ready · {DEMO_DATA.doctor.initialQueue.length} customers waiting</div>
        ) : (
          <div className="text-center py-2 text-sm text-slate-700 dark:text-slate-200 font-medium">
            ✓ Completed · Avg consult {DEMO_DATA.doctor.avgConsultMinutes} min
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="relative rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Up next</div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{remaining.length} waiting</span>
        </div>
        <div className="space-y-1.5">
          {remaining.slice(0, 3).map((p, i) => (
            <div
              key={p.n}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all duration-500 ${
                i === 0
                  ? 'bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-800 text-amber-800 dark:text-amber-300 font-medium'
                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span>
                <span className="font-bold mr-1">#{p.n}</span>
                {p.name}
              </span>
              {i === 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">Next up</span>
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="relative mt-3">
            <button className="w-full rounded-lg py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-700 shadow">
              Call next customer
            </button>
            <TouchRipple active={tapOnCallNext} x="50%" y="50%" label="Tap Call next" />
          </div>
        )}
        {step === 5 && (
          <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium text-center animate-fade-in">
            All screens updated · Avg consult: {DEMO_DATA.doctor.avgConsultMinutes} min ✓
          </div>
        )}
      </div>
    </div>
  );
}
