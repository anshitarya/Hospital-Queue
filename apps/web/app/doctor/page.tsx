'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, ApiError, type Clinic, type Doctor, type Snapshot } from '@/lib/api';
import { tokenDisplay } from '@/lib/tokenCode';
import { useDoctorQueue } from '@/lib/socket';
import { useOptimisticSnapshot } from '@/lib/useOptimisticSnapshot';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
import { QueueHistoryTable } from '@/components/QueueHistoryTable';
import { LeavesTab } from '@/components/LeavesTab';
import { EntryStatusPill, LiveIndicator } from '@/components/StatusPill';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import {
  DoctorCredentialsModal,
  type DoctorCredentials,
} from '@/components/DoctorCredentialsModal';
import { formatTimeIst, serviceDay, serviceDaysAgo, formatDateIst } from '@/lib/datetime';
import { getLabels } from '@/lib/labels';

interface ReceptionistRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export default function DoctorPage() {
  const { user, ready } = useRequireRole(['DOCTOR', 'ADMIN', 'RECEPTIONIST', 'CLINIC_ADMIN']);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [tab, setTab] = useTabState<'queue' | 'staff' | 'history' | 'leaves'>('queue', ['queue', 'staff', 'history', 'leaves']);

  // Break form state (Feature 4)
  const [showBreakForm, setShowBreakForm] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('15');
  const [breakNote, setBreakNote] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Transfer states
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [destDoctorId, setDestDoctorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferWalkin, setTransferWalkin] = useState(false);
  const [transferSlotType, setTransferSlotType] = useState<'NEW' | 'FOLLOWUP'>('NEW');
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);

  const [recList, setRecList] = useState<ReceptionistRow[]>([]);
  const [recName, setRecName] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoneResult, setRecPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [recBusy, setRecBusy] = useState(false);
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  // All Records tab
  const TODAY_STR = serviceDay();
  const SEVEN_AGO_STR = serviceDaysAgo(6);
  const [recordsFrom, setRecordsFrom] = useState(SEVEN_AGO_STR);
  const [recordsTo, setRecordsTo]     = useState(TODAY_STR);
  const [recordsData, setRecordsData] = useState<RecordsResponse | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(false);

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

  const loadRecords = useCallback(async (from: string, to: string, dId: string) => {
    setRecordsLoading(true);
    try {
      const data = await api<RecordsResponse>(`/clinics/my/history?doctorId=${dId}&from=${from}&to=${to}&limit=500`);
      setRecordsData(data);
    } catch {
      /* ignore */
    } finally {
      setRecordsLoading(false);
    }
  }, []);

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
    if (tab === 'history' && doctorId) void loadRecords(recordsFrom, recordsTo, doctorId);
  }, [tab, doctorId, recordsFrom, recordsTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !user) return;
    if (!user.clinicId) {
      setLinkError(
        user.role === 'ADMIN'
          ? 'No clinic assigned. Open a clinic from the admin panel first.'
          : 'No clinic assigned to your account.',
      );
      return;
    }
    api<Clinic>('/clinics/my')
      .then((clinic) => {
        const all = clinic.doctors ?? [];
        setDoctorsList(all);
        const me = all.find((d) => d.userId === user.id);
        if (me) {
          setDoctorId(me.id);
        } else if (user.role === 'ADMIN' || user.role === 'RECEPTIONIST' || user.role === 'CLINIC_ADMIN') {
          if (all.length > 0) setDoctorId(all[0].id);
          else setLinkError('No doctors configured yet.');
        } else {
          setLinkError('No doctor profile linked to your account.');
        }
      })
      .catch((err) => {
        setLinkError(
          err instanceof ApiError ? err.message : 'Failed to load doctor profile.',
        );
      });
  }, [ready, user]);

  const { snapshot: liveSnapshot, connected } = useDoctorQueue(doctorId);
  const { display: snapshot, applyOptimistic, revertOptimistic } = useOptimisticSnapshot(liveSnapshot);

  const callAction = useCallback((
    fn: () => Promise<unknown>,
    label: string,
    patcher?: (s: Snapshot) => Snapshot,
  ) => {
    if (patcher) applyOptimistic(patcher);
    fn().catch((err) => {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setToast({ type: 'err', msg: `${label} failed: ${msg}` });
      revertOptimistic();
    });
  }, [applyOptimistic, revertOptimistic]);

  // Derived state — must be before any early returns so hooks (useMemo) count stays constant.
  const current = snapshot?.entries.find((e) => e.status === 'IN_CONSULTATION');
  const waiting = (snapshot?.entries ?? []).filter((e) => e.status === 'WAITING');
  const nextUp = waiting[0];
  const isPaused = snapshot?.doctor?.status === 'PAUSED';
  const orderMap = useMemo(
    () => new Map(waiting.map((e, i) => [e.id, i + 1])),
    [waiting],
  );
  const breakUntil = snapshot?.doctor?.breakUntil ? new Date(snapshot.doctor.breakUntil) : null;
  const breakActive = isPaused && breakUntil && breakUntil.getTime() > Date.now();
  const L = getLabels(snapshot?.doctor?.clinic?.businessType);

  if (!ready) return <PageLoader label="Loading your panel…" />;

  const callNext = () =>
    callAction(
      () => api(`/queue/doctor/${doctorId}/call-next`, { method: 'POST' }),
      'Call next',
      (s) => {
        const first = s.entries.find(e => e.status === 'WAITING');
        if (!first) return s;
        return {
          ...s,
          currentToken: first.tokenNumber,
          entries: s.entries.map(e =>
            e.id === first.id ? { ...e, status: 'IN_CONSULTATION' as const } : e
          ),
        };
      },
    );

  const completeEntry = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/complete`, { method: 'POST' }),
      'Complete',
      (s) => ({
        ...s,
        currentToken: s.entries.find((e) => e.id === id)?.status === 'IN_CONSULTATION' ? null : s.currentToken,
        entries: s.entries.filter((e) => e.id !== id),
      }),
    );

  const cancelEntry = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/cancel`, { method: 'POST' }),
      'Cancel',
      (s) => ({ ...s, entries: s.entries.map(e => e.id === id ? { ...e, status: 'CANCELLED' as const } : e) }),
    );

  const missEntry = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/miss`, { method: 'POST' }),
      'Mark missed',
      (s) => ({ ...s, entries: s.entries.map(e => e.id === id ? { ...e, status: 'MISSED' as const } : e) }),
    );

  const transferEntry = () => {
    if (!destDoctorId || !current) return;
    callAction(
      () => api(`/queue/entry/${current.id}/transfer`, {
        method: 'POST',
        body: {
          destinationDoctorId: destDoctorId,
          transferReason: transferReason || undefined,
          walkin: transferWalkin,
          slotType: transferSlotType,
        }
      }),
      'Transfer patient',
      (s) => ({
        ...s,
        entries: s.entries.filter((e) => e.id !== current.id),
      }),
    );
    setShowTransferForm(false);
    setDestDoctorId('');
    setTransferReason('');
    setTransferWalkin(false);
    setTransferSlotType('NEW');
  };

  const doctorAction = (action: 'pause' | 'resume') =>
    callAction(
      () => api(`/queue/doctor/${doctorId}/${action}`, { method: 'POST' }),
      action,
      (s) => ({
        ...s,
        doctor: s.doctor
          ? { ...s.doctor, status: (action === 'pause' ? 'PAUSED' : 'AVAILABLE') as typeof s.doctor.status }
          : s.doctor,
      }),
    );

  const startBreak = () => {
    const mins = Math.max(1, parseInt(breakMinutes, 10) || 1);
    callAction(
      () => api(`/queue/doctor/${doctorId}/break`, { method: 'POST', body: { estimatedMinutes: mins, note: breakNote || undefined } }),
      'Start break',
      (s) => ({
        ...s,
        doctor: s.doctor ? { ...s.doctor, status: 'PAUSED' as const } : s.doctor,
      }),
    );
    setShowBreakForm(false);
    setBreakMinutes('15');
    setBreakNote('');
  };

  const clearQueue = (includeMissed: boolean) => {
    setShowClearConfirm(false);
    callAction(
      () => api(`/queue/doctor/${doctorId}/clear-queue`, { method: 'POST', body: { includeMissed } }),
      'Clear queue',
      (s) => ({
        ...s,
        entries: s.entries.map(e =>
          e.status === 'WAITING' ? { ...e, status: 'CANCELLED' as const } : e
        ),
        missedEntries: includeMissed ? [] : s.missedEntries,
      }),
    );
  };

  const cancelSelected = () => {
    const ids = Array.from(selectedIds);
    setSelectMode(false);
    setSelectedIds(new Set());
    callAction(
      () => api('/queue/entries/cancel-many', { method: 'POST', body: { entryIds: ids } }),
      'Cancel selected',
      (s) => ({
        ...s,
        entries: s.entries.map(e => ids.includes(e.id) ? { ...e, status: 'CANCELLED' as const } : e),
      }),
    );
  };


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
          {user?.role === 'DOCTOR' && (
            <button
              type="button"
              onClick={() => setTab('leaves')}
              className={'tab ' + (tab === 'leaves' ? 'tab-active' : 'tab-inactive')}
            >
              Leave / Break
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('history')}
            className={'tab ' + (tab === 'history' ? 'tab-active' : 'tab-inactive')}
          >
            All Records
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
                      ? `On break — returning at ~${formatTimeIst(breakUntil!)}`
                      : `Queue is paused — new ${L.customerPlural.toLowerCase()} are on hold`
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
              <div className={`px-5 py-3.5 border-b border-slate-100 flex items-center justify-between ${current ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30' : 'bg-slate-50'}`}>
                <div>
                  <h2 className="section-title">{current ? L.inService : L.service}</h2>
                  {snapshot?.doctor && !isPaused && (
                    <p className="section-sub">Avg {snapshot.doctor.avgConsultMinutes} min/patient</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isPaused && (
                    <button
                      type="button"
                      onClick={() => setShowBreakForm((v) => !v)}
                      className={showBreakForm
                        ? 'btn-ghost !py-1 !px-2.5 text-xs text-slate-500'
                        : 'btn-secondary !py-1 !px-3 text-xs'}
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
                        onChange={(e) => setBreakMinutes(e.target.value)}
                        className="input !py-1.5 w-24 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      <div className="flex items-center justify-center h-14 min-w-[3.5rem] px-2 rounded-2xl bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0 shadow-inner tracking-wide">
                        {tokenDisplay(current.tokenNumber)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xl font-bold text-slate-900 leading-tight truncate">{current.patient?.name}</div>
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
                          <div className="mt-2 text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 max-w-full">
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
                        <button type="button" onClick={() => setShowTransferForm((v) => !v)} className="btn-secondary text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                          Transfer patient
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

                    {/* Inline transfer form */}
                    {showTransferForm && (
                      <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-4 space-y-3 animate-enter">
                        <div className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Transfer patient to another professional</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-xs text-slate-600">
                            <span>Destination professional</span>
                            <select
                              value={destDoctorId}
                              onChange={(e) => setDestDoctorId(e.target.value)}
                              className="input w-full text-sm font-sans"
                            >
                              <option value="">Select professional...</option>
                              {doctorsList
                                .filter((d) => d.id !== doctorId)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.user.name} {d.department?.name ? `(${d.department.name})` : ''}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-600">
                            <span>Transfer Reason (optional)</span>
                            <input
                              type="text"
                              placeholder="e.g. Needs blood test"
                              value={transferReason}
                              onChange={(e) => setTransferReason(e.target.value)}
                              className="input w-full text-sm"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <div className="flex gap-5">
                            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                              <input
                                type="checkbox"
                                checked={transferWalkin}
                                onChange={(e) => setTransferWalkin(e.target.checked)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-slate-700 dark:text-slate-300">Walk-in</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                              <input
                                type="checkbox"
                                checked={transferSlotType === 'FOLLOWUP'}
                                onChange={(e) => setTransferSlotType(e.target.checked ? 'FOLLOWUP' : 'NEW')}
                                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-slate-700 dark:text-slate-300">Follow-up</span>
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={transferEntry}
                              disabled={!destDoctorId}
                              className="btn-primary !py-1.5 !px-4 text-sm"
                            >
                              Transfer
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowTransferForm(false)}
                              className="btn-ghost !py-1.5 !px-3 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Next up strip */}
                    {nextUp && (
                      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between text-sm">
                        <span className="text-slate-500">
                          Next:{' '}
                          <strong className="text-slate-800">
                            {tokenDisplay(nextUp.tokenNumber)} — {nextUp.patient?.name}
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
                              {nextUp ? tokenDisplay(nextUp.tokenNumber) : ''} — {nextUp?.patient?.name}
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
                        Call next {L.customer.toLowerCase()}
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
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="section-title">
                    Waiting
                    <span className="ml-2 text-sm font-normal text-slate-400">({waiting.length})</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {snapshot?.movingAvgMinutes != null && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                        ~{Math.round(snapshot.movingAvgMinutes)} min/patient
                      </span>
                    )}
                    {waiting.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }}
                        className={`btn-ghost !py-1 !px-2.5 text-xs ${selectMode ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : ''}`}
                      >
                        {selectMode ? 'Done' : 'Select'}
                      </button>
                    )}
                    {selectedIds.size > 0 && (
                      <button type="button" onClick={cancelSelected} className="btn-ghost !py-1 !px-2.5 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200">
                        Cancel {selectedIds.size}
                      </button>
                    )}
                    {!selectMode && (waiting.length > 0 || (snapshot?.missedEntries ?? []).length > 0) && (
                      <button type="button" onClick={() => setShowClearConfirm(true)} className="btn-ghost !py-1 !px-2.5 text-xs text-rose-600 hover:bg-rose-50">
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                {showClearConfirm && (
                  <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 space-y-2">
                    <p className="text-sm font-medium text-rose-800">Cancel all waiting {L.customerPlural.toLowerCase()}?</p>
                    <p className="text-xs text-rose-600">They will appear in history as Cancelled.</p>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => clearQueue(false)} className="btn-ghost !py-1 !px-3 text-xs text-rose-700 border border-rose-300 hover:bg-rose-100">
                        Clear waiting only
                      </button>
                      {(snapshot?.missedEntries ?? []).length > 0 && (
                        <button type="button" onClick={() => clearQueue(true)} className="btn-ghost !py-1 !px-3 text-xs text-rose-700 border border-rose-300 hover:bg-rose-100">
                          Clear waiting + missed
                        </button>
                      )}
                      <button type="button" onClick={() => setShowClearConfirm(false)} className="btn-ghost !py-1 !px-3 text-xs text-slate-500 ml-auto">
                        Cancel
                      </button>
                    </div>
                  </div>
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
                    <div key={e.id} className={`flex items-center transition-colors ${idx === 0 ? 'bg-brand-50/40' : 'hover:bg-slate-50'}`}>
                      {selectMode && (
                        <label className="flex items-center pl-4 pr-1 self-stretch cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={selectedIds.has(e.id)}
                            onChange={() => setSelectedIds(prev => {
                              const next = new Set(prev);
                              next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                              return next;
                            })}
                          />
                        </label>
                      )}
                    <div className="flex flex-1 items-center gap-3 px-5 py-3 min-w-0">
                      {/* Position badge */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {idx + 1}
                      </div>
                      {/* Token */}
                      <div className="font-mono font-bold text-slate-800 text-base w-12 shrink-0">
                        {tokenDisplay(e.tokenNumber)}
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
                            {formatTimeIst(e.etaAbsolute)}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <EntryStatusPill status={e.status} />
                      </div>
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
                            {formatDateIst(r.createdAt)}
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

        {/* ── Leave / Break tab ── */}
        {tab === 'leaves' && user?.role === 'DOCTOR' && (
          <LeavesTab setToast={setToast} />
        )}

        {/* ── All Records tab ── */}
        {tab === 'history' && (
          <AllRecordsTab
            from={recordsFrom}
            to={recordsTo}
            data={recordsData}
            loading={recordsLoading}
            onDateChange={(f, t) => { setRecordsFrom(f); setRecordsTo(t); }}
          />
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
    </>
  );
}

// ─── All Records tab types ────────────────────────────────────────────────────

interface RecordEntry {
  id: string; tokenNumber: number; status: string;
  serviceDay: string; completedAt: string | null;
  patient: { name: string; phone: string };
  doctor: { name: string; department: string };
}
interface RecordSummary { completed: number; missed: number; cancelled: number; skipped: number; total: number }
interface RecordsResponse {
  entries: RecordEntry[]; total: number; page: number; pages: number;
  summary: RecordSummary;
}
interface TrendPoint { date: string; label: string; completed: number; missed: number; cancelled: number; skipped: number; total: number }

// ─── All Records tab ──────────────────────────────────────────────────────────

type RecStatusFilter = 'ALL' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SKIPPED';

function AllRecordsTab({
  from, to, data, loading, onDateChange,
}: {
  from: string; to: string;
  data: RecordsResponse | null;
  loading: boolean;
  onDateChange: (f: string, t: string) => void;
}) {
  const TODAY = serviceDay();
  const daysAgo = (n: number) => serviceDaysAgo(n);

  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<RecStatusFilter>('ALL');

  const presets = [
    { label: 'Today', from: TODAY,       to: TODAY },
    { label: '7d',    from: daysAgo(6),  to: TODAY },
    { label: '30d',   from: daysAgo(29), to: TODAY },
    { label: '3 mo',  from: daysAgo(89), to: TODAY },
  ];

  const summary = data?.summary ?? { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 };

  const filtered = (data?.entries ?? []).filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.patient.name.toLowerCase().includes(q) && !String(e.tokenNumber).includes(q)) return false;
    }
    return true;
  });

  // Build trend points from loaded entries (client-side grouping)
  const trendPoints: TrendPoint[] = (() => {
    const map = new Map<string, TrendPoint>();
    for (const e of data?.entries ?? []) {
      if (!map.has(e.serviceDay)) {
        const label = formatDateIst(`${e.serviceDay}T12:00:00+05:30`, { month: 'short', day: 'numeric' });
        map.set(e.serviceDay, { date: e.serviceDay, label, completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 });
      }
      const p = map.get(e.serviceDay)!;
      p.total++;
      if (e.status === 'COMPLETED') p.completed++;
      else if (e.status === 'MISSED') p.missed++;
      else if (e.status === 'CANCELLED') p.cancelled++;
      else if (e.status === 'SKIPPED') p.skipped++;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const statusColors: Record<string, string> = {
    COMPLETED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
    MISSED:    'text-amber-700 bg-amber-50 dark:bg-amber-900/30',
    CANCELLED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30',
    SKIPPED:   'text-slate-600 bg-slate-100 dark:bg-slate-700',
  };

  const statusBtns: { value: RecStatusFilter; label: string; color: string }[] = [
    { value: 'ALL',       label: 'All',       color: 'bg-slate-700 text-white' },
    { value: 'COMPLETED', label: 'Completed', color: 'bg-emerald-600 text-white' },
    { value: 'MISSED',    label: 'Missed',    color: 'bg-amber-500 text-white' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-rose-500 text-white' },
    { value: 'SKIPPED',   label: 'Skipped',   color: 'bg-slate-500 text-white' },
  ];

  const hasFilters = search || statusFilter !== 'ALL';

  return (
    <div className="p-4 space-y-4">

      {/* ── Filter bar ── */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {presets.map((pr) => (
              <button key={pr.label} type="button" onClick={() => onDateChange(pr.from, pr.to)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  from === pr.from && to === pr.to
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}>{pr.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <input type="date" value={from} max={to} onChange={(e) => onDateChange(e.target.value, to)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={to} min={from} max={TODAY} onChange={(e) => onDateChange(from, e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="text" placeholder="Search patient…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                className="text-xs text-rose-500 hover:text-rose-600 whitespace-nowrap">Clear</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <div className="flex gap-1 flex-wrap">
            {statusBtns.map(({ value, label, color }) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity ${
                  statusFilter === value ? color : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {loading ? (
          <div className="col-span-5 py-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <>
            <RecStatCard label="Total"     value={summary.total}     color="teal"  />
            <RecStatCard label="Completed" value={summary.completed} color="green" />
            <RecStatCard label="Missed"    value={summary.missed}    color="amber" />
            <RecStatCard label="Cancelled" value={summary.cancelled} color="red"   />
            <RecStatCard label="Skipped"   value={summary.skipped}   color="slate" />
          </>
        )}
      </div>

      {/* ── Trend chart ── */}
      {!loading && trendPoints.length > 1 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Visit Trend</h3>
            <div className="flex items-center gap-3">
              <RecLegendDot color="#14b8a6" label="Completed" />
              <RecLegendDot color="#f59e0b" label="Missed"    />
              <RecLegendDot color="#ef4444" label="Cancelled" />
            </div>
          </div>
          <RecTrendChart points={trendPoints} />
        </div>
      )}

      {/* ── Entries table ── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading records…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            {hasFilters ? 'No entries match your filters.' : 'No visit records for this period.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/40">
                <tr>
                  {['Token', 'Date', 'Patient', 'Phone', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">#{e.tokenNumber}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{e.serviceDay}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{e.patient.name}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">{e.patient.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[e.status] ?? 'text-slate-500 bg-slate-100'}`}>
                        {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── All Records sub-components ───────────────────────────────────────────────

function RecStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/40 text-teal-700 dark:text-teal-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    red:   'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
    slate: 'bg-slate-50 dark:bg-slate-700/40 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${cls[color] ?? cls.slate}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function RecLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function RecTrendChart({ points }: { points: TrendPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ idx: number; screenX: number; screenY: number } | null>(null);

  const W = 700; const H = 200;
  const pad = { t: 10, r: 20, b: 36, l: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const maxVal = Math.max(...points.flatMap((p) => [p.completed, p.missed, p.cancelled]), 1);
  const step   = cW / Math.max(points.length - 1, 1);
  const toX    = (i: number) => pad.l + i * step;
  const toY    = (v: number) => pad.t + cH - (v / maxVal) * cH;
  const tickCount = Math.min(maxVal, 5);
  const yTicks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];
  const line = (key: 'completed' | 'missed' | 'cancelled') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p[key]).toFixed(1)}`).join(' ');
  const series: Array<{ key: 'completed' | 'missed' | 'cancelled'; color: string }> = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed',    color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
  ];
  const labelEvery = points.length > 20 ? Math.ceil(points.length / 10) : 1;
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx  = Math.max(0, Math.min(points.length - 1, Math.round(relX * (points.length - 1))));
    setTip({ idx, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
  };
  const tipPoint = tip !== null ? points[tip.idx] : null;

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair"
        preserveAspectRatio="none" onMouseMove={handleMouseMove}>
        {yTicks.map((v) => {
          const y = toY(v);
          return <g key={v}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">{v}</text>
          </g>;
        })}
        {tip !== null && (
          <line x1={toX(tip.idx)} y1={pad.t} x2={toX(tip.idx)} y2={pad.t + cH}
            stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 2" />
        )}
        {series.map(({ key, color }) => (
          <path key={key} d={line(key)} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map(({ key, color }) =>
          points.map((p, i) => (
            <circle key={`${key}-${i}`} cx={toX(i)} cy={toY(p[key])} r={tip?.idx === i ? 4 : 2.5}
              fill={color} stroke="white" strokeWidth="1.5" style={{ transition: 'r 0.1s' }} />
          ))
        )}
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={toX(i)} y={H - 4} textAnchor="middle" className="fill-slate-400" fontSize="8">{p.label}</text>
        ))}
      </svg>
      {tip !== null && tipPoint && (
        <div className="absolute pointer-events-none z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs"
          style={{ left: tip.screenX > 500 ? tip.screenX - 140 : tip.screenX + 12, top: Math.max(4, tip.screenY - 60) }}>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{tipPoint.label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />Completed</span><span className="font-bold text-teal-600">{tipPoint.completed}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Missed</span><span className="font-bold text-amber-600">{tipPoint.missed}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Cancelled</span><span className="font-bold text-red-600">{tipPoint.cancelled}</span></div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-1 mt-1"><span className="text-slate-500">Total</span><span className="font-bold text-slate-700 dark:text-slate-200">{tipPoint.total}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
