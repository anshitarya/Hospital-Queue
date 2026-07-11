'use client';

/**
 * Self-contained queue management panel.
 *
 * Embeds the full receptionist queue workflow:
 *   • Doctor selector with live status
 *   • Add-patient form (name, phone, priority, walk-in, follow-up, position)
 *   • Live queue (real-time via socket, optimistic UI)
 *   • Per-entry actions: complete, miss, skip, cancel, emergency, move
 *   • Multi-select cancel
 *   • Clear queue (waiting-only or waiting + missed)
 *   • Missed-patients panel with rejoin
 *
 * Loads its own clinic data — no props required. Drop it anywhere a
 * receptionist or admin user is authenticated.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { api, ApiError, type QueueEntry, type Clinic, type Snapshot } from '@/lib/api';
import { useDoctorQueue } from '@/lib/socket';
import { useOptimisticSnapshot } from '@/lib/useOptimisticSnapshot';
import { tokenDisplay, matchesTokenSearch } from '@/lib/tokenCode';
import { Toast, type ToastMessage } from '@/components/Toast';
import { EntryStatusPill, DoctorStatusPill, LiveIndicator } from '@/components/StatusPill';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { DoctorCredentialsModal, type DoctorCredentials } from '@/components/DoctorCredentialsModal';
import { getLabels } from '@/lib/labels';
import { resolveAvgMinutes } from '@/lib/queueAvg';

function doctorStorageKey(clinicId: string) {
  return `turnos_selected_doctor_${clinicId}`;
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${String(y).slice(2)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function QueueManager() {
  // ── Clinic + doctor list ─────────────────────────────────────────────────
  const [clinic, setClinic]                   = useState<Clinic | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);

  // ── Add-patient form ────────────────────────────────────────────────────
  const [name, setName]                           = useState('');
  const [phone, setPhone]                         = useState('');
  const [phoneResult, setPhoneResult]             = useState<PhoneValidationResult>({ ok: false });
  // Previous visit lookup
  const [prevVisit, setPrevVisit] = useState<{ name: string; totalVisits: number; providers: { name: string; count: number; dates: string[] }[] } | null>(null);
  const [prevLookupPhone, setPrevLookupPhone] = useState('');
  const [priority, setPriority]                   = useState(0);
  const [notes, setNotes]                         = useState('');
  const [walkin, setWalkin]                       = useState(false);
  const [slotType, setSlotType]                   = useState<'NEW' | 'FOLLOWUP'>('NEW');
  const [insertAtPosition, setInsertAtPosition]   = useState<number | ''>('');

  // ── Queue interaction state ─────────────────────────────────────────────
  const [queueSearch, setQueueSearch]     = useState('');
  const [missedSearch, setMissedSearch]   = useState('');
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Modals / toasts ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  const L = getLabels(clinic?.businessType);

  // ── Previous-visit lookup ────────────────────────────────────────────────
  useEffect(() => {
    if (!phoneResult.ok || !phoneResult.e164) { setPrevVisit(null); return; }
    if (phoneResult.e164 === prevLookupPhone) return; // already fetched for this number
    setPrevLookupPhone(phoneResult.e164);
    api<{ name: string; totalVisits: number; providers: { name: string; count: number; dates: string[] }[] } | null>(
      `/clinics/my/patient-lookup?phone=${encodeURIComponent(phoneResult.e164)}`,
    ).then((data) => {
      setPrevVisit(data);
      // Auto-fill name if not yet typed
      if (data?.name && !name) setName(data.name);
    }).catch(() => setPrevVisit(null));
  }, [phoneResult.ok, phoneResult.e164]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load clinic ──────────────────────────────────────────────────────────
  const loadClinic = useCallback(async () => {
    try {
      const data = await api<Clinic>('/clinics/my');
      setClinic(data);
      const doctors = data.doctors ?? [];
      const saved =
        typeof window !== 'undefined'
          ? localStorage.getItem(doctorStorageKey(data.id))
          : null;
      const valid =
        saved && doctors.some((d) => d.id === saved) ? saved : doctors[0]?.id ?? null;
      setSelectedDoctorId(valid);
    } catch { /* ignore — page-level auth already guards this */ }
  }, []);

  const selectDoctor = useCallback((id: string) => {
    setSelectedDoctorId(id);
    if (clinic?.id) localStorage.setItem(doctorStorageKey(clinic.id), id);
  }, [clinic?.id]);

  useEffect(() => { void loadClinic(); }, [loadClinic]);

  // ── Real-time queue ──────────────────────────────────────────────────────
  const { snapshot: liveSnapshot, connected } = useDoctorQueue(selectedDoctorId);
  const { display: snapshot, applyOptimistic, revertOptimistic } = useOptimisticSnapshot(liveSnapshot);

  // Re-render avg label while a customer is in service (elapsed time ticks up).
  const [avgTick, setAvgTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAvgTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  const avgDisplay = useMemo(() => resolveAvgMinutes(snapshot), [snapshot, avgTick]);

  const allDoctors = useMemo(
    () => (clinic?.doctors ?? []).map((d) => ({ ...d, deptName: d.department?.name ?? '' })),
    [clinic],
  );

  // 1-based position map for WAITING entries (server sort order)
  const orderMap = useMemo(() => {
    const waiting = (snapshot?.entries ?? []).filter((e) => e.status === 'WAITING');
    return new Map(waiting.map((e, i) => [e.id, i + 1]));
  }, [snapshot?.entries]);

  // ── Optimistic action helper ─────────────────────────────────────────────
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

  // ── Add patient ──────────────────────────────────────────────────────────
  function addPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctorId) return;

    const e164          = phoneResult.e164 ?? phone;
    const capturedName  = name;
    const capturedWalkin = walkin;
    const capturedSlotType = slotType;
    const idemKey = `${selectedDoctorId}:${e164}:${Date.now() >> 14}`;
    const body = {
      doctorId: selectedDoctorId,
      patientName: capturedName,
      patientPhone: e164,
      priority,
      notes: notes || undefined,
      idempotencyKey: idemKey,
      walkin: capturedWalkin || undefined,
      slotType: capturedSlotType !== 'NEW' ? capturedSlotType : undefined,
      insertAtPosition: insertAtPosition !== '' ? insertAtPosition : undefined,
    };

    // Reset form immediately
    setName(''); setPhone(''); setPhoneResult({ ok: false }); setPriority(0); setNotes('');
    setWalkin(false); setSlotType('NEW'); setInsertAtPosition('');
    setPrevVisit(null); setPrevLookupPhone('');
    document.getElementById('qm-name')?.focus();

    const pendingId = `pending-${Date.now()}`;
    applyOptimistic((s) => ({
      ...s,
      entries: [
        ...s.entries,
        {
          id: pendingId,
          doctorId: selectedDoctorId!,
          patientId: 'pending',
          serviceDay: new Date().toISOString().split('T')[0],
          tokenNumber: 0,
          status: 'WAITING' as const,
          priority: body.priority ?? 0,
          notes: body.notes ?? null,
          joinedAt: new Date().toISOString(),
          patient: { id: 'pending', name: capturedName, phone: body.patientPhone ?? null },
          walkin: capturedWalkin,
          sortOrder: null,
          slotType: (capturedSlotType === 'FOLLOWUP' ? 'FOLLOWUP' : 'NEW') as QueueEntry['slotType'],
        },
      ],
    }));

    api<QueueEntry>('/queue/reception/join', { method: 'POST', body }).then((entry) => {
      const suffix = capturedWalkin ? ' (walk-in)' : capturedSlotType === 'FOLLOWUP' ? ' (follow-up)' : '';
      setToast({ type: 'ok', msg: `Token ${tokenDisplay(entry.tokenNumber)} assigned to ${capturedName}${suffix}` });
    }).catch((err) => {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : `Failed to add ${L.customer.toLowerCase()}` });
      revertOptimistic();
    });
  }

  // ── Doctor controls ──────────────────────────────────────────────────────
  const callNext = () =>
    callAction(
      () => api(`/queue/doctor/${selectedDoctorId}/call-next`, { method: 'POST' }),
      'Call next',
      (s) => {
        const first = s.entries.find((e) => e.status === 'WAITING');
        if (!first) return s;
        return {
          ...s,
          currentToken: first.tokenNumber,
          entries: s.entries.map((e) =>
            e.id === first.id ? { ...e, status: 'IN_CONSULTATION' as const } : e,
          ),
        };
      },
    );

  const controlDoctor = (action: 'pause' | 'resume') =>
    callAction(
      () => api(`/queue/doctor/${selectedDoctorId}/${action}`, { method: 'POST' }),
      action,
      (s) => ({
        ...s,
        doctor: s.doctor
          ? { ...s.doctor, status: (action === 'pause' ? 'PAUSED' : 'AVAILABLE') as typeof s.doctor.status }
          : s.doctor,
      }),
    );

  // ── Entry actions ────────────────────────────────────────────────────────
  const setEntryStatus = (id: string, action: 'complete' | 'skip' | 'cancel') =>
    callAction(
      () => api(`/queue/entry/${id}/${action}`, { method: 'POST' }),
      action,
      (s) => ({
        ...s,
        entries: s.entries.map((e) =>
          e.id === id
            ? { ...e, status: (action === 'complete' ? 'COMPLETED' : action === 'skip' ? 'SKIPPED' : 'CANCELLED') as typeof e.status }
            : e,
        ),
      }),
    );

  const markEmergency = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/reorder`, { method: 'POST', body: { priority: 100 } }),
      'Emergency',
      (s) => ({ ...s, entries: s.entries.map((e) => e.id === id ? { ...e, priority: 100 } : e) }),
    );

  const missEntry = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/miss`, { method: 'POST' }),
      'Mark missed',
      (s) => {
        const entry = s.entries.find((e) => e.id === id);
        return {
          ...s,
          entries: s.entries.filter((e) => e.id !== id),
          missedEntries: entry
            ? [...(s.missedEntries ?? []), { id: entry.id, tokenNumber: entry.tokenNumber, patient: entry.patient ?? null, completedAt: null, missedCount: 1 }]
            : s.missedEntries,
        };
      },
    );

  const rejoinEntry = (id: string) =>
    callAction(
      () => api(`/queue/entry/${id}/rejoin`, { method: 'POST' }),
      'Rejoin',
      (s) => {
        const missed = (s.missedEntries ?? []).find((e) => e.id === id);
        return {
          ...s,
          missedEntries: (s.missedEntries ?? []).filter((e) => e.id !== id),
          entries: [
            ...s.entries,
            {
              id: `pending-rejoin-${Date.now()}`,
              doctorId: s.doctor?.id ?? '',
              patientId: missed?.patient?.id ?? 'pending',
              serviceDay: new Date().toISOString().split('T')[0],
              tokenNumber: 0,
              status: 'WAITING' as const,
              priority: 0,
              notes: null,
              joinedAt: new Date().toISOString(),
              patient: missed?.patient ? { id: missed.patient.id, name: missed.patient.name, phone: missed.patient.phone ?? null } : null,
              walkin: false,
              sortOrder: null,
              slotType: 'NEW' as QueueEntry['slotType'],
            } as QueueEntry,
          ],
        };
      },
    );

  const moveEntry = (id: string, position: number) =>
    callAction(() => api(`/queue/entry/${id}/move`, { method: 'POST', body: { position } }), 'Move');

  const clearQueue = (includeMissed: boolean) => {
    setShowClearConfirm(false);
    const waitingCount = (snapshot?.entries ?? []).filter((e) => e.status === 'WAITING').length;
    const missedCount  = includeMissed ? (snapshot?.missedEntries ?? []).length : 0;
    callAction(
      () => api(`/queue/doctor/${selectedDoctorId}/clear-queue`, { method: 'POST', body: { includeMissed } }),
      'Clear queue',
      (s) => ({
        ...s,
        entries: s.entries.map((e) => e.status === 'WAITING' ? { ...e, status: 'CANCELLED' as const } : e),
        missedEntries: includeMissed ? [] : s.missedEntries,
      }),
    );
    if (waitingCount + missedCount > 0) {
      const n = waitingCount + missedCount;
      setToast({ type: 'ok', msg: `Cleared ${n} ${n === 1 ? L.customer.toLowerCase() : L.customerPlural.toLowerCase()}` });
    }
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
        entries: s.entries.map((e) => ids.includes(e.id) ? { ...e, status: 'CANCELLED' as const } : e),
        missedEntries: (s.missedEntries ?? []).filter((e) => !ids.includes(e.id)),
      }),
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Doctor selector */}
      {allDoctors.length > 0 ? (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select {L.provider.toLowerCase()}</span>
            <LiveIndicator connected={connected} />
          </div>
          <div className="flex flex-wrap gap-2">
            {allDoctors.map((d) => {
              const isSelected = selectedDoctorId === d.id;
              return (
                <button key={d.id} type="button" onClick={() => selectDoctor(d.id)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50 shadow-sm ring-2 ring-brand-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                  }`}>
                  <div className={`font-semibold truncate ${isSelected ? 'text-brand-700' : 'text-slate-800'}`}>
                    {d.user.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <DoctorStatusPill status={d.status} />
                    <span>{d.deptName || '—'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card p-4 text-sm text-slate-500 text-center">
          No {L.providerPlural.toLowerCase()} yet. Go to the <strong>Staff</strong> tab to add one.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Add-patient form */}
        <section className="card overflow-hidden lg:col-span-1">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="section-title">Add {L.customer.toLowerCase()}</h2>
            {snapshot?.doctor && <DoctorStatusPill status={snapshot.doctor.status} />}
          </div>
          <div className="p-5 space-y-3">
            <form onSubmit={addPatient} className="space-y-2.5">
              <PhoneInput
                label={null}
                value={phone}
                onChange={(raw, result) => {
                  setPhone(raw);
                  setPhoneResult(result);
                  if (!result.ok) { setPrevVisit(null); setPrevLookupPhone(''); }
                }}
                required
                autoComplete="off"
              />
              {prevVisit && (
                <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 px-3.5 py-2.5 flex items-start gap-3">
                  <span className="text-teal-600 text-base shrink-0 mt-0.5">↩</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-teal-800 dark:text-teal-300 truncate">{prevVisit.name}</div>
                    <div className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                      <span>{prevVisit.totalVisits} completed visit{prevVisit.totalVisits !== 1 ? 's' : ''}</span>
                      {prevVisit.providers.map((p) => (
                        <div key={p.name} className="mt-1.5">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-teal-500 dark:text-teal-500"> — {p.count} visit{p.count !== 1 ? 's' : ''}</span>
                          {p.dates.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {p.dates.map((d) => (
                                <span key={d} className="bg-teal-100 dark:bg-teal-800/40 rounded px-1.5 py-0.5 text-[10px] font-medium">{fmtShortDate(d)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <input
                id="qm-name"
                className="input"
                placeholder={`${L.customer} name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={0}>Normal priority</option>
                <option value={100}>🚨 Emergency (goes to top)</option>
              </select>
              {priority < 100 && (
                <div className="flex gap-4 py-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={walkin} onChange={(e) => setWalkin(e.target.checked)} />
                    <span className="text-slate-700">Walk-in</span>
                    <span className="text-[10px] text-slate-400">(near current)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      checked={slotType === 'FOLLOWUP'} onChange={(e) => setSlotType(e.target.checked ? 'FOLLOWUP' : 'NEW')} />
                    <span className="text-slate-700">Follow-up</span>
                  </label>
                </div>
              )}
              <textarea className="input resize-none" placeholder="Notes (optional)" rows={2}
                value={notes} onChange={(e) => setNotes(e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 whitespace-nowrap shrink-0">Position:</span>
                <input className="input flex-1" type="number" min={1} placeholder="Auto (end of queue)"
                  value={insertAtPosition}
                  onChange={(e) => setInsertAtPosition(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))} />
                <span className="text-xs text-slate-400 shrink-0">optional</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={!selectedDoctorId || !phoneResult.ok}>
                {insertAtPosition !== '' ? `+ Add at #${insertAtPosition}` : walkin ? '+ Walk-in (near current)' : '+ Add to queue'}
              </button>
            </form>

            {/* Doctor quick controls */}
            {snapshot?.doctor && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span>
                    {avgDisplay
                      ? avgDisplay.live
                        ? `~${avgDisplay.label} ${L.perCustomer} (live avg)`
                        : `${avgDisplay.label} ${L.perCustomer} (default)`
                      : null}
                  </span>
                  {snapshot.doctor.delayMinutes > 0 && (
                    <span className="text-amber-600 font-medium">+{snapshot.doctor.delayMinutes} min delay</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={callNext} className="btn-primary flex-1 !py-2 text-xs">
                    Call next
                  </button>
                  {snapshot.doctor.status === 'PAUSED' ? (
                    <button type="button" onClick={() => controlDoctor('resume')} className="btn-secondary !py-2 text-xs">Resume</button>
                  ) : (
                    <button type="button" onClick={() => controlDoctor('pause')} className="btn-secondary !py-2 text-xs">Pause</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Live queue */}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="section-title">
                Live queue
                {snapshot?.doctor && (
                  <span className="ml-2 text-sm font-normal text-slate-400">— {snapshot.doctor.user.name}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">Now serving</span>
                <span className="font-bold text-slate-800 font-mono text-sm">
                  {snapshot?.currentToken ? tokenDisplay(snapshot.currentToken) : '—'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <input type="search" placeholder="Search by name or phone…" value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)} className="input !py-1.5 text-xs flex-1" />
              <button type="button"
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={`btn-ghost !py-1 !px-2.5 text-xs shrink-0 ${selectMode ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : ''}`}>
                {selectMode ? 'Done' : 'Select'}
              </button>
              {selectedIds.size > 0 && (
                <button type="button" onClick={cancelSelected}
                  className="btn-ghost !py-1 !px-2.5 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 shrink-0">
                  Cancel {selectedIds.size}
                </button>
              )}
              {!selectMode && ((snapshot?.entries ?? []).some((e) => e.status === 'WAITING') || (snapshot?.missedEntries ?? []).length > 0) && (
                <button type="button" onClick={() => setShowClearConfirm(true)}
                  className="btn-ghost !py-1 !px-2.5 text-xs text-rose-600 hover:bg-rose-50 shrink-0">
                  Clear
                </button>
              )}
            </div>
            {showClearConfirm && (
              <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 space-y-2">
                <p className="text-sm font-medium text-rose-800">Cancel all {L.customerPlural.toLowerCase()}?</p>
                <p className="text-xs text-rose-600">They will appear in history as Cancelled.</p>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => clearQueue(false)}
                    className="btn-ghost !py-1 !px-3 text-xs text-rose-700 border border-rose-300 hover:bg-rose-100">
                    Clear waiting only
                  </button>
                  {(snapshot?.missedEntries ?? []).length > 0 && (
                    <button type="button" onClick={() => clearQueue(true)}
                      className="btn-ghost !py-1 !px-3 text-xs text-rose-700 border border-rose-300 hover:bg-rose-100">
                      Clear waiting + missed
                    </button>
                  )}
                  <button type="button" onClick={() => setShowClearConfirm(false)}
                    className="btn-ghost !py-1 !px-3 text-xs text-slate-500 ml-auto">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {(() => {
            const sq       = queueSearch.toLowerCase().trim();
            const entries  = snapshot?.entries ?? [];
            const filtered = sq
              ? entries.filter((e) =>
                  e.patient?.name?.toLowerCase().includes(sq) ||
                  (e.patient?.phone ?? '').includes(sq) ||
                  matchesTokenSearch(sq, e.tokenNumber),
                )
              : entries;
            return (
              <div className="divide-y divide-slate-100">
                {filtered.length > 0 ? (
                  filtered.map((e) => (
                    <div key={e.id} className="flex items-stretch">
                      {selectMode && e.status === 'WAITING' && (
                        <label className="flex items-center pl-4 pr-2 cursor-pointer">
                          <input type="checkbox" className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={selectedIds.has(e.id)}
                            onChange={() => setSelectedIds((prev) => {
                              const next = new Set(prev);
                              next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                              return next;
                            })} />
                        </label>
                      )}
                      <div className="flex-1 min-w-0">
                        <QueueRow
                          entry={e}
                          orderNumber={orderMap.get(e.id)}
                          onComplete={() => setEntryStatus(e.id, 'complete')}
                          onCancel={() => setEntryStatus(e.id, 'cancel')}
                          onEmergency={() => markEmergency(e.id)}
                          onMiss={() => missEntry(e.id)}
                          onMove={(pos) => moveEntry(e.id, pos)}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-2">{sq ? '🔍' : '📭'}</div>
                    <div className="text-sm text-slate-500">
                      {sq ? `No results for "${queueSearch}"` : selectedDoctorId ? 'Queue is empty' : 'Select a doctor above'}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      </div>

      {/* Missed patients panel */}
      {(() => {
        const allMissed     = snapshot?.missedEntries ?? [];
        if (allMissed.length === 0) return null;
        const mq            = missedSearch.toLowerCase().trim();
        const filteredMissed = mq
          ? allMissed.filter((e) =>
              e.patient?.name?.toLowerCase().includes(mq) ||
              (e.patient?.phone ?? '').includes(mq),
            )
          : allMissed;
        return (
          <section className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-rose-100 bg-rose-50 flex items-center gap-3">
              <h2 className="section-title text-rose-700 flex-1">Missed {L.customerPlural.toLowerCase()}</h2>
              <input type="search" placeholder="Search…" value={missedSearch}
                onChange={(e) => setMissedSearch(e.target.value)}
                className="input !py-1 w-full sm:!w-36 text-xs" />
              <span className="pill bg-rose-100 text-rose-700 ring-rose-200 shrink-0">
                {mq && filteredMissed.length !== allMissed.length
                  ? `${filteredMissed.length} / ${allMissed.length}`
                  : allMissed.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredMissed.length > 0 ? filteredMissed.map((e) => (
                <div key={e.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-rose-600 shrink-0">{tokenDisplay(e.tokenNumber)}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
                        {e.patient?.name ?? '—'}
                        {e.missedCount > 0 && (
                          <span className="pill bg-rose-100 text-rose-700 ring-rose-200 text-[10px]">Missed ×{e.missedCount}</span>
                        )}
                      </div>
                      {e.patient?.phone && <div className="text-xs text-slate-400">{e.patient.phone}</div>}
                    </div>
                  </div>
                  <button type="button" onClick={() => rejoinEntry(e.id)}
                    className="btn-secondary !py-1.5 !px-3 text-xs text-brand-700 border-brand-200 hover:bg-brand-50 shrink-0">
                    Rejoin queue
                  </button>
                </div>
              )) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  No missed {L.customerPlural.toLowerCase()} match &ldquo;{missedSearch}&rdquo;
                </div>
              )}
            </div>
          </section>
        );
      })()}

      <Toast message={toast} onDismiss={() => setToast(null)} />
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

// ─── QueueRow ─────────────────────────────────────────────────────────────────

function QueueRow({
  entry, orderNumber,
  onComplete, onCancel, onEmergency, onMiss, onMove,
}: {
  entry: QueueEntry;
  orderNumber?: number;
  onComplete: () => void;
  onCancel: () => void;
  onEmergency: () => void;
  onMiss: () => void;
  onMove: (position: number) => void;
}) {
  const [movingTo,  setMovingTo]  = useState<number | ''>('');
  const [showMove,  setShowMove]  = useState(false);
  const isInConsult = entry.status === 'IN_CONSULTATION';
  const isPending   = entry.id.startsWith('pending-');

  function submitMove() {
    if (movingTo === '' || movingTo < 1) return;
    onMove(movingTo);
    setMovingTo('');
    setShowMove(false);
  }

  return (
    <div className={`px-4 py-3.5 transition-colors ${
      isInConsult ? 'bg-emerald-50/60 border-l-4 border-l-emerald-400'
      : isPending  ? 'bg-amber-50/40 opacity-70'
      : 'hover:bg-slate-50/60'
    }`}>
      <div className="flex items-start gap-3">
        {orderNumber !== undefined && (
          <div className="flex flex-col items-center shrink-0 w-8 pt-0.5">
            <span className="text-[10px] leading-none text-slate-400">pos</span>
            <span className="font-bold text-sm text-slate-600 leading-tight">{orderNumber}</span>
          </div>
        )}
        <div className={`font-mono font-bold text-lg shrink-0 w-14 ${isInConsult ? 'text-emerald-700' : 'text-slate-800'}`}>
          {isPending ? '#…' : tokenDisplay(entry.tokenNumber)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
            {entry.patient?.name ?? '—'}
            {isPending   && <span className="pill bg-amber-100 text-amber-700 ring-amber-200 text-[10px]">Adding…</span>}
            {entry.priority >= 100 && <span className="pill bg-rose-100 text-rose-700 ring-rose-200 text-[10px]">🚨 Emergency</span>}
            {entry.walkin && <span className="pill bg-brand-100 text-brand-700 ring-brand-200 text-[10px]">Walk-in</span>}
            {entry.slotType === 'FOLLOWUP' && <span className="pill bg-purple-100 text-purple-700 ring-purple-200 text-[10px]">Follow-up</span>}
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
            <span>{entry.patient?.phone ?? '—'}</span>
            {entry.notes && <span className="text-slate-400 truncate">· {entry.notes}</span>}
          </div>
        </div>
        <div className="text-right text-xs shrink-0">
          {entry.status === 'WAITING' && !isPending && (
            <>
              <div className="font-semibold text-slate-700">
                {entry.peopleAhead === 0 ? 'next up' : `${entry.peopleAhead} ahead`}
              </div>
              <div className="text-slate-400">~{entry.etaMinutes} min</div>
            </>
          )}
          {isInConsult && <EntryStatusPill status={entry.status} />}
        </div>
      </div>

      {showMove && entry.status === 'WAITING' && (
        <div className="mt-2 flex items-center gap-2">
          <input autoFocus type="number" min={1} placeholder="Position #" value={movingTo}
            onChange={(e) => setMovingTo(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitMove(); if (e.key === 'Escape') setShowMove(false); }}
            className="input !py-1.5 !px-2.5 text-xs w-28" />
          <button type="button" onClick={submitMove} disabled={movingTo === ''} className="btn-primary !py-1.5 !px-3 text-xs">Move</button>
          <button type="button" onClick={() => setShowMove(false)} className="btn-ghost !py-1.5 !px-2 text-xs">Cancel</button>
        </div>
      )}

      <div className="flex gap-1.5 mt-2.5 justify-end flex-wrap">
        {isInConsult && (
          <>
            <button type="button" onClick={onComplete} className="btn-success !px-3 !py-1.5 text-xs">✓ Done</button>
            <button type="button" onClick={onMiss}
              className="btn-secondary !px-3 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
              title="Patient didn't appear when called">Missed</button>
          </>
        )}
        {entry.status === 'WAITING' && (
          <>
            <button type="button" onClick={() => setShowMove((v) => !v)}
              title="Move to a specific position" className="btn-secondary !px-3 !py-1.5 text-xs">↕ Move</button>
            <button type="button" onClick={onEmergency}
              title="Mark as emergency — moves to top" className="btn-danger !px-3 !py-1.5 text-xs">🚨</button>
            <button type="button" onClick={onMiss}
              className="btn-secondary !px-3 !py-1.5 text-xs text-rose-500 hover:bg-rose-50 border-rose-200"
              title="Patient didn't appear — add to missed queue">Missed</button>
            <button type="button" onClick={onCancel}
              className="btn-secondary !px-3 !py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              title="Remove patient from queue">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
