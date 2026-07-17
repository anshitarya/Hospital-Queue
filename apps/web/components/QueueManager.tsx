'use client';

/**
 * Self-contained queue management panel.
 *
 * Embeds the full receptionist queue workflow:
 *   • Doctor selector with live status
 *   • Add-patient form (name, phone, priority, walk-in, follow-up, position)
 *   • Live queue (real-time via socket, optimistic UI)
 *   • Per-entry actions: complete, miss, skip, cancel, emergency, move
 *   • Drag-and-drop queue reordering (HTML5 native, calls /queue/entry/:id/move)
 *   • Multi-select cancel
 *   • Clear queue (waiting-only or waiting + missed)
 *   • Missed-patients panel with rejoin
 *
 * Loads its own clinic data — no props required. Drop it anywhere a
 * receptionist or admin user is authenticated.
 */

import { useEffect, useMemo, useState, useCallback, useRef, memo, Fragment } from 'react';
import { api, ApiError, type QueueEntry, type Clinic, type Snapshot } from '@/lib/api';
import { useDoctorQueue } from '@/lib/socket';
import { useOptimisticSnapshot } from '@/lib/useOptimisticSnapshot';
import { tokenDisplay, matchesTokenSearch } from '@/lib/tokenCode';
import { Toast, type ToastMessage } from '@/components/Toast';
import { EntryStatusPill, DoctorStatusPill, LiveIndicator } from '@/components/StatusPill';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { DoctorCredentialsModal, type DoctorCredentials } from '@/components/DoctorCredentialsModal';
import { EmptyState, EmptyIcons } from '@/components/EmptyState';
import { getLabels } from '@/lib/labels';
import { serviceDay } from '@/lib/datetime';
import { resolveAvgMinutes } from '@/lib/queueAvg';
import { Spinner } from '@/components/PageLoader';

function doctorStorageKey(clinicId: string) {
  return `turnos_selected_doctor_${clinicId}`;
}

const DRAG_COMMIT_PX = 10;
const AUTO_SCROLL_EDGE = 56;
const AUTO_SCROLL_SPEED = 10;

/** 0-based insertion slot among waiting entries; null = no valid drop. */
function computeMoveTarget(fromIdx: number, dropSlot: number, waitingCount: number): number | null {
  if (dropSlot === fromIdx || dropSlot === fromIdx + 1) return null;
  let target = dropSlot + 1;
  if (fromIdx < dropSlot) target = dropSlot;
  return Math.max(1, Math.min(target, waitingCount));
}

function reorderWaitingEntries(entries: QueueEntry[], id: string, targetPosition: number): QueueEntry[] {
  const waiting = entries.filter((e) => e.status === 'WAITING');
  const nonWaiting = entries.filter((e) => e.status !== 'WAITING');
  const fromIdx = waiting.findIndex((e) => e.id === id);
  if (fromIdx < 0) return entries;
  const reordered = waiting.filter((e) => e.id !== id);
  const toIdx = Math.max(0, Math.min(targetPosition - 1, reordered.length));
  reordered.splice(toIdx, 0, waiting[fromIdx]);
  const inConsult = nonWaiting.filter((e) => e.status === 'IN_CONSULTATION');
  const other = nonWaiting.filter((e) => e.status !== 'IN_CONSULTATION');
  return [...inConsult, ...reordered, ...other];
}

