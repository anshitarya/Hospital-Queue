'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError, type Doctor } from '@/lib/api';
import { useDoctorQueue } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
import { QueueHistoryTable } from '@/components/QueueHistoryTable';
import { EntryStatusPill, LiveIndicator } from '@/components/StatusPill';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import {
  DoctorCredentialsModal,
  type DoctorCredentials,
} from '@/components/DoctorCredentialsModal';

interface ReceptionistRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export default function DoctorPage() {
  const { user, ready } = useRequireRole(['DOCTOR', 'ADMIN', 'RECEPTIONIST']);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [tab, setTab] = useTabState<'queue' | 'staff' | 'history'>('queue', ['queue', 'staff', 'history']);

  // Break form state (Feature 4)
  const [showBreakForm, setShowBreakForm] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(15);
  const [breakNote, setBreakNote] = useState('');

  const [recList, setRecList] = useState<ReceptionistRow[]>([]);
  const [recName, setRecName] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoneResult, setRecPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [recBusy, setRecBusy] = useState(false);
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  const loadReceptionists = useCallback(async () => {
    try {
      const list = await api<ReceptionistRow[]>('/clinics/my/receptionists');
      setRecList(list);
    } catch {
      setRecList([]);
    }
  }, []);

  useEffect(() => {
    if (ready && user?.clinicId) loadReceptionists();
  }, [ready, user?.clinicId, loadReceptionists]);

