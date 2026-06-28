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
import { QueueHistoryTable } from '@/components/QueueHistoryTable';

interface Department { id: string; name: string; }

export default function ReceptionPage() {
  const { ready } = useRequireRole(['RECEPTIONIST', 'ADMIN']);

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [tab, setTab] = useTabState<'queue' | 'staff' | 'history'>('queue', ['queue', 'staff', 'history']);

  // Add-patient form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [priority, setPriority] = useState(0);
  const [notes, setNotes] = useState('');
  const [walkin, setWalkin] = useState(false);
  const [slotType, setSlotType] = useState<'NEW' | 'FOLLOWUP'>('NEW');
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

  const [creds, setCreds] = useState<DoctorCredentials | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadClinic = useCallback(async () => {
    try {
      const data = await api<Clinic>('/clinics/my');
      setClinic(data);
      const first = (data.doctors ?? [])[0];
      setSelectedDoctorId((prev) => prev ?? first?.id ?? null);
    } catch { /* ignore */ }
  }, []);

  const loadReceptionists = useCallback(async () => {
    try {
      const list = await api<ReceptionistRow[]>('/clinics/my/receptionists');
      setReceptionists(list);
    } catch { setReceptionists([]); }
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
          walkin: walkin || undefined,
          slotType: slotType !== 'NEW' ? slotType : undefined,
        },
      });
      const suffix = walkin ? ' (walk-in)' : slotType === 'FOLLOWUP' ? ' (follow-up)' : '';
      setToast({ type: 'ok', msg: `Token #${entry.tokenNumber} assigned to ${name}${suffix}` });
      setName(''); setPhone(''); setPhoneResult({ ok: false }); setPriority(0); setNotes('');
      setWalkin(false); setSlotType('NEW');
      document.getElementById('rec-name')?.focus();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add patient' });
    } finally {
      setBusy(false);
    }
  }

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!docEmail && !docPhoneResult.ok) {
      setToast({ type: 'err', msg: 'Provide either an email or a valid mobile number for the doctor.' });
      return;
    }
    setDocBusy(true);
    try {
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>('/clinics/my/doctors', {
        method: 'POST',
        body: { name: docName, email: docEmail || undefined, phone: docPhoneResult.e164 || undefined, departmentId: docDeptId, avgConsultMinutes: docAvg },
      });
      setDocName(''); setDocEmail(''); setDocPhone(''); setDocPhoneResult({ ok: false }); setDocDeptId(''); setDocAvg(7);
      setCreds({ role: 'doctor', name: result.doctor.user.name, email: result.doctor.user.email, phone: result.doctor.user.phone, tempPassword: result.tempPassword, clinicName: clinic?.name });
      await loadClinic();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add doctor' });
    } finally {
      setDocBusy(false);
    }
  }

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
        body: { name: recName, email: recEmail || undefined, phone: recPhoneResult.e164 || undefined },
      });
      setRecName(''); setRecEmail(''); setRecPhone(''); setRecPhoneResult({ ok: false });
      setCreds({ role: 'receptionist', name: result.user.name, email: result.user.email, phone: result.user.phone, tempPassword: result.tempPassword, clinicName: clinic?.name });
      await loadReceptionists();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add receptionist' });
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
  const missEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/miss`, { method: 'POST' }), 'Mark missed');
  const rejoinEntry = (id: string) =>
    call(() => api(`/queue/entry/${id}/rejoin`, { method: 'POST' }), 'Rejoin');

  return (
    <>
      <Header title="Reception" subtitle={clinic?.name} />
      <main className="mx-auto max-w-7xl px-4 py-5 space-y-4 animate-fade-in">

        {/* Tab bar */}
        <div className="tabs-bar">
          <button type="button" onClick={() => setTab('queue')} className={'tab ' + (tab === 'queue' ? 'tab-active' : 'tab-inactive')}>
            Queue
          </button>
          <button type="button" onClick={() => setTab('staff')} className={'tab ' + (tab === 'staff' ? 'tab-active' : 'tab-inactive')}>
            Staff
            <span className="ml-1.5 opacity-70 text-xs">({allDoctors.length} dr · {receptionists.length} rcp)</span>
          </button>
          <button type="button" onClick={() => setTab('history')} className={'tab ' + (tab === 'history' ? 'tab-active' : 'tab-inactive')}>
            History
          </button>
        </div>

        {/* ── Queue tab ── */}
        {tab === 'queue' && (
          <>
            {/* Doctor switcher */}
            {allDoctors.length > 0 ? (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select doctor</span>
                  <LiveIndicator connected={connected} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {allDoctors.map((d) => {
                    const isSelected = selectedDoctorId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDoctorId(d.id)}
                        className={`rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50 shadow-sm ring-2 ring-brand-500/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className={`font-semibold ${isSelected ? 'text-brand-700' : 'text-slate-800'}`}>
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
                No doctors yet.{' '}
                <button type="button" onClick={() => setTab('staff')} className="underline text-brand-600 font-medium">
                  Add one in Staff tab
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Quick add form */}
              <section className="card overflow-hidden lg:col-span-1">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="section-title">Add patient</h2>
                  {snapshot?.doctor && (
                    <div className="flex items-center gap-2">
                      <DoctorStatusPill status={snapshot.doctor.status} />
                    </div>
                  )}
                </div>
                <div className="p-5 space-y-3">
                  <form onSubmit={addPatient} className="space-y-2.5">
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
                      onChange={(raw, result) => { setPhone(raw); setPhoneResult(result); }}
                      required
                      autoComplete="off"
                    />
                    <select
                      className="input"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                    >
                      <option value={0}>Normal priority</option>
                      <option value={100}>🚨 Emergency (goes to top)</option>
                    </select>
                    {/* Walk-in + follow-up toggles — hidden for emergency */}
                    {priority < 100 && (
                      <div className="flex gap-4 py-0.5">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={walkin}
                            onChange={(e) => setWalkin(e.target.checked)}
                          />
                          <span className="text-slate-700">Walk-in</span>
                          <span className="text-[10px] text-slate-400">(inserts near current)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            checked={slotType === 'FOLLOWUP'}
                            onChange={(e) => setSlotType(e.target.checked ? 'FOLLOWUP' : 'NEW')}
                          />
                          <span className="text-slate-700">Follow-up</span>
                        </label>
                      </div>
                    )}
                    <textarea
                      className="input resize-none"
                      placeholder="Notes (optional)"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn-primary w-full"
                      disabled={busy || !selectedDoctorId || !phoneResult.ok}
                    >
                      {busy ? 'Adding…' : walkin ? '+ Walk-in (near current)' : '+ Add to queue'}
                    </button>
                  </form>

                  {/* Doctor quick controls */}
                  {snapshot?.doctor && (
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <div className="text-xs text-slate-500 flex items-center justify-between">
                        <span>
                          {snapshot.movingAvgMinutes != null
                            ? `~${Math.round(snapshot.movingAvgMinutes)} min/patient (live avg)`
                            : `${snapshot.doctor.avgConsultMinutes} min/patient (default)`
                          }
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
                          <button type="button" onClick={() => controlDoctor('resume')} className="btn-secondary !py-2 text-xs">
                            Resume
                          </button>
                        ) : (
                          <button type="button" onClick={() => controlDoctor('pause')} className="btn-secondary !py-2 text-xs">
                            Pause
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Live queue */}
              <section className="card overflow-hidden lg:col-span-2">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="section-title">
                    Live queue
                    {snapshot?.doctor && (
                      <span className="ml-2 text-sm font-normal text-slate-400">— {snapshot.doctor.user.name}</span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 text-xs">Now serving</span>
                    <span className="font-bold text-slate-800 font-mono">
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
                        onCancel={() => setEntryStatus(e.id, 'cancel')}
                        onEmergency={() => markEmergency(e.id)}
                        onMiss={() => missEntry(e.id)}
                      />
                    ))
                  ) : (
                    <div className="py-16 text-center">
                      <div className="text-4xl mb-2">📭</div>
                      <div className="text-sm text-slate-500">
                        {selectedDoctorId ? 'Queue is empty' : 'Select a doctor above'}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Missed patients panel — Feature 2 */}
            {(snapshot?.missedEntries ?? []).length > 0 && (
              <section className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
                  <h2 className="section-title text-rose-700">
                    Missed patients
                    <span className="ml-1 text-sm font-normal text-rose-400">— didn&apos;t appear when called</span>
                  </h2>
                  <span className="pill bg-rose-100 text-rose-700 ring-rose-200">{snapshot!.missedEntries!.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {snapshot!.missedEntries!.map((e) => (
                    <div key={e.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-bold text-rose-600 shrink-0">#{e.tokenNumber}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
                            {e.patient?.name ?? '—'}
                            {e.missedCount > 0 && (
                              <span className="pill bg-rose-100 text-rose-700 ring-rose-200 text-[10px]">
                                Missed ×{e.missedCount}
                              </span>
                            )}
                          </div>
                          {e.patient?.phone && (
                            <div className="text-xs text-slate-400">{e.patient.phone}</div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => rejoinEntry(e.id)}
                        className="btn-secondary !py-1.5 !px-3 text-xs text-brand-700 border-brand-200 hover:bg-brand-50 shrink-0"
                      >
                        Rejoin queue
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Staff tab ── */}
        {tab === 'staff' && (
          <div className="space-y-4">
            {/* Doctors */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <section className="card overflow-hidden lg:col-span-2 h-fit">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-xs font-bold shrink-0">+</span>
                  <h2 className="section-title">Add doctor</h2>
                </div>
                <div className="p-5">
                  <form onSubmit={addDoctor} className="space-y-2.5">
                    <input className="input" placeholder="Full name" value={docName} onChange={(e) => setDocName(e.target.value)} required />
                    <input className="input" type="email" placeholder="Email (for login)" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} />
                    <PhoneInput label={null} value={docPhone} onChange={(raw, result) => { setDocPhone(raw); setDocPhoneResult(result); }} autoComplete="off" />
                    <p className="text-[11px] text-slate-400">At least one of email / mobile is required.</p>
                    <DepartmentPicker options={departments} value={docDeptId} onChange={setDocDeptId} required />
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600 whitespace-nowrap shrink-0">Avg consult:</span>
                      <input className="input flex-1" type="number" min={1} max={120} value={docAvg} onChange={(e) => setDocAvg(Number(e.target.value))} required />
                      <span className="text-xs text-slate-400 shrink-0">min</span>
                    </label>
                    <button type="submit" className="btn-primary w-full" disabled={docBusy || (!docEmail && !docPhoneResult.ok)}>
                      {docBusy ? 'Adding…' : 'Add doctor'}
                    </button>
                  </form>
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    A temporary password is shown once — copy it before closing the dialog.
                  </p>
                </div>
              </section>

              <section className="card overflow-hidden lg:col-span-3">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="section-title">Doctors in {clinic?.name ?? 'your clinic'}</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{allDoctors.length}</span>
                </div>
                {allDoctors.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-4xl mb-2">🩺</div>
                    <p className="text-sm text-slate-500">No doctors yet — add the first one.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {allDoctors.map((d, idx) => (
                      <div key={d.id} className={`px-5 py-3.5 flex items-center justify-between gap-3 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800">{d.user.name}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                            <span>{d.deptName || 'No dept'}</span>
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

            {/* Receptionists */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <section className="card overflow-hidden lg:col-span-2 h-fit">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-xs font-bold shrink-0">+</span>
                  <h2 className="section-title">Add receptionist</h2>
                </div>
                <div className="p-5">
                  <form onSubmit={addReceptionist} className="space-y-2.5">
                    <input className="input" placeholder="Full name" value={recName} onChange={(e) => setRecName(e.target.value)} required />
                    <input className="input" type="email" placeholder="Email (for login)" value={recEmail} onChange={(e) => setRecEmail(e.target.value)} />
                    <PhoneInput label={null} value={recPhone} onChange={(raw, result) => { setRecPhone(raw); setRecPhoneResult(result); }} autoComplete="off" />
                    <p className="text-[11px] text-slate-400">At least one of email / mobile is required.</p>
                    <button type="submit" className="btn-primary w-full" disabled={recBusy || (!recEmail && !recPhoneResult.ok)}>
                      {recBusy ? 'Adding…' : 'Add receptionist'}
                    </button>
                  </form>
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    Temporary password shown once — copy it before closing.
                  </p>
                </div>
              </section>

              <section className="card overflow-hidden lg:col-span-3">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="section-title">Receptionists in {clinic?.name ?? 'your clinic'}</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{receptionists.length}</span>
                </div>
                {receptionists.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-4xl mb-2">👤</div>
                    <p className="text-sm text-slate-500">Add a peer using the form on the left.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {receptionists.map((r, idx) => (
                      <div key={r.id} className={`px-5 py-3.5 flex items-center justify-between gap-3 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{r.name}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                            {r.email && <span>{r.email}</span>}
                            {r.email && r.phone && <span>·</span>}
                            {r.phone && <span>{r.phone}</span>}
                            {!r.email && !r.phone && <span className="text-slate-400">no contact</span>}
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

        {/* ── History tab ── */}
        {tab === 'history' && (
          <div className="space-y-4">
            {allDoctors.length > 1 && (
              <div className="card p-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0">Filter:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorId(null)}
                    className={'tab !py-1.5 !px-3 text-xs ' + (!selectedDoctorId ? 'tab-active' : 'tab-inactive')}
                  >
                    All doctors
                  </button>
                  {allDoctors.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDoctorId(d.id)}
                      className={'tab !py-1.5 !px-3 text-xs ' + (selectedDoctorId === d.id ? 'tab-active' : 'tab-inactive')}
                    >
                      {d.user.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <section className="card p-5">
              <QueueHistoryTable
                doctorId={selectedDoctorId ?? undefined}
                showDoctorColumn={!selectedDoctorId}
                doctorName={selectedDoctorId ? allDoctors.find((d) => d.id === selectedDoctorId)?.user.name : undefined}
              />
            </section>
          </div>
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
    </>
  );
}

function QueueRow({
  entry,
  onComplete,
  onCancel,
  onEmergency,
  onMiss,
}: {
  entry: QueueEntry;
  onComplete: () => void;
  onCancel: () => void;
  onEmergency: () => void;
  onMiss: () => void;
}) {
  const isInConsult = entry.status === 'IN_CONSULTATION';
  return (
    <div className={`px-4 py-3.5 transition-colors ${isInConsult ? 'bg-emerald-50/60 border-l-4 border-l-emerald-400' : 'hover:bg-slate-50/60'}`}>
      {/* Top row — token + name + status */}
      <div className="flex items-start gap-3">
        <div className={`font-mono font-bold text-lg shrink-0 w-12 ${isInConsult ? 'text-emerald-700' : 'text-slate-800'}`}>
          #{entry.tokenNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
            {entry.patient?.name ?? '—'}
            {entry.priority >= 100 && <span className="pill bg-rose-100 text-rose-700 ring-rose-200 text-[10px]">🚨 Emergency</span>}
            {entry.walkin && <span className="pill bg-brand-100 text-brand-700 ring-brand-200 text-[10px]">Walk-in</span>}
            {entry.slotType === 'FOLLOWUP' && <span className="pill bg-purple-100 text-purple-700 ring-purple-200 text-[10px]">Follow-up</span>}
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
            <span>{entry.patient?.phone ?? '—'}</span>
            {entry.notes && <span className="text-slate-400 truncate">· {entry.notes}</span>}
          </div>
        </div>
        {/* ETA / status on the right */}
        <div className="text-right text-xs shrink-0">
          {entry.status === 'WAITING' && (
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

      {/* Bottom row — action buttons */}
      <div className="flex gap-1.5 mt-2.5 justify-end flex-wrap">
        {isInConsult && (
          <>
            <button type="button" onClick={onComplete} className="btn-success !px-3 !py-1.5 text-xs">
              ✓ Done
            </button>
            <button type="button" onClick={onMiss} className="btn-secondary !px-3 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200" title="Patient didn't appear when called">
              Missed
            </button>
          </>
        )}
        {entry.status === 'WAITING' && (
          <>
            <button
              type="button"
              onClick={onEmergency}
              title="Mark as emergency — moves to top of queue"
              className="btn-danger !px-3 !py-1.5 text-xs"
            >
              🚨
            </button>
            <button type="button" onClick={onMiss} className="btn-secondary !px-3 !py-1.5 text-xs text-rose-500 hover:bg-rose-50 border-rose-200" title="Patient didn't appear — add to missed queue">
              Missed
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary !px-3 !py-1.5 text-xs text-slate-500 hover:bg-slate-50" title="Remove patient from queue">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