function DropPlaceholder() {
  return (
    <div
      className="queue-drop-placeholder flex items-center justify-center"
      aria-hidden
    >
      <span className="text-[11px] font-medium text-brand-600 dark:text-brand-400 tracking-wide">
        Drop here
      </span>
    </div>
  );
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
  const [prevVisit, setPrevVisit] = useState<{
    name: string;
    customerPin?: string | null;
    totalVisits: number;
    providers: { name: string; count: number; dates: string[] }[];
    registered?: boolean;
  } | null>(null);
  const [prevLookupPhone, setPrevLookupPhone] = useState('');
  const [priority, setPriority]                   = useState(0);
  const [notes, setNotes]                         = useState('');
  const [walkin, setWalkin]                       = useState(false);
  const [slotType, setSlotType]                   = useState<'NEW' | 'FOLLOWUP'>('NEW');
  const [insertAtPosition, setInsertAtPosition]   = useState<number | ''>('');

  // Doctor schedule/shifts target selection
  const [doctorShifts, setDoctorShifts]           = useState<any[]>([]);
  const [selectedShiftTime, setSelectedShiftTime] = useState<string>('');

  // ── Queue interaction state ─────────────────────────────────────────────
  const [queueSearch, setQueueSearch]     = useState('');
  const [missedSearch, setMissedSearch]   = useState('');
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(new Set());
  const [doctorActionInFlight, setDoctorActionInFlight] = useState<string | null>(null);

  // ── Drag and drop ────────────────────────────────────────────────────────
  const [dragState, setDragState] = useState<{ id: string; startY: number; committed: boolean } | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const autoScrollRaf = useRef<number | null>(null);
  const lastPointerY = useRef(0);
  const dragInitiatedRef = useRef(false);

  // ── Modals / toasts ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  const L = getLabels(clinic?.businessType);

  // ── Doctor shifts fetch effect ──
  useEffect(() => {
    if (selectedDoctorId) {
      api<any[]>(`/schedules/doctor/${selectedDoctorId}`)
        .then((data) => {
          const active = (data || []).filter((s) => !s.isHoliday);
          setDoctorShifts(active);
          setSelectedShiftTime('');
        })
        .catch(() => {
          setDoctorShifts([]);
          setSelectedShiftTime('');
        });
    } else {
      setDoctorShifts([]);
      setSelectedShiftTime('');
    }
  }, [selectedDoctorId]);

  const todayDow = useMemo(() => {
    const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return istDate.getDay();
  }, []);

  const todaysShifts = useMemo(() => {
    return doctorShifts.filter((s) => s.dayOfWeek === todayDow);
  }, [doctorShifts, todayDow]);

  // ── Previous-visit lookup ────────────────────────────────────────────────
  useEffect(() => {
    if (!phoneResult.ok || !phoneResult.e164) { setPrevVisit(null); return; }
    if (phoneResult.e164 === prevLookupPhone) return;
    setPrevLookupPhone(phoneResult.e164);
    api<{
      name: string;
      customerPin?: string | null;
      totalVisits: number;
      providers: { name: string; count: number; dates: string[] }[];
      registered?: boolean;
    } | null>(
      `/clinics/my/patient-lookup?phone=${encodeURIComponent(phoneResult.e164)}`,
    ).then((data) => {
      setPrevVisit(data);
      if (data?.name) setName(data.name);
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
    const id = setInterval(() => setAvgTick((t) => t + 1), 30_000);
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
    const isDoctorAction = ['Call next', 'pause', 'resume', 'end-service', 'break', 'clear-queue'].includes(label);
    if (isDoctorAction) setDoctorActionInFlight(label);
    return fn().finally(() => {
      if (isDoctorAction) setDoctorActionInFlight(null);
    }).catch((err) => {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setToast({ type: 'err', msg: `${label} failed: ${msg}` });
      revertOptimistic();
      throw err;
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
      appointmentTime: selectedShiftTime || undefined,
    };

    // Reset form immediately
    setName(''); setPhone(''); setPhoneResult({ ok: false }); setPriority(0); setNotes('');
    setWalkin(false); setSlotType('NEW'); setInsertAtPosition('');
    setSelectedShiftTime('');
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
          serviceDay: serviceDay(),
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

  const endServiceShift = () => {
    if (!selectedDoctorId) return;
    if (!window.confirm('End this shift and move waiting patients to the next available shift?')) return;
    void callAction(
      () => api<{ rolled: number; message: string }>(`/queue/doctor/${selectedDoctorId}/end-service`, { method: 'POST' }),
      'end-service',
      (s) => ({
        ...s,
        doctor: s.doctor ? { ...s.doctor, status: 'PAUSED' as const } : s.doctor,
      }),
    ).then((res) => {
      if (res && typeof res === 'object' && 'message' in res) {
        setToast({ type: 'ok', msg: (res as { message: string }).message });
      }
    });
  };

  // ── Entry actions ────────────────────────────────────────────────────────
  const setEntryStatus = useCallback((id: string, action: 'complete' | 'skip' | 'cancel') => {
    setActionInFlight((prev) => new Set(prev).add(id));
    callAction(
      () => api(`/queue/entry/${id}/${action}`, { method: 'POST' }),
      action,
      (s) => {
        const entry = s.entries.find((e) => e.id === id);
        const nextStatus =
          action === 'complete' ? 'COMPLETED' : action === 'skip' ? 'SKIPPED' : 'CANCELLED';
        const wasInConsult = entry?.status === 'IN_CONSULTATION';
        return {
          ...s,
          currentToken: wasInConsult ? null : s.currentToken,
          entries: s.entries.filter((e) => e.id !== id),
        };
      },
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const markEmergency = useCallback((id: string) => {
    setActionInFlight((prev) => new Set(prev).add(id));
    return callAction(
      () => api(`/queue/entry/${id}/reorder`, { method: 'POST', body: { priority: 100 } }),
      'Emergency',
      (s) => ({ ...s, entries: s.entries.map((e) => e.id === id ? { ...e, priority: 100 } : e) }),
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const missEntry = useCallback((id: string) => {
    setActionInFlight((prev) => new Set(prev).add(id));
    return callAction(
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
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const rejoinEntry = useCallback((id: string) => {
    setActionInFlight((prev) => new Set(prev).add(id));
    return callAction(
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
              serviceDay: serviceDay(),
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
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const moveEntry = useCallback((id: string, position: number) => {
    setActionInFlight((prev) => new Set(prev).add(id));
    return callAction(
      () => api(`/queue/entry/${id}/move`, { method: 'POST', body: { position } }),
      'Move',
      (s) => ({ ...s, entries: reorderWaitingEntries(s.entries, id, position) }),
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const moveBackEntry = useCallback((id: string) => {
    setActionInFlight((prev) => new Set(prev).add(id));
    return callAction(
      () => api(`/queue/entry/${id}/move-back`, { method: 'POST' }),
      'Move back',
      (s) => {
        const entry = s.entries.find((e) => e.id === id);
        if (!entry) return s;
        if (entry.status === 'IN_CONSULTATION') {
          return {
            ...s,
            currentToken: null,
            entries: s.entries.map((e) =>
              e.id === id ? { ...e, status: 'WAITING' as const } : e,
            ),
          };
        }
        const active = s.entries.filter(
          (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
        );
        const order = new Map(
          [...active]
            .sort((a, b) => (a.sortOrder ?? a.tokenNumber) - (b.sortOrder ?? b.tokenNumber))
            .map((e, i) => [e.id, i + 1]),
        );
        const pos = order.get(id);
        if (pos !== undefined) {
          return { ...s, entries: reorderWaitingEntries(s.entries, id, pos + 1) };
        }
        return s;
      },
    ).finally(() => {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [callAction]);

  const clearQueue = useCallback((includeMissed: boolean) => {
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
  }, [callAction, selectedDoctorId, snapshot, L.customer, L.customerPlural]);

  const cancelSelected = useCallback(() => {
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
  }, [callAction, selectedIds]);

  // Stable callbacks for QueueRow memoization
  const handleComplete = useCallback((id: string) => setEntryStatus(id, 'complete'), [setEntryStatus]);
  const handleCancel = useCallback((id: string) => setEntryStatus(id, 'cancel'), [setEntryStatus]);
  const handleEmergency = useCallback((id: string) => markEmergency(id), [markEmergency]);
  const handleMiss = useCallback((id: string) => missEntry(id), [missEntry]);
  const handleMove = useCallback((id: string, pos: number) => moveEntry(id, pos), [moveEntry]);
  const handleMoveBack = useCallback((id: string) => moveBackEntry(id), [moveBackEntry]);
  const handleTransfer = useCallback(
    (id: string, destId: string, reason?: string, walkin?: boolean, slotType?: 'NEW' | 'FOLLOWUP') =>
      callAction(
        () => api(`/queue/entry/${id}/transfer`, {
          method: 'POST',
          body: { destinationDoctorId: destId, transferReason: reason || undefined, walkin, slotType }
        }),
        'Transfer',
        (s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }),
      ),
    [callAction]
  );

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    const el = queueListRef.current;
    if (!el) {
      autoScrollRaf.current = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    const y = lastPointerY.current;
    let dy = 0;
    if (y < rect.top + AUTO_SCROLL_EDGE) dy = -AUTO_SCROLL_SPEED;
    else if (y > rect.bottom - AUTO_SCROLL_EDGE) dy = AUTO_SCROLL_SPEED;
    if (dy !== 0) {
      el.scrollTop += dy;
      autoScrollRaf.current = requestAnimationFrame(tickAutoScroll);
    } else {
      autoScrollRaf.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((clientY: number) => {
    lastPointerY.current = clientY;
    if (autoScrollRaf.current === null) {
      autoScrollRaf.current = requestAnimationFrame(tickAutoScroll);
    }
  }, [tickAutoScroll]);

  const resetDrag = useCallback(() => {
    stopAutoScroll();
    setDragState(null);
    setDropSlot(null);
  }, [stopAutoScroll]);

  const handleDragStart = useCallback((ev: React.DragEvent, id: string) => {
    if (selectMode) {
      ev.preventDefault();
      return;
    }
    if (!dragInitiatedRef.current) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', id);
    setDragState({ id, startY: ev.clientY, committed: true });
    setDropSlot(null);
  }, [selectMode]);

  const handleDrag = useCallback((ev: React.DragEvent) => {
    if (!dragState || ev.clientY === 0) return;
    startAutoScroll(ev.clientY);
  }, [dragState, startAutoScroll]);

  const handleDragOverRow = useCallback((ev: React.DragEvent, waitingIndex: number) => {
    if (!dragState?.committed) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const insertIdx = ev.clientY < rect.top + rect.height / 2 ? waitingIndex : waitingIndex + 1;
    setDropSlot(insertIdx);
    startAutoScroll(ev.clientY);
  }, [dragState?.committed, startAutoScroll]);

  const handleListDragOver = useCallback((ev: React.DragEvent) => {
    if (!dragState?.committed) return;
    ev.preventDefault();
    startAutoScroll(ev.clientY);
  }, [dragState?.committed, startAutoScroll]);

  const handleDrop = useCallback((ev: React.DragEvent, waitingEntries: QueueEntry[]) => {
    ev.preventDefault();
    if (!dragState?.committed || dropSlot === null) {
      resetDrag();
      return;
    }
    const fromIdx = waitingEntries.findIndex((e) => e.id === dragState.id);
    if (fromIdx < 0) {
      resetDrag();
      return;
    }
    const target = computeMoveTarget(fromIdx, dropSlot, waitingEntries.length);
    if (target !== null) moveEntry(dragState.id, target);
    resetDrag();
  }, [dragState, dropSlot, moveEntry, resetDrag]);

  const handleDragEnd = useCallback(() => {
    resetDrag();
  }, [resetDrag]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Doctor selector */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Select {L.provider.toLowerCase()}
          </span>
          <LiveIndicator connected={connected} />
        </div>
        {allDoctors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allDoctors.map((d) => {
              const isSelected = selectedDoctorId === d.id;
              return (
                <button key={d.id} type="button" onClick={() => selectDoctor(d.id)}
                  className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition-all duration-150 ${
                    isSelected
                      ? 'border-brand-500/60 bg-brand-50 dark:bg-brand-950/40 shadow-sm ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                  <div className={`font-semibold text-[13px] truncate ${isSelected ? 'text-brand-700 dark:text-brand-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {d.user.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <DoctorStatusPill status={d.status} />
                    {d.deptName && <span className="text-slate-400 dark:text-slate-500">· {d.deptName}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<EmptyIcons.Staff />}
            title={`No ${L.providerPlural.toLowerCase()} yet`}
            description={`Go to the Staff tab to add your first ${L.provider.toLowerCase()}.`}
            size="sm"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Add-patient form */}
        <section className="card overflow-hidden lg:col-span-1">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
            <h2 className="section-title">Add {L.customer.toLowerCase()}</h2>
            {snapshot?.doctor && <DoctorStatusPill status={snapshot.doctor.status} />}
          </div>
          <div className="p-5 space-y-3">
            <form onSubmit={addPatient} className="space-y-3">
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
                <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/60 px-3.5 py-2.5 flex items-start gap-3 animate-enter">
                  <span className="text-teal-500 text-base shrink-0 mt-0.5">↩</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-teal-800 dark:text-teal-300 truncate">{prevVisit.name}</div>
                      {prevVisit.customerPin && (
                        <span className="pill-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-600 font-mono">
                          PIN: {prevVisit.customerPin}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                      {prevVisit.totalVisits > 0 ? (
                        <span>{prevVisit.totalVisits} completed visit{prevVisit.totalVisits !== 1 ? 's' : ''} at this business</span>
                      ) : (
                        <span>Registered customer — first visit at this business</span>
                      )}
                      {prevVisit.providers.map((p) => (
                        <div key={p.name} className="mt-1.5">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-teal-500 dark:text-teal-500"> — {p.count} visit{p.count !== 1 ? 's' : ''}</span>
                          {p.dates.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {p.dates.map((d) => (
                                <span key={d} className="bg-teal-100 dark:bg-teal-800/40 rounded-lg px-1.5 py-0.5 text-[10px] font-medium">{fmtShortDate(d)}</span>
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
                <div className="card-inset px-3.5 py-2.5 flex gap-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                      checked={walkin} onChange={(e) => setWalkin(e.target.checked)} />
                    <span className="text-slate-700 dark:text-slate-300">Walk-in</span>
                    <span className="text-[10px] text-slate-400">(near current)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500"
                      checked={slotType === 'FOLLOWUP'} onChange={(e) => setSlotType(e.target.checked ? 'FOLLOWUP' : 'NEW')} />
                    <span className="text-slate-700 dark:text-slate-300">Follow-up</span>
                  </label>
                </div>
              )}
              <textarea className="input resize-none" placeholder="Notes (optional)" rows={2}
                value={notes} onChange={(e) => setNotes(e.target.value)} />
              {snapshot?.settings?.queueMode === 'LIVE_QUEUE' && todaysShifts.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">Shift:</span>
                  <select
                    className="input flex-1"
                    value={selectedShiftTime}
                    onChange={(e) => setSelectedShiftTime(e.target.value)}
                  >
                    <option value="">Next Available (Default)</option>
                    {todaysShifts.map((s, idx) => (
                      <option key={s.id || idx} value={s.startTime}>
                        Shift {idx + 1}: {s.startTime} - {s.endTime}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">Position:</span>
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
              <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3 space-y-2.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>
                    {avgDisplay
                      ? avgDisplay.live
                        ? `~${avgDisplay.label} ${L.perCustomer} (live avg)`
                        : `${avgDisplay.label} ${L.perCustomer} (default)`
                      : null}
                  </span>
                  {snapshot.doctor.delayMinutes > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">+{snapshot.doctor.delayMinutes} min delay</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {doctorActionInFlight && <Spinner className="h-4 w-4 text-brand-500 mr-1" />}
                  <button type="button" onClick={callNext} disabled={!!doctorActionInFlight} className="btn-primary flex-1 !py-2 text-xs min-w-[100px] disabled:opacity-50">
                    ▶ Call next
                  </button>
                  {snapshot.doctor.status === 'PAUSED' ? (
                    <button type="button" onClick={() => controlDoctor('resume')} disabled={!!doctorActionInFlight} className="btn-secondary !py-2 text-xs disabled:opacity-50">Resume</button>
                  ) : (
                    <button type="button" onClick={() => controlDoctor('pause')} disabled={!!doctorActionInFlight} className="btn-secondary !py-2 text-xs disabled:opacity-50">Pause</button>
                  )}
                  <button type="button" onClick={endServiceShift} title="Move waiting patients to next shift" disabled={!!doctorActionInFlight}
                    className="btn-secondary !py-2 text-xs text-amber-700 dark:text-amber-400 disabled:opacity-50">
                    End shift
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Live queue */}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="section-title flex items-center gap-2">
                Live queue
                {snapshot?.doctor && (
                  <span className="text-sm font-normal text-slate-400 dark:text-slate-500">— {snapshot.doctor.user.name}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Now serving</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 font-mono text-sm bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1">
                  {snapshot?.currentToken ? tokenDisplay(snapshot.currentToken) : '—'}
                </span>
              </div>
            </div>
            {/* Search + controls row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg viewBox="0 0 20 20" fill="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                <input type="search" placeholder="Search by name or phone…" value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  className="input !py-1.5 !pl-8 text-xs" />
              </div>
              <button type="button"
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={`btn-ghost !py-1 !px-2.5 text-xs shrink-0 ${selectMode ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400 ring-1 ring-brand-200 dark:ring-brand-800' : ''}`}>
                {selectMode ? 'Done' : 'Select'}
              </button>
              {selectedIds.size > 0 && (
                <button type="button" onClick={cancelSelected}
                  className="btn-ghost !py-1 !px-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 ring-1 ring-rose-200 dark:ring-rose-800 shrink-0">
                  Cancel {selectedIds.size}
                </button>
              )}
              {!selectMode && ((snapshot?.entries ?? []).some((e) => e.status === 'WAITING') || (snapshot?.missedEntries ?? []).length > 0) && (
                <button type="button" onClick={() => setShowClearConfirm(true)}
                  className="btn-ghost !py-1 !px-2.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0">
                  Clear
                </button>
              )}
            </div>
            {/* Drag hint */}
            {(snapshot?.entries ?? []).filter((e) => e.status === 'WAITING').length > 1 && !queueSearch.trim() && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>
                Drag the ⋮⋮ handle to reorder — auto-scrolls on long queues
              </p>
            )}
            {showClearConfirm && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-800/60 px-4 py-3 space-y-2 animate-enter">
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">Cancel all {L.customerPlural.toLowerCase()}?</p>
                <p className="text-xs text-rose-600 dark:text-rose-400">They will appear in history as Cancelled.</p>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => clearQueue(false)}
                    className="btn-ghost !py-1 !px-3 text-xs text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/30">
                    Clear waiting only
                  </button>
                  {(snapshot?.missedEntries ?? []).length > 0 && (
                    <button type="button" onClick={() => clearQueue(true)}
                      className="btn-ghost !py-1 !px-3 text-xs text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/30">
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
            const activeEntries = entries.filter(
              (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
            );
            const filtered = sq
              ? activeEntries.filter((e) =>
                  e.patient?.name?.toLowerCase().includes(sq) ||
                  (e.patient?.phone ?? '').includes(sq) ||
                  matchesTokenSearch(sq, e.tokenNumber),
                )
              : activeEntries;
            const waitingEntries = (snapshot?.entries ?? []).filter(
              (e) => e.status === 'WAITING' && !e.id.startsWith('pending-'),
            );
            const dragAllowed = !sq && !selectMode;
            const dragActive = dragAllowed && dragState?.committed === true;
            return (
              <div
                ref={queueListRef}
                className="divide-subtle max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain queue-scroll"
                onDragOver={handleListDragOver}
                onDrop={(ev) => handleDrop(ev, waitingEntries)}
              >
                {filtered.length > 0 ? (
                  filtered.map((e) => {
                    const waitingIndex = waitingEntries.findIndex((w) => w.id === e.id);
                    const isWaitingDraggable =
                      dragAllowed && e.status === 'WAITING' && !e.id.startsWith('pending-');
                    const showPlaceholderBefore =
                      dragActive && waitingIndex >= 0 && dropSlot === waitingIndex;
                    return (
                      <Fragment key={e.id}>
                        {showPlaceholderBefore && <DropPlaceholder />}
                        <div
                          className={`queue-list-item flex items-stretch ${
                            dragState?.id === e.id ? 'queue-row-dragging' : ''
                          }`}
                          draggable={isWaitingDraggable}
                          onDragStart={(ev) => handleDragStart(ev, e.id)}
                          onDrag={handleDrag}
                          onDragOver={(ev) => {
                            if (waitingIndex >= 0) handleDragOverRow(ev, waitingIndex);
                          }}
                          onDrop={(ev) => handleDrop(ev, waitingEntries)}
                          onDragEnd={handleDragEnd}
                        >
                          {selectMode && e.status === 'WAITING' && (
                            <label className="flex items-center pl-4 pr-2 cursor-pointer">
                              <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
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
                              isDragging={dragState?.id === e.id}
                              actionInFlight={actionInFlight.has(e.id)}
                              onComplete={handleComplete}
                              onCancel={handleCancel}
                              onEmergency={handleEmergency}
                              onMiss={handleMiss}
                              onMove={handleMove}
                              onMoveBack={handleMoveBack}
                              onTransfer={handleTransfer}
                              doctors={allDoctors}
                              onDragInitiated={() => { dragInitiatedRef.current = true; }}
                              onDragReleased={() => { dragInitiatedRef.current = false; }}
                            />
                          </div>
                        </div>
                      </Fragment>
                    );
                  })
                ) : (
                  <EmptyState
                    icon={sq ? <EmptyIcons.Search /> : <EmptyIcons.Queue />}
                    title={sq ? `No results for "${queueSearch}"` : selectedDoctorId ? 'Queue is empty' : 'Select a provider above'}
                    description={sq ? 'Try a different name or phone number.' : selectedDoctorId ? 'Add a patient using the form on the left.' : ''}
                    size="md"
                  />
                )}
                {dragActive && dropSlot === waitingEntries.length && waitingEntries.length > 0 && (
                  <DropPlaceholder />
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
            <div className="px-5 py-4 border-b border-rose-100 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 flex items-center gap-3">
              <h2 className="section-title text-rose-700 dark:text-rose-400 flex-1">Missed {L.customerPlural.toLowerCase()}</h2>
              <input type="search" placeholder="Search…" value={missedSearch}
                onChange={(e) => setMissedSearch(e.target.value)}
                className="input !py-1 w-full sm:!w-36 text-xs" />
              <span className="pill-sm bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 ring-rose-200 dark:ring-rose-800/60 shrink-0">
                {mq && filteredMissed.length !== allMissed.length
                  ? `${filteredMissed.length} / ${allMissed.length}`
                  : allMissed.length}
              </span>
            </div>
            <div className="divide-subtle">
              {filteredMissed.length > 0 ? filteredMissed.map((e) => (
                <div key={e.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0 text-sm">{tokenDisplay(e.tokenNumber)}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-2 flex-wrap text-sm">
                        {e.patient?.name ?? '—'}
                        {e.patient?.customerPin && (
                          <span className="pill-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-600 font-mono ml-1">
                            PIN: {e.patient.customerPin}
                          </span>
                        )}
                        {e.missedCount > 0 && (
                          <span className="pill-sm bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 ring-rose-200 dark:ring-rose-800/60">Missed ×{e.missedCount}</span>
                        )}
                      </div>
                      {e.patient?.phone && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{e.patient.phone}</div>}
                    </div>
                  </div>
                  <button type="button" onClick={() => rejoinEntry(e.id)} disabled={actionInFlight.has(e.id)}
                    className="btn-secondary !py-1.5 !px-3 text-xs text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-950/30 shrink-0 disabled:opacity-50 flex items-center gap-1.5">
                    {actionInFlight.has(e.id) ? (
                      <>
                        <Spinner className="h-3 w-3" />
                        <span>Rejoining…</span>
                      </>
                    ) : (
                      'Rejoin queue'
                    )}
                  </button>
                </div>
              )) : (
                <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
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

const QueueRow = memo(function QueueRow({
  entry, orderNumber, isDragging, actionInFlight,
  onComplete, onCancel, onEmergency, onMiss, onMove, onMoveBack, onTransfer, doctors,
  onDragInitiated, onDragReleased,
}: {
  entry: QueueEntry;
  orderNumber?: number;
  isDragging?: boolean;
  actionInFlight?: boolean;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onEmergency: (id: string) => void;
  onMiss: (id: string) => void;
  onMove: (id: string, position: number) => void;
  onMoveBack: (id: string) => void;
  onTransfer: (id: string, destDoctorId: string, reason?: string, walkin?: boolean, slotType?: 'NEW' | 'FOLLOWUP') => void;
  doctors: Array<{ id: string; user: { name: string }; deptName?: string }>;
  onDragInitiated: () => void;
  onDragReleased: () => void;
}) {
  const [movingTo,  setMovingTo]  = useState<number | ''>('');
  const [showMove,  setShowMove]  = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [destDoctorId, setDestDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [transferWalkin, setTransferWalkin] = useState(false);
  const [transferSlotType, setTransferSlotType] = useState<'NEW' | 'FOLLOWUP'>('NEW');

  const isInConsult = entry.status === 'IN_CONSULTATION';
  const isPending   = entry.id.startsWith('pending-');
  const isWaiting   = entry.status === 'WAITING';
  const isDraggable = isWaiting && !isPending;

  function submitMove() {
    if (movingTo === '' || movingTo < 1) return;
    onMove(entry.id, movingTo);
    setMovingTo('');
    setShowMove(false);
  }

  function submitTransfer() {
    if (!destDoctorId) return;
    onTransfer(entry.id, destDoctorId, reason, transferWalkin, transferSlotType);
    setShowTransfer(false);
    setDestDoctorId('');
    setReason('');
  }

  return (
    <div className={`px-4 py-3.5 transition-all duration-150 group ${
      isInConsult ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-l-[3px] border-l-emerald-400'
      : isPending  ? 'bg-amber-50/50 dark:bg-amber-950/20 opacity-70'
      : isDragging ? 'opacity-40'
      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
    }`}>
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        {isDraggable && (
          <div
            data-drag-handle
            onMouseDown={onDragInitiated}
            onTouchStart={onDragInitiated}
            onMouseUp={onDragReleased}
            onTouchEnd={onDragReleased}
            className="drag-handle shrink-0 mt-1 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors cursor-grab"
            title="Drag to reorder"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
            </svg>
          </div>
        )}
        {orderNumber !== undefined && (
          <div className="flex flex-col items-center shrink-0 w-7 pt-0.5">
            <span className="text-[9px] leading-none text-slate-400 dark:text-slate-500 uppercase tracking-wide">pos</span>
            <span className="font-bold text-sm text-slate-600 dark:text-slate-300 leading-tight">{orderNumber}</span>
          </div>
        )}
        <div className={`font-mono font-bold text-lg shrink-0 w-12 ${isInConsult ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {isPending ? '#…' : tokenDisplay(entry.tokenNumber)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5 flex-wrap text-sm">
            {entry.patient?.name ?? '—'}
            {entry.patient?.customerPin && (
              <span className="pill-sm bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 ring-slate-200 dark:ring-slate-600 font-mono">
                PIN: {entry.patient.customerPin}
              </span>
            )}
            {isPending   && <span className="pill-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800/60">Adding…</span>}
            {entry.priority >= 100 && <span className="pill-sm bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 ring-rose-200 dark:ring-rose-800/60">🚨 Emergency</span>}
            {entry.walkin && <span className="pill-sm bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 ring-brand-200 dark:ring-brand-800/60">Walk-in</span>}
            {entry.slotType === 'FOLLOWUP' && <span className="pill-sm bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-800/60">Follow-up</span>}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
            <span>{entry.patient?.phone ?? '—'}</span>
            {entry.notes && <span className="text-slate-300 dark:text-slate-600 truncate">· {entry.notes}</span>}
          </div>
        </div>
        <div className="text-right text-xs shrink-0">
          {isWaiting && !isPending && (
            <>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {entry.peopleAhead === 0 ? 'next up' : `${entry.peopleAhead} ahead`}
              </div>
              <div className="text-slate-400 dark:text-slate-500">~{entry.etaMinutes} min</div>
            </>
          )}
          {isInConsult && <EntryStatusPill status={entry.status} />}
        </div>
      </div>

      {showMove && isWaiting && (
        <div className="mt-2.5 flex items-center gap-2 animate-enter">
          <input autoFocus type="number" min={1} placeholder="Position #" value={movingTo}
            onChange={(e) => setMovingTo(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitMove(); if (e.key === 'Escape') setShowMove(false); }}
            className="input-sm w-28" />
          <button type="button" onClick={submitMove} disabled={movingTo === ''} className="btn-primary !py-1.5 !px-3 text-xs">Move</button>
          <button type="button" onClick={() => setShowMove(false)} className="btn-ghost !py-1.5 !px-2 text-xs">Cancel</button>
        </div>
      )}

      {showTransfer && (
        <div className="mt-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-3 space-y-2.5 animate-enter">
          <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">Transfer patient</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={destDoctorId}
              onChange={(e) => setDestDoctorId(e.target.value)}
              className="input-sm w-full font-sans text-xs"
            >
              <option value="">Select professional...</option>
              {doctors
                .filter((d) => d.id !== entry.doctorId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user.name} {d.deptName ? `(${d.deptName})` : ''}
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="Reason (e.g. Lab, checkup)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-sm w-full text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                <input
                  type="checkbox"
                  checked={transferWalkin}
                  onChange={(e) => setTransferWalkin(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-600 dark:text-slate-400">Walk-in</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                <input
                  type="checkbox"
                  checked={transferSlotType === 'FOLLOWUP'}
                  onChange={(e) => setTransferSlotType(e.target.checked ? 'FOLLOWUP' : 'NEW')}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-slate-600 dark:text-slate-400">Follow-up</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitTransfer}
                disabled={!destDoctorId}
                className="btn-primary !py-1.5 !px-3 text-xs"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                className="btn-ghost !py-1.5 !px-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mt-2.5 justify-end items-center flex-wrap">
        {actionInFlight && <Spinner className="h-3.5 w-3.5 text-brand-500 mr-1" />}
        {isInConsult && (
          <>
            <button type="button" onClick={() => onComplete(entry.id)} disabled={actionInFlight}
              className="btn-success !px-3 !py-1.5 text-xs disabled:opacity-50">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/></svg>
              {actionInFlight ? 'Saving…' : 'Done'}
            </button>
            <button type="button" onClick={() => onMoveBack(entry.id)} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
              title="Return patient to front of queue">
              ↩ Move back
            </button>
            <button type="button" onClick={() => { setShowTransfer((v) => !v); setShowMove(false); }} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 disabled:opacity-50">
              Transfer
            </button>
            <button type="button" onClick={() => onMiss(entry.id)} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800 disabled:opacity-50"
              title="Patient didn't appear when called">Missed</button>
          </>
        )}
        {isWaiting && (
          <>
            <button type="button" onClick={() => onMoveBack(entry.id)} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
              title="Move one position back in queue">
              ↩ Back
            </button>
            <button type="button" onClick={() => { setShowTransfer((v) => !v); setShowMove(false); }} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 disabled:opacity-50">
              Transfer
            </button>
            <button type="button" onClick={() => { setShowMove((v) => !v); setShowTransfer(false); }} disabled={actionInFlight}
              title="Move to a specific position" className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50">↕ Move</button>
            <button type="button" onClick={() => onEmergency(entry.id)} disabled={actionInFlight}
              title="Mark as emergency — moves to top" className="btn-danger !px-3 !py-1.5 text-xs disabled:opacity-50">🚨</button>
            <button type="button" onClick={() => onMiss(entry.id)} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800 disabled:opacity-50"
              title="Patient didn't appear — add to missed queue">Missed</button>
            <button type="button" onClick={() => onCancel(entry.id)} disabled={actionInFlight}
              className="btn-secondary !px-3 !py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              title="Remove patient from queue">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
});
