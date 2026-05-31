'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError, type Doctor } from '@/lib/api';
import { useDoctorQueue } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
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

  // Page tabs. The default ("queue") matches what doctors do 95% of the time;
  // the staff onboarding flow lives behind its own tab so it never clutters
  // the consultation view. Persisted via `?tab=` so refresh keeps the user
  // on whichever tab they were on.
  const [tab, setTab] = useTabState<'queue' | 'staff'>('queue', ['queue', 'staff']);

  // ── Add-receptionist state (doctors can onboard their own clinic's reception) ──
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
    // Only refresh the receptionist list once the role guard has settled and
    // the user is confirmed in-clinic. Otherwise we'd fire requests before
    // the auth header is populated and they'd 401.
    if (ready && user?.clinicId) loadReceptionists();
  }, [ready, user?.clinicId, loadReceptionists]);

  async function addReceptionist(e: React.FormEvent) {
    e.preventDefault();
    if (!recEmail && !recPhoneResult.ok) {
      setToast({
        type: 'err',
        msg: 'Provide either an email or a valid mobile number for the receptionist.',
      });
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
      setRecName('');
      setRecEmail('');
      setRecPhone('');
      setRecPhoneResult({ ok: false });
      setCreds({
        role: 'receptionist',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        tempPassword: result.tempPassword,
      });
      await loadReceptionists();
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to add receptionist',
      });
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
        setLinkError('No doctor profile is linked to your account.');
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
  const skipEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/skip`, { method: 'POST' }), 'Skip');
  const doctorAction = (action: 'pause' | 'resume') =>
    call(() => api(`/queue/doctor/${doctorId}/${action}`, { method: 'POST' }), action);

  const current = snapshot?.entries.find((e) => e.status === 'IN_CONSULTATION');
  const waiting = (snapshot?.entries ?? []).filter((e) => e.status === 'WAITING');
  const nextUp = waiting[0];

  return (
    <>
      {/* Show the clinic name as the primary identity in the nav bar; the
          department becomes the subtitle. Until the queue snapshot loads we
          fall back to "Doctor" so the header never appears empty. */}
      <Header
        title={snapshot?.doctor?.clinic?.name ?? 'Doctor'}
        subtitle={snapshot?.doctor?.department?.name}
      />
      <main className="mx-auto max-w-5xl p-4 space-y-4 animate-fade-in">
        {linkError && (
          <div className="card p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {linkError}
          </div>
        )}

        {/* Tab bar — Queue is the everyday surface; Staff lives behind a tab
            so the form/list doesn't compete with the consultation view. */}
        <div className="flex gap-1 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={'tab ' + (tab === 'queue' ? 'tab-active' : 'tab-inactive')}
          >
            Queue{' '}
            <span className="opacity-60">
              ({waiting.length}
              {current ? ' + 1 in consult' : ''})
            </span>
          </button>
          {/* The Staff tab is only meaningful for clinic staff (DOCTOR /
              RECEPTIONIST / ADMIN) — same access rules as the underlying
              endpoint. We render it whenever the user has a clinic. */}
          {user?.clinicId && (
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={'tab ' + (tab === 'staff' ? 'tab-active' : 'tab-inactive')}
            >
              Reception staff <span className="opacity-60">({recList.length})</span>
            </button>
          )}
        </div>

        {tab === 'queue' && (
          <>

        {/* ── Currently in consultation ───────────────────────────────────────── */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Consultation</h2>
            <div className="flex items-center gap-3">
              {snapshot?.doctor && (
                snapshot.doctor.status === 'PAUSED' ? (
                  <span className="pill bg-amber-100 text-amber-800 ring-amber-200">
                    Queue paused
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    Avg {snapshot.doctor.avgConsultMinutes} min/patient
                  </span>
                )
              )}
              <LiveIndicator connected={connected} />
            </div>
          </div>

          {current ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wider text-emerald-700 mb-1 font-medium">
                    In consultation
                  </div>
                  <div className="text-6xl font-bold text-emerald-700">#{current.tokenNumber}</div>
                  <div className="mt-2 text-lg font-medium">{current.patient?.name}</div>
                  <div className="text-sm text-slate-500">{current.patient?.phone}</div>
                  {current.notes && (
                    <div className="mt-2 text-sm text-slate-600 bg-slate-50 rounded px-3 py-2 max-w-md">
                      {current.notes}
                    </div>
                  )}
                  {current.startedAt && (
                    <div className="text-xs text-slate-400 mt-2">
                      Started{' '}
                      {Math.round(
                        (Date.now() - new Date(current.startedAt).getTime()) / 60_000,
                      )}{' '}
                      min ago
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => completeEntry(current.id)}
                    className="btn-primary"
                  >
                    Mark complete
                  </button>
                  <button
                    type="button"
                    onClick={() => skipEntry(current.id)}
                    className="btn-secondary"
                  >
                    Skip patient
                  </button>
                </div>
              </div>

              {nextUp && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    Next up:{' '}
                    <strong className="text-slate-700">
                      #{nextUp.tokenNumber} — {nextUp.patient?.name}
                    </strong>
                  </span>
                  <span className="text-slate-400">{waiting.length} waiting</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                {waiting.length > 0 ? (
                  <>
                    <div className="text-slate-600">Ready when you are.</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      Next: <strong>#{nextUp?.tokenNumber} — {nextUp?.patient?.name}</strong>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500">No patients waiting right now.</div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={callNext}
                  disabled={waiting.length === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  Start consultation ({waiting.length} waiting)
                </button>
                {snapshot?.doctor && (
                  snapshot.doctor.status === 'PAUSED' ? (
                    <button type="button" onClick={() => doctorAction('resume')} className="btn-secondary">
                      Resume queue
                    </button>
                  ) : (
                    <button type="button" onClick={() => doctorAction('pause')} className="btn-secondary">
                      Pause queue
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Waiting list ───────────────────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">
            Waiting{' '}
            <span className="text-slate-400 font-normal">({waiting.length})</span>
          </h2>

          {waiting.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-1">✨</div>
              <div className="text-sm text-slate-500">Queue is clear.</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {waiting.map((e, idx) => (
                <div key={e.id} className="py-3 flex items-center gap-3">
                  <div className="w-10 text-center text-lg font-bold shrink-0">
                    #{e.tokenNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {e.patient?.name}
                      {idx === 0 && (
                        <span className="pill bg-brand-100 text-brand-700 ring-brand-200 text-[10px]">
                          next
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                      {e.priority >= 100 && <span className="text-rose-600 font-semibold">EMERGENCY</span>}
                      {e.priority === 50 && <span className="text-amber-600 font-semibold">VIP</span>}
                      {e.notes && <span className="truncate">{e.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 shrink-0">
                    <div className="font-medium">
                      {e.peopleAhead === 0 ? 'next' : `${e.peopleAhead} ahead`}
                    </div>
                    <div>~{e.etaMinutes} min</div>
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

        {/* ── Reception staff tab ────────────────────────────────────────────── */}
        {/* Onboarding form lives behind its own tab so the consultation view
            stays focused. Same temp-password modal handoff as everywhere else. */}
        {tab === 'staff' && user?.clinicId && (
          <section className="card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">Reception staff</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add a receptionist to your clinic. A temporary password is shown once —
                  copy it before closing the dialog.
                </p>
              </div>
              <span className="text-xs text-slate-400">{recList.length} receptionist(s)</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <form
                onSubmit={addReceptionist}
                className="space-y-2 lg:col-span-1 rounded-lg ring-1 ring-slate-200 p-4 bg-slate-50/40 h-fit"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">+</span>
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
                  onChange={(raw, result) => {
                    setRecPhone(raw);
                    setRecPhoneResult(result);
                  }}
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  At least one of email / mobile is required.
                </p>
                <button
                  type="submit"
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={recBusy || (!recEmail && !recPhoneResult.ok)}
                >
                  {recBusy ? 'Adding…' : 'Add receptionist'}
                </button>
              </form>

              <div className="lg:col-span-2">
                {recList.length === 0 ? (
                  <div className="py-10 text-center rounded-lg ring-1 ring-slate-200 bg-slate-50/40">
                    <div className="text-4xl mb-2">👤</div>
                    <p className="text-sm text-slate-500">
                      No receptionists yet. Use the form on the left to add the first one.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 px-3">
                    {recList.map((r) => (
                      <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                            {r.email && <span>{r.email}</span>}
                            {r.email && r.phone && <span>·</span>}
                            {r.phone && <span>{r.phone}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <DoctorCredentialsModal
        credentials={creds}
        onClose={() => setCreds(null)}
      />
    </>
  );
}
