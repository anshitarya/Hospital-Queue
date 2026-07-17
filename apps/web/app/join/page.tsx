'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { useAuth, registerCustomer } from '../../lib/auth';
import { PageLoader, Spinner } from '../../components/PageLoader';

interface JoinInfo {
  allowOnlineBooking: boolean;
  error?: string;
  doctor?: {
    id: string;
    name: string;
    specialization: string | null;
    department: string | null;
    status: string;
    avgConsultMinutes: number;
  };
  clinic?: {
    id: string;
    name: string;
    address: string | null;
    businessType: string;
  };
  queueLength: number;
  etaMinutes: number;
}

function JoinPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loaded: ready, setSession } = useAuth();
  const doctorId = params.get('d');

  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [registering, setRegistering] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);

  // Fetch public join info (no auth required)
  useEffect(() => {
    if (!doctorId) { setLoadingInfo(false); return; }
    api<JoinInfo>(`/queue/public/join-info/${doctorId}`)
      .then(setInfo)
      .catch(() => setInfo({ allowOnlineBooking: false, error: 'Could not load clinic info', queueLength: 0, etaMinutes: 0 }))
      .finally(() => setLoadingInfo(false));
  }, [doctorId]);

  const handleJoin = async () => {
    if (!doctorId || !user) return;
    setJoining(true);
    setError(null);
    try {
      const res = await api<{ id: string }>('/queue/patient/join', {
        method: 'POST',
        body: { doctorId },
      });
      setJoined(true);
      setEntryId(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to join queue. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestPhone.trim() || !doctorId) return;
    setRegistering(true);
    setError(null);
    try {
      // 1. Call register customer api
      const regRes = await registerCustomer(guestPhone.trim(), guestName.trim());
      // 2. Save session locally to authenticate subsequent requests
      setSession(regRes);
      setGeneratedPin(regRes.pin);
      
      // 3. Immediately join the queue
      const joinRes = await api<{ id: string }>('/queue/patient/join', {
        method: 'POST',
        body: { doctorId },
        headers: {
          Authorization: `Bearer ${regRes.token}`
        }
      });
      setJoined(true);
      setEntryId(joinRes.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to register and join queue. Please try again.');
    } finally {
      setRegistering(false);
    }
  };

  if (!ready || loadingInfo) return <PageLoader label="Loading queue info…" />;

  if (!doctorId) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 text-center max-w-md w-full">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Invalid Link</h1>
          <p className="text-sm text-slate-500">This booking link is missing a doctor reference. Please ask for a valid QR code.</p>
          <button type="button" onClick={() => router.push('/patient')} className="btn-primary mt-6">Go to Dashboard</button>
        </div>
      </main>
    );
  }

  if (!info?.allowOnlineBooking) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 text-center max-w-md w-full">
          <div className="text-4xl mb-4">🚫</div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Self-Booking Disabled</h1>
          <p className="text-sm text-slate-500">{info?.error ?? 'This clinic has not enabled online self-booking.'}</p>
          <button type="button" onClick={() => router.push('/patient')} className="btn-secondary mt-6">Back to Dashboard</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0b] p-4">
      <div className="max-w-md w-full space-y-4 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-500 items-center justify-center text-white text-2xl font-bold shadow-lg mb-4">
            {info.clinic?.name.charAt(0) ?? 'Q'}
          </div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{info.clinic?.name}</h1>
          {info.clinic?.address && (
            <p className="text-xs text-slate-400 mt-1">{info.clinic.address}</p>
          )}
        </div>

        {/* Doctor card */}
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-lg font-bold shrink-0">
              {info.doctor?.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{info.doctor?.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{info.doctor?.department ?? info.doctor?.specialization ?? 'General'}</p>
              <div className="flex items-center gap-3 mt-3">
                <div className="text-center">
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{info.queueLength}</div>
                  <div className="text-[10px] text-slate-400 font-medium">waiting</div>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="text-center">
                  <div className="text-xl font-extrabold text-brand-600 dark:text-brand-400 tabular-nums">
                    {info.etaMinutes < 1 ? '<1' : info.etaMinutes} min
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">est. wait</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Join action */}
        {joined ? (
          <div className="card p-6 text-center space-y-4 border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20">
            <div className="text-4xl">🎉</div>
            <h2 className="text-base font-bold text-emerald-800 dark:text-emerald-300">You&apos;re in the queue!</h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Your spot has been confirmed. Estimated wait: <strong>{info.etaMinutes + 1} min</strong>
            </p>

            {generatedPin && (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 text-left space-y-2 shadow-sm">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">🔒 Your Generated login pin</div>
                <div className="text-3xl font-extrabold text-brand-600 tracking-widest text-center py-1 font-mono">{generatedPin}</div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Save this PIN. You will need your phone number (<span className="font-semibold text-slate-600 dark:text-slate-300">{guestPhone}</span>) and this 4-digit PIN to access your dashboard in the future.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-2">
              <button type="button" onClick={() => router.push(`/patient`)} className="btn-primary">
                Track My Queue Position →
              </button>
              <button type="button" onClick={() => router.push('/patient')} className="btn-secondary text-xs">
                Back to Dashboard
              </button>
            </div>
          </div>
        ) : user ? (
          <div className="space-y-3">
            {error && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <button
              type="button"
              disabled={joining || info.doctor?.status === 'AWAY'}
              onClick={handleJoin}
              className="btn-primary w-full !py-3 !text-base font-bold"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2"><Spinner className="h-5 w-5" /> Joining…</span>
              ) : info.doctor?.status === 'AWAY' ? (
                'Professional Unavailable'
              ) : (
                'Join the Queue →'
              )}
            </button>
            <p className="text-center text-xs text-slate-400">
              Joining as <strong className="text-slate-600 dark:text-slate-300">{user.name}</strong>
            </p>
            <button type="button" onClick={() => router.push('/patient')} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1">
              Cancel — Back to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleGuestJoin} className="card p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Quick Join & Register</h3>
              <p className="text-[11px] text-slate-400 mt-1">First time? Enter your name and phone number to join. We will generate a login PIN for your future visits.</p>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 px-3 py-2 text-xs">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Full Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. John Doe"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Phone Number</label>
                <input 
                  type="tel" 
                  required 
                  placeholder="e.g. 9876543210"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="input mt-1 w-full"
                />
              </div>
              
              <button 
                type="submit" 
                disabled={registering || info.doctor?.status === 'AWAY'}
                className="btn-primary w-full mt-2"
              >
                {registering ? (
                  <span className="flex items-center justify-center gap-2"><Spinner className="h-5 w-5" /> Registering & Joining…</span>
                ) : info.doctor?.status === 'AWAY' ? (
                  'Professional Unavailable'
                ) : (
                  'Register & Join Queue'
                )}
              </button>
              
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-xs">or</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>

              <button 
                type="button" 
                onClick={() => router.push(`/login?returnTo=${encodeURIComponent(`/join?d=${doctorId}`)}`)}
                className="btn-secondary w-full text-xs"
              >
                Login with Existing Account
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading booking queue…" />}>
      <JoinPageContent />
    </Suspense>
  );
}