  async function addReceptionist(e: React.FormEvent) {
    e.preventDefault();
    if (!recEmail && !recPhoneResult.ok) {
      setToast({ type: 'err', msg: 'Provide either an email or a valid mobile number for the receptionist.' });
      return;
    }
    setRecBusy(true);
    try {
      const result = await api<{
        user: { id: string; name: string; email: string | null; phone: string | null };
        tempPassword: string;
      }>('/clinics/my/receptionists', {
        method: 'POST',
        body: {
          name: recName,
          email: recEmail || undefined,
          phone: recPhoneResult.e164 || undefined,
        },
      });
      setRecName(''); setRecEmail(''); setRecPhone(''); setRecPhoneResult({ ok: false });
      setCreds({
        role: 'receptionist',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        tempPassword: result.tempPassword,
      });
      await loadReceptionists();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add receptionist' });
    } finally {
      setRecBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || !user) return;
    api<Doctor[]>('/doctors').then((all) => {
      const me = all.find((d) => d.userId === user.id);
      if (me) {
        setDoctorId(me.id);
      } else if (user.role === 'ADMIN' || user.role === 'RECEPTIONIST') {
        if (all.length > 0) setDoctorId(all[0].id);
        else setLinkError('No doctors configured yet.');
      } else {
        setLinkError('No doctor profile linked to your account.');
      }
    }).catch(() => setLinkError('Failed to load doctor profile.'));
  }, [ready, user]);

  const { snapshot, connected } = useDoctorQueue(doctorId);

  const call = useCallback(async (fn: () => Promise<unknown>, label = 'Action') => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setToast({ type: 'err', msg: `${label} failed: ${msg}` });
    }
  }, []);

  if (!ready) return <PageLoader label="Loading your panel…" />;

  const callNext = () =>
    call(() => api(`/queue/doctor/${doctorId}/call-next`, { method: 'POST' }), 'Call next');
  const completeEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/complete`, { method: 'POST' }), 'Complete');
  const cancelEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/cancel`, { method: 'POST' }), 'Cancel');
  const missEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/miss`, { method: 'POST' }), 'Mark missed');
  const doctorAction = (action: 'pause' | 'resume') =>
    call(() => api(`/queue/doctor/${doctorId}/${action}`, { method: 'POST' }), action);
  const startBreak = async () => {
    await call(
      () => api(`/queue/doctor/${doctorId}/break`, { method: 'POST', body: { estimatedMinutes: breakMinutes, note: breakNote || undefined } }),
      'Start break',
    );
    setShowBreakForm(false);
    setBreakNote('');
  };

  const current = snapshot?.entries.find((e) => e.status === 'IN_CONSULTATION');
  const waiting = (snapshot?.entries ?? []).filter((e) => e.status === 'WAITING');
  const nextUp = waiting[0];
  const isPaused = snapshot?.doctor?.status === 'PAUSED';
  const breakUntil = snapshot?.doctor?.breakUntil ? new Date(snapshot.doctor.breakUntil) : null;
  const breakActive = isPaused && breakUntil && breakUntil.getTime() > Date.now();

  return (
    <>
      <Header
        title={snapshot?.doctor?.clinic?.name ?? 'Doctor'}
        subtitle={snapshot?.doctor?.department?.name}
      />
      <main className="mx-auto max-w-4xl px-4 py-5 space-y-4 animate-fade-in">
        {linkError && (
          <div className="card p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
            {linkError}
          </div>
        )}

        {/* Tab bar */}
        <div className="tabs-bar">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={'tab ' + (tab === 'queue' ? 'tab-active' : 'tab-inactive')}
          >
            Queue
            <span className="ml-1.5 opacity-70 text-xs">
              ({waiting.length}{current ? ' +1' : ''})
            </span>
          </button>
          {user?.clinicId && (
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={'tab ' + (tab === 'staff' ? 'tab-active' : 'tab-inactive')}
            >
              Staff
              <span className="ml-1.5 opacity-70 text-xs">({recList.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('history')}
            className={'tab ' + (tab === 'history' ? 'tab-active' : 'tab-inactive')}
          >
            History
          </button>
        </div>

        {/* ── Queue tab ── */}
        {tab === 'queue' && (
          <>
            {/* Break / pause banner */}
            {isPaused && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                    <span>{breakActive ? '☕' : '⏸'}</span>
                    {breakActive
                      ? `On break — returning at ~${breakUntil!.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Queue is paused — new patients are on hold'
                    }
                  </div>
                  <button type="button" onClick={() => doctorAction('resume')} className="btn-secondary !py-1 !px-3 text-xs shrink-0">
                    Resume
                  </button>
                </div>
                {snapshot?.doctor?.breakNote && (
                  <div className="text-xs text-amber-700 pl-6">{snapshot.doctor.breakNote}</div>
                )}
              </div>
            )}

            {/* Current patient card */}
            <section className={`card overflow-hidden ${current ? 'ring-2 ring-emerald-300/60 shadow-md' : ''}`}>
              {/* Section header */}
              <div className={`px-5 py-3.5 border-b border-slate-100 flex items-center justify-between ${current ? 'bg-gradient-to-r from-emerald-50 to-teal-50' : 'bg-slate-50'}`}>
                <div>
                  <h2 className="section-title">{current ? 'In consultation' : 'Consultation'}</h2>
                  {snapshot?.doctor && !isPaused && (
                    <p className="section-sub">Avg {snapshot.doctor.avgConsultMinutes} min/patient</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isPaused && (
                    <button
                      type="button"
                      onClick={() => setShowBreakForm((v) => !v)}
                      className="btn-ghost !py-1 !px-2.5 text-xs text-slate-500"
                    >
                      {showBreakForm ? 'Cancel' : '☕ Break'}
                    </button>
                  )}
                  <LiveIndicator connected={connected} />
                </div>
              </div>

              {/* Inline break form — appears when ☕ Break is clicked */}
              {showBreakForm && (
                <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
                  <div className="text-sm font-semibold text-amber-800 mb-3">Schedule a break</div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <label className="flex flex-col gap-1 text-xs text-slate-600">
                      <span>Duration (min)</span>
                      <input
                        type="number"
                        min={1}
                        max={480}
                        value={breakMinutes}
                        onChange={(e) => setBreakMinutes(Math.max(1, Number(e.target.value)))}
                        className="input !py-1.5 w-24 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-600 flex-1 min-w-0">
                      <span>Note (optional)</span>
                      <input
                        type="text"
                        value={breakNote}
                        onChange={(e) => setBreakNote(e.target.value)}
                        placeholder="e.g. Lunch, will return at 1 PM"
                        className="input !py-1.5 text-sm"
                      />
                    </label>
                    <button type="button" onClick={startBreak} className="btn-primary !py-1.5 !px-4 text-sm shrink-0">
                      Start break
                    </button>
                  </div>
                </div>
              )}

              <div className="p-5">
                {current ? (
                  <div className="space-y-4">
                    {/* Patient hero */}
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 font-bold text-xl shrink-0 shadow-inner">
                        #{current.tokenNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xl font-bold text-slate-900 leading-tight">{current.patient?.name}</div>
                        <div className="text-sm text-slate-500 mt-0.5">{current.patient?.phone}</div>
                        {current.startedAt && (
                          <div className="text-xs text-slate-400 mt-1">
                            Consulting for{' '}
                            <span className="font-medium text-slate-600">
                              {Math.round((Date.now() - new Date(current.startedAt).getTime()) / 60_000)} min
                            </span>
                          </div>
                        )}
                        {current.notes && (
                          <div className="mt-2 text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 max-w-sm">
                            📝 {current.notes}
                          </div>
                        )}
                        {current.priority >= 100 && (
                          <span className="inline-flex mt-1 pill bg-rose-100 text-rose-700 ring-rose-200">🚨 Emergency</span>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                        <button type="button" onClick={() => completeEntry(current.id)} className="btn-success">
                          ✓ Mark complete
                        </button>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => missEntry(current.id)} className="btn-secondary text-rose-500 hover:bg-rose-50 border-rose-200 flex-1" title="Patient didn't appear — add to missed queue">
                            Missed
                          </button>
                          <button type="button" onClick={() => cancelEntry(current.id)} className="btn-secondary text-slate-500 hover:bg-slate-50 flex-1" title="Remove patient from queue">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Next up strip */}
                    {nextUp && (
                      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between text-sm">
                        <span className="text-slate-500">
                          Next:{' '}
                          <strong className="text-slate-800">
                            #{nextUp.tokenNumber} — {nextUp.patient?.name}
                          </strong>
                        </span>
                        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                          {waiting.length} waiting
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* No current patient */
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      {waiting.length > 0 ? (
                        <>
                          <div className="font-medium text-slate-700">Ready when you are</div>
                          <div className="text-sm text-slate-500 mt-0.5">
                            Next:{' '}
                            <strong className="text-slate-700">
                              #{nextUp?.tokenNumber} — {nextUp?.patient?.name}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-3 text-slate-500">
                          <span className="text-2xl">✨</span>
                          <span>Queue is clear for now</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={callNext}
                        disabled={waiting.length === 0}
                        className="btn-primary disabled:opacity-40 flex-1 sm:flex-none"
                      >
                        Call next patient
                        {waiting.length > 0 && (
                          <span className="ml-1 bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5">
                            {waiting.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Waiting list */}
            <section className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h2 className="section-title">
                  Waiting
                  <span className="ml-2 text-sm font-normal text-slate-400">({waiting.length})</span>
                </h2>
                {snapshot?.movingAvgMinutes != null && (
                  <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                    ~{Math.round(snapshot.movingAvgMinutes)} min/patient
                  </span>
                )}
              </div>

              {waiting.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-4xl mb-2">📭</div>
                  <div className="text-sm text-slate-500">No patients waiting</div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {waiting.map((e, idx) => (
                    <div key={e.id} className={`px-5 py-3.5 flex items-center gap-3 transition-colors ${idx === 0 ? 'bg-brand-50/40' : 'hover:bg-slate-50'}`}>
                      {/* Position badge */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {idx + 1}
                      </div>
                      {/* Token */}
                      <div className="font-mono font-bold text-slate-800 text-base w-12 shrink-0">
                        #{e.tokenNumber}
                      </div>
                      {/* Patient info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
                          {e.patient?.name}
                          {idx === 0 && (
                            <span className="pill bg-brand-100 text-brand-700 ring-brand-200 text-[10px]">next</span>
                          )}
                          {e.priority >= 100 && (
                            <span className="pill bg-rose-100 text-rose-700 ring-rose-200 text-[10px]">🚨 Emergency</span>
                          )}
                          {e.walkin && (
                            <span className="pill bg-brand-100 text-brand-700 ring-brand-200 text-[10px]">Walk-in</span>
                          )}
                          {e.slotType === 'FOLLOWUP' && (
                            <span className="pill bg-purple-100 text-purple-700 ring-purple-200 text-[10px]">Follow-up</span>
                          )}
                        </div>
                        {e.notes && (
                          <div className="text-xs text-slate-400 truncate mt-0.5">{e.notes}</div>
                        )}
                      </div>
                      {/* ETA — absolute time (Feature 5) */}
                      <div className="text-right text-xs text-slate-500 shrink-0">
                        <div className="font-medium text-slate-700">~{e.etaMinutes} min</div>
                        {e.etaAbsolute && (
                          <div className="text-slate-400">
                            {new Date(e.etaAbsolute).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <EntryStatusPill status={e.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ── Staff tab ── */}
        {tab === 'staff' && user?.clinicId && (
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="section-title">Reception staff</h2>
              <p className="section-sub">
                Add a receptionist — a temporary password is shown once, copy it before closing.
              </p>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Add form */}
                <form onSubmit={addReceptionist} className="space-y-3 lg:col-span-2 card-inset p-4 h-fit rounded-xl">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs font-bold">+</span>
                    New receptionist
                  </h3>
                  <input
                    className="input"
                    placeholder="Full name"
                    value={recName}
                    onChange={(e) => setRecName(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    type="email"
                    placeholder="Email (for login)"
                    value={recEmail}
                    onChange={(e) => setRecEmail(e.target.value)}
                  />
                  <PhoneInput
                    label={null}
                    value={recPhone}
                    onChange={(raw, result) => { setRecPhone(raw); setRecPhoneResult(result); }}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    At least one of email or mobile is required.
                  </p>
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={recBusy || (!recEmail && !recPhoneResult.ok)}
                  >
                    {recBusy ? 'Adding…' : 'Add receptionist'}
                  </button>
                </form>

                {/* List */}
                <div className="lg:col-span-3">
                  {recList.length === 0 ? (
                    <div className="py-12 text-center rounded-xl ring-1 ring-slate-200 bg-slate-50">
                      <div className="text-4xl mb-2">👤</div>
                      <p className="text-sm text-slate-500">No receptionists yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 overflow-hidden">
                      {recList.map((r, idx) => (
                        <div key={r.id} className={`px-4 py-3.5 flex items-center justify-between gap-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">{r.name}</div>
                            <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                              {r.email && <span>{r.email}</span>}
                              {r.email && r.phone && <span>·</span>}
                              {r.phone && <span>{r.phone}</span>}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── History tab ── */}
        {tab === 'history' && (
          <section className="card p-5">
            <QueueHistoryTable doctorName={snapshot?.doctor?.user?.name} />
          </section>
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
    </>
  );
}
