'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { api, ApiError, type QueueEntry, type Clinic } from '@/lib/api';
import { useDoctorQueue } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
import { EntryStatusPill, DoctorStatusPill, LiveIndicator } from '@/components/StatusPill';
import { DepartmentPicker } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import {
  DoctorCredentialsModal,
  type DoctorCredentials,
} from '@/components/DoctorCredentialsModal';

interface Department { id: string; name: string; }

export default function ReceptionPage() {
  const { ready } = useRequireRole(['RECEPTIONIST', 'ADMIN']);

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  // 'queue' = active waiting list. 'staff' = manage doctors + receptionists.
  // Persisted via `?tab=` so refresh / browser-back keep the user on the same
  // tab instead of snapping back to Queue.
  const [tab, setTab] = useTabState<'queue' | 'staff'>('queue', ['queue', 'staff']);

  // Add-patient form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');                                // raw 10-digit string
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [priority, setPriority] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Add-doctor form
  const [departments, setDepartments] = useState<Department[]>([]);
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docPhoneResult, setDocPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [docDeptId, setDocDeptId] = useState('');
  const [docAvg, setDocAvg] = useState(7);
  const [docBusy, setDocBusy] = useState(false);

  // Add-receptionist form (peers can onboard each other).
  interface ReceptionistRow {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
  }
  const [receptionists, setReceptionists] = useState<ReceptionistRow[]>([]);
  const [recName, setRecName] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoneResult, setRecPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [recBusy, setRecBusy] = useState(false);

  // Shared credentials modal — populated by either the doctor or receptionist
  // creation path. Stays open until the user explicitly closes it.
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadClinic = useCallback(async () => {
    try {
      const data = await api<Clinic>('/clinics/my');
      setClinic(data);
      const first = (data.doctors ?? [])[0];
      setSelectedDoctorId((prev) => prev ?? first?.id ?? null);
    } catch {
      // ignore
    }
  }, []);

  const loadReceptionists = useCallback(async () => {
    try {
      const list = await api<ReceptionistRow[]>('/clinics/my/receptionists');
      setReceptionists(list);
    } catch {
      // Silent — staff list is non-critical for the queue view.
      setReceptionists([]);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadClinic();
    loadReceptionists();
    api<Department[]>('/clinics/my/departments').then(setDepartments).catch(() => {});
  }, [ready, loadClinic, loadReceptionists]);

  const { snapshot, connected } = useDoctorQueue(ready ? selectedDoctorId : null);

  const allDoctors = useMemo(
    () => (clinic?.doctors ?? []).map((d) => ({ ...d, deptName: d.department?.name ?? '' })),
    [clinic],
  );

  const call = useCallback(async (fn: () => Promise<unknown>, label = 'Action') => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setToast({ type: 'err', msg: `${label} failed: ${msg}` });
    }
  }, []);

  if (!ready) return <PageLoader label="Loading reception…" />;

  async function addPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctorId) return;
    setBusy(true);
    try {
      const e164 = phoneResult.e164 ?? phone;
      const idemKey = `${selectedDoctorId}:${e164}:${Date.now() >> 14}`;
      const entry = await api<QueueEntry>('/queue/reception/join', {
        method: 'POST',
        body: {
          doctorId: selectedDoctorId,
          patientName: name,
          patientPhone: e164,
          priority,
          notes: notes || undefined,
          idempotencyKey: idemKey,
        },
      });
      setToast({ type: 'ok', msg: `Token #${entry.tokenNumber} assigned to ${name}` });
      setName('');
      setPhone('');
      setPhoneResult({ ok: false });
      setPriority(0);
      setNotes('');
      document.getElementById('rec-name')?.focus();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add patient' });
    } finally {
      setBusy(false);
    }
  }

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    // Client-side guard — the server enforces this too, but failing fast
    // keeps the network round-trip out of the way.
    if (!docEmail && !docPhoneResult.ok) {
      setToast({
        type: 'err',
        msg: 'Provide either an email or a valid mobile number for the doctor.',
      });
      return;
    }

    setDocBusy(true);
    try {
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>('/clinics/my/doctors', {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: docDeptId,
          avgConsultMinutes: docAvg,
        },
      });

      // Reset the form …
      setDocName('');
      setDocEmail('');
      setDocPhone('');
      setDocPhoneResult({ ok: false });
      setDocDeptId('');
      setDocAvg(7);

      // … then show the modal. This is intentional: we don't toast here
      // because the temp password is too important to risk a 4-second
      // auto-dismiss.
      setCreds({
        role: 'doctor',
        name: result.doctor.user.name,
        email: result.doctor.user.email,
        phone: result.doctor.user.phone,
        tempPassword: result.tempPassword,
        clinicName: clinic?.name,
      });
      await loadClinic();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add doctor' });
    } finally {
      setDocBusy(false);
    }
  }

  /**
   * Create a peer receptionist. Hits POST /clinics/my/receptionists which is
   * scoped to the caller's clinic — receptionists can't add receptionists to
   * other clinics. Same temp-password modal handoff as addDoctor.
   */
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
        clinicName: clinic?.name,
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

  const callNext = () =>
    call(() => api(`/queue/doctor/${selectedDoctorId}/call-next`, { method: 'POST' }), 'Call next');
  const controlDoctor = (action: 'pause' | 'resume') =>
    call(() => api(`/queue/doctor/${selectedDoctorId}/${action}`, { method: 'POST' }), action);
  const setEntryStatus = (id: string, action: 'complete' | 'skip' | 'cancel') =>
    call(() => api(`/queue/entry/${id}/${action}`, { method: 'POST' }), action);
  const markEmergency = (id: string) =>
    call(() => api(`/queue/entry/${id}/reorder`, { method: 'POST', body: { priority: 100 } }), 'Emergency');

  return (
    <>
      <Header title="Reception" subtitle={clinic?.name} />
      <main className="mx-auto max-w-7xl p-4 space-y-4 animate-fade-in">

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={'tab ' + (tab === 'queue' ? 'tab-active' : 'tab-inactive')}
          >
            Queue
          </button>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className={'tab ' + (tab === 'staff' ? 'tab-active' : 'tab-inactive')}
          >
            Staff{' '}
            <span className="opacity-60">
              ({allDoctors.length} dr · {receptionists.length} rcp)
            </span>
          </button>
        </div>

        {tab === 'queue' && (
          <>
            {/* Doctor switcher */}
            <div className="card p-4">
              <div className="flex flex-wrap gap-2">
                {allDoctors.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDoctorId(d.id)}
                    className={
                      'rounded-xl border px-3 py-2 text-sm transition-all ' +
                      (selectedDoctorId === d.id
                        ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300')
                    }
                  >
                    <div className="font-medium">{d.user.name}</div>
                    <div className="text-xs text-slate-500">{d.deptName || '—'}</div>
                  </button>
                ))}
                {allDoctors.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No doctors yet.{' '}
                    <button type="button" onClick={() => setTab('doctors')} className="underline text-brand-600">
                      Add one
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Quick add form */}
              <section className="card p-5 lg:col-span-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Add patient</h2>
                  <LiveIndicator connected={connected} />
                </div>

                <form onSubmit={addPatient} className="space-y-2">
                  <input
                    id="rec-name"
                    className="input"
                    placeholder="Patient name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <PhoneInput
                    label={null}
                    value={phone}
                    onChange={(raw, result) => {
                      setPhone(raw);
                      setPhoneResult(result);
                    }}
                    required
                    autoComplete="off"
                  />
                  <select
                    className="input"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                  >
                    <option value={0}>Normal</option>
                    <option value={50}>VIP</option>
                    <option value={100}>Emergency</option>
                  </select>
                  <textarea
                    className="input"
                    placeholder="Notes (optional)"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={busy || !selectedDoctorId || !phoneResult.ok}
                  >
                    {busy ? 'Adding…' : 'Add to queue'}
                  </button>
                </form>

                {/* Doctor controls */}
                {snapshot?.doctor && (
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{snapshot.doctor.user.name}</span>
                      <DoctorStatusPill status={snapshot.doctor.status} />
                    </div>
                    <div className="text-xs text-slate-500">
                      Avg {snapshot.doctor.avgConsultMinutes} min
                      {snapshot.doctor.delayMinutes > 0 &&
                        ` · +${snapshot.doctor.delayMinutes} min delay`}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={callNext} className="btn-primary flex-1">
                        Call next
                      </button>
                      {snapshot.doctor.status === 'PAUSED' ? (
                        <button type="button" onClick={() => controlDoctor('resume')} className="btn-secondary">
                          Resume
                        </button>
                      ) : (
                        <button type="button" onClick={() => controlDoctor('pause')} className="btn-secondary">
                          Pause
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Live queue */}
              <section className="card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">
                    Live queue
                    {snapshot?.doctor && (
                      <span className="ml-2 text-slate-500 font-normal text-sm">
                        — {snapshot.doctor.user.name}
                      </span>
                    )}
                  </h2>
                  <div className="text-sm text-slate-500">
                    Now serving:{' '}
                    <span className="font-semibold text-slate-900">
                      {snapshot?.currentToken ? `#${snapshot.currentToken}` : '—'}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {(snapshot?.entries ?? []).length > 0 ? (
                    snapshot!.entries.map((e) => (
                      <QueueRow
                        key={e.id}
                        entry={e}
                        onComplete={() => setEntryStatus(e.id, 'complete')}
                        onSkip={() => setEntryStatus(e.id, 'skip')}
                        onCancel={() => setEntryStatus(e.id, 'cancel')}
                        onEmergency={() => markEmergency(e.id)}
                      />
                    ))
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-500">
                      {selectedDoctorId ? (
                        <>
                          <div className="text-3xl mb-2">📭</div>
                          Queue is empty
                        </>
                      ) : 'Select a doctor above.'}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'staff' && (
          <div className="space-y-4">

          {/* ── Doctors section ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="card p-5 space-y-3 h-fit">
              <h2 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">+</span>
                Add doctor
              </h2>
              <form onSubmit={addDoctor} className="space-y-2">
                <input
                  className="input"
                  placeholder="Full name"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  type="email"
                  placeholder="Email (for login)"
                  value={docEmail}
                  onChange={(e) => setDocEmail(e.target.value)}
                />
                <PhoneInput
                  label={null}
                  value={docPhone}
                  onChange={(raw, result) => {
                    setDocPhone(raw);
                    setDocPhoneResult(result);
                  }}
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 -mt-1 leading-relaxed">
                  At least one of email / mobile is required — the doctor uses it to sign in.
                </p>
                <DepartmentPicker
                  options={departments}
                  value={docDeptId}
                  onChange={setDocDeptId}
                  required
                />
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600 whitespace-nowrap">Avg consult:</span>
                  <input
                    className="input flex-1"
                    type="number"
                    min={1}
                    max={120}
                    value={docAvg}
                    onChange={(e) => setDocAvg(Number(e.target.value))}
                    required
                  />
                  <span className="text-xs text-slate-400">min</span>
                </label>
                <button
                  type="submit"
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={docBusy || (!docEmail && !docPhoneResult.ok)}
                >
                  {docBusy ? 'Adding…' : 'Add doctor'}
                </button>
              </form>
              <p className="text-xs text-slate-400 leading-relaxed">
                A temporary password is generated and shown on screen. Copy it before closing — it
                cannot be recovered later.
              </p>
            </section>

            <section className="card p-5 lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Doctors in {clinic?.name ?? 'your clinic'}</h2>
                <span className="text-xs text-slate-400">{allDoctors.length} total</span>
              </div>
              {allDoctors.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">🩺</div>
                  <p className="text-sm text-slate-500">No doctors yet. Add your first one.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {allDoctors.map((d) => (
                    <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{d.user.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                          <span>{d.deptName || 'No department'}</span>
                          <span>·</span>
                          <span>{d.avgConsultMinutes} min avg</span>
                          {d.user.email && <><span>·</span><span>{d.user.email}</span></>}
                        </div>
                      </div>
                      <DoctorStatusPill status={d.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── Receptionists section ─────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="card p-5 space-y-3 h-fit">
              <h2 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">+</span>
                Add receptionist
              </h2>
              <form onSubmit={addReceptionist} className="space-y-2">
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
                <p className="text-[11px] text-slate-400 -mt-1 leading-relaxed">
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
              <p className="text-xs text-slate-400 leading-relaxed">
                Temporary password is shown once on creation — copy it before closing.
              </p>
            </section>

            <section className="card p-5 lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Receptionists in {clinic?.name ?? 'your clinic'}</h2>
                <span className="text-xs text-slate-400">{receptionists.length} total</span>
              </div>
              {receptionists.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">👤</div>
                  <p className="text-sm text-slate-500">
                    You're the only one. Add a peer using the form on the left.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {receptionists.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                          {r.email && <span>{r.email}</span>}
                          {r.email && r.phone && <span>·</span>}
                          {r.phone && <span>{r.phone}</span>}
                          {!r.email && !r.phone && (
                            <span className="text-slate-400">no contact on file</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          </div>
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

function QueueRow({
  entry,
  onComplete,
  onSkip,
  onCancel,
  onEmergency,
}: {
  entry: QueueEntry;
  onComplete: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onEmergency: () => void;
}) {
  const isInConsult = entry.status === 'IN_CONSULTATION';
  return (
    <div className={
      'py-3 flex items-center gap-3 transition-colors ' +
      (isInConsult ? '-mx-5 px-5 bg-emerald-50/40' : '')
    }>
      <div className={
        'w-12 text-center shrink-0 font-bold text-xl ' +
        (isInConsult ? 'text-emerald-700' : 'text-slate-900')
      }>
        #{entry.tokenNumber}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{entry.patient?.name ?? '—'}</div>
        <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
          <span>{entry.patient?.phone ?? '—'}</span>
          {entry.priority >= 100 && <span className="text-rose-600 font-semibold">EMERGENCY</span>}
          {entry.priority === 50 && <span className="text-amber-600 font-semibold">VIP</span>}
          {entry.notes && <span className="text-slate-400 truncate">· {entry.notes}</span>}
        </div>
      </div>

      <div className="text-right text-xs text-slate-500 shrink-0 w-20">
        {entry.status === 'WAITING' && (
          <>
            <div className="font-medium">
              {entry.peopleAhead === 0 ? 'next up' : `${entry.peopleAhead} ahead`}
            </div>
            <div>~{entry.etaMinutes} min</div>
          </>
        )}
        {isInConsult && <EntryStatusPill status={entry.status} />}
      </div>

      <div className="flex gap-1 shrink-0">
        {isInConsult && (
          <button type="button" onClick={onComplete} className="btn-primary !px-3 !py-2 text-xs min-w-[44px] min-h-[44px]">
            Done
          </button>
        )}
        {entry.status === 'WAITING' && (
          <>
            <button type="button" onClick={onEmergency} title="Mark emergency" className="btn-danger !px-3 !py-2 text-xs min-w-[44px] min-h-[44px]">
              !
            </button>
            <button type="button" onClick={onSkip} className="btn-secondary !px-3 !py-2 text-xs min-w-[44px] min-h-[44px]">
              Skip
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary !px-3 !py-2 text-xs min-w-[44px] min-h-[44px]">
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}
