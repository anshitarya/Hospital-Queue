'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Clinic, type Doctor, type InviteCode } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
import { DepartmentPicker, type DepartmentOption } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import {
  DoctorCredentialsModal,
  type DoctorCredentials,
} from '@/components/DoctorCredentialsModal';
import { BUSINESS_TYPE_OPTIONS, getLabels, DEPARTMENT_PRESETS, type BusinessType } from '@/lib/labels';
import { HOSPITAL_DEPARTMENTS } from '@/lib/config';

export default function AdminPage() {
  const { ready } = useRequireRole(['ADMIN']);

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [clinicDoctors, setClinicDoctors] = useState<Doctor[]>([]);
  // Existing receptionists for the selected clinic — used to show the admin
  // who's already onboarded so they don't accidentally re-create.
  interface ReceptionistRow {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
  }
  const [clinicReceptionists, setClinicReceptionists] = useState<ReceptionistRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);

  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicBusinessType, setClinicBusinessType] = useState('CLINIC');
  const [createBusy, setCreateBusy] = useState(false);

  // Add-doctor form (admin-side, scoped to the currently selected clinic)
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docPhoneResult, setDocPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [docDeptId, setDocDeptId] = useState('');
  const [docAvg, setDocAvg] = useState(7);
  const [docBusy, setDocBusy] = useState(false);

  // Add-receptionist form (admin-only). Same shape as the doctor form minus
  // department / avg-consult.
  const [recName, setRecName] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoneResult, setRecPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [recBusy, setRecBusy] = useState(false);

  // The credentials modal is shared — doctor AND receptionist creation both
  // push their response into this single state.
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);

  // Overview stats shown in the dashboard header. Loaded on mount + after
  // every mutation so the counts stay in sync.
  interface OverviewStats {
    totals: { clinics: number; doctors: number; receptionists: number; patients: number };
    perClinic: { id: string; name: string; doctors: number; receptionists: number }[];
  }
  const [stats, setStats] = useState<OverviewStats | null>(null);

  // Page tabs. "manage" is the landing surface — that's where the admin
  // does their day-to-day work (create clinic, invite codes, add doctor /
  // receptionist, reset passwords). "overview" is the read-only summary.
  // Persisted via `?tab=` so refresh / browser-back keep the user where they
  // were instead of bouncing them to the default.
  const [tab, setTab] = useTabState<'overview' | 'manage'>('manage', ['overview', 'manage']);

  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Inline edit state for clinics
  const [editingClinicId, setEditingClinicId] = useState<string | null>(null);
  const [editClinicName, setEditClinicName] = useState('');
  const [editClinicAddress, setEditClinicAddress] = useState('');
  const [editClinicBusinessType, setEditClinicBusinessType] = useState('CLINIC');
  const [editClinicBusy, setEditClinicBusy] = useState(false);

  // Inline email edit state for staff (doctors + receptionists)
  const [editEmailUserId, setEditEmailUserId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [editEmailBusy, setEditEmailBusy] = useState(false);

  const loadClinics = useCallback(async () => {
    try {
      setLoadingClinics(true);
      const data = await api<Clinic[]>('/clinics');
      setClinics(data);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load clinics' });
    } finally {
      setLoadingClinics(false);
    }
  }, []);

  /**
   * Loads aggregate stats (total clinics / doctors / receptionists / patients
   * and a per-clinic breakdown). Failure here is non-fatal — we just show a
   * dash in the relevant card until the next reload.
   */
  const loadStats = useCallback(async () => {
    try {
      const s = await api<OverviewStats>('/clinics/stats/overview');
      setStats(s);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadClinics();
    loadStats();
  }, [ready, loadClinics, loadStats]);

  if (!ready) return <PageLoader label="Loading admin…" />;

  async function loadInviteCodes(clinicId: string) {
    try {
      const codes = await api<InviteCode[]>(`/clinics/${clinicId}/invite-codes`);
      setInviteCodes(codes);
    } catch {
      setInviteCodes([]);
    }
  }

  async function loadClinicDoctors(clinicId: string) {
    try {
      const doctors = await api<Doctor[]>(`/clinics/${clinicId}/doctors`);
      setClinicDoctors(doctors);
    } catch {
      setClinicDoctors([]);
    }
  }

  async function loadClinicReceptionists(clinicId: string) {
    try {
      const list = await api<ReceptionistRow[]>(`/clinics/${clinicId}/receptionists`);
      setClinicReceptionists(list);
    } catch {
      setClinicReceptionists([]);
    }
  }

  async function loadDepartments(businessType?: string | null) {
    try {
      const btype = (businessType ?? 'CLINIC') as BusinessType;
      const presets = DEPARTMENT_PRESETS[btype] ?? [];
      if (btype !== 'CLINIC' && presets.length > 0) {
        // Non-clinic: show only business-specific presets, not medical DB ones
        setDepartments(presets.map((p) => ({ id: `__new__${p}`, name: p })));
      } else {
        const fromDb = await api<DepartmentOption[]>('/clinics/my/departments');
        setDepartments(fromDb.length > 0 ? fromDb : HOSPITAL_DEPARTMENTS.map((n) => ({ id: `__new__${n}`, name: n })));
      }
    } catch {
      // Ignore — the picker will show an empty state.
    }
  }

  async function selectClinic(clinic: Clinic) {
    setSelectedClinic(clinic);
    // Reset the add-doctor form when switching clinics so we never accidentally
    // submit fields that referenced a different clinic.
    setDocName('');
    setDocEmail('');
    setDocPhone('');
    setDocPhoneResult({ ok: false });
    setDocDeptId('');
    setDocAvg(7);
    setDepartments([]);
    // Same for the add-receptionist form.
    setRecName('');
    setRecEmail('');
    setRecPhone('');
    setRecPhoneResult({ ok: false });
    await Promise.all([
      loadInviteCodes(clinic.id),
      loadClinicDoctors(clinic.id),
      loadClinicReceptionists(clinic.id),
      loadDepartments(clinic.businessType),
    ]);
  }

  /**
   * Reset a doctor's or receptionist's password.
   *
   * Important: we do NOT store the original password anywhere — argon2 hashes
   * are one-way. What this endpoint does is *generate a new* temp password,
   * overwrite the hash, and return the new plaintext exactly once. The admin
   * can then re-share it with the user. The user's old password stops working
   * immediately.
   *
   * UX: confirm before clicking (this is destructive — the user's current
   * password stops working). On success, surface the new creds in the same
   * modal we use for creation.
   */
  async function resetPassword(opts: {
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: 'doctor' | 'receptionist';
  }) {
    if (!selectedClinic) return;
    const ok = window.confirm(
      `Reset password for ${opts.name}?\n\n` +
        `Their current password will stop working immediately. You'll see the new ` +
        `temporary password on screen — copy it before closing.`,
    );
    if (!ok) return;
    try {
      const result = await api<{ user: { id: string }; tempPassword: string }>(
        `/clinics/${selectedClinic.id}/staff/${opts.userId}/reset-password`,
        { method: 'POST' },
      );
      setCreds({
        role: opts.role,
        name: opts.name,
        email: opts.email,
        phone: opts.phone,
        tempPassword: result.tempPassword,
        clinicName: selectedClinic.name,
      });
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to reset password',
      });
    }
  }

  /**
   * Direct receptionist creation. Same handoff as addDoctor — the response
   * carries a one-time temp password we surface via the shared modal.
   */
  async function addReceptionist(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) return;
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
      }>(`/clinics/${selectedClinic.id}/receptionists`, {
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
        clinicName: selectedClinic.name,
      });

      await Promise.all([
        loadClinicReceptionists(selectedClinic.id),
        loadClinics(),
        loadStats(),
      ]);
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to add receptionist',
      });
    } finally {
      setRecBusy(false);
    }
  }

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) return;
    if (!docEmail && !docPhoneResult.ok) {
      setToast({
        type: 'err',
        msg: 'Provide either an email or a valid mobile number for the doctor.',
      });
      return;
    }

    setDocBusy(true);
    try {
      let deptId = docDeptId;
      if (deptId.startsWith('__new__')) {
        const deptName = deptId.replace('__new__', '');
        const created = await api<{ id: string; name: string }>('/clinics/my/departments', {
          method: 'POST',
          body: { name: deptName },
        });
        deptId = created.id;
        setDepartments((prev) => prev.map((d) => d.id === docDeptId ? { ...d, id: created.id } : d));
      }
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>(`/clinics/${selectedClinic.id}/doctors`, {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: deptId,
          avgConsultMinutes: docAvg,
        },
      });

      // Reset the form fields …
      setDocName('');
      setDocEmail('');
      setDocPhone('');
      setDocPhoneResult({ ok: false });
      setDocDeptId('');
      setDocAvg(7);

      // … then surface the credentials in a persistent modal. The temp
      // password is shown only once, so we never use a toast for it.
      setCreds({
        role: 'doctor',
        name: result.doctor.user.name,
        email: result.doctor.user.email,
        phone: result.doctor.user.phone,
        tempPassword: result.tempPassword,
        clinicName: selectedClinic.name,
      });

      // Refresh both the per-clinic doctor list (visible directly below the
      // form) and the top-level clinic list (so the doctor-count chip updates).
      await Promise.all([
        loadClinicDoctors(selectedClinic.id),
        loadClinics(),
        loadStats(),
      ]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add doctor' });
    } finally {
      setDocBusy(false);
    }
  }

  function startEditClinic(c: Clinic) {
    setEditingClinicId(c.id);
    setEditClinicName(c.name);
    setEditClinicAddress(c.address ?? '');
    setEditClinicBusinessType(c.businessType ?? 'CLINIC');
  }

  async function saveEditClinic(clinicId: string) {
    if (!editClinicName.trim()) return;
    setEditClinicBusy(true);
    try {
      await api(`/clinics/${clinicId}`, {
        method: 'PATCH',
        body: { name: editClinicName, address: editClinicAddress || undefined, businessType: editClinicBusinessType },
      });
      setEditingClinicId(null);
      setToast({ type: 'ok', msg: 'Clinic updated.' });
      if (selectedClinic?.id === clinicId) {
        setSelectedClinic((prev) => prev ? { ...prev, name: editClinicName, address: editClinicAddress || prev.address, businessType: editClinicBusinessType } : prev);
      }
      await Promise.all([loadClinics(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update clinic' });
    } finally {
      setEditClinicBusy(false);
    }
  }

  async function handleDeleteClinic(clinicId: string, name: string) {
    const ok = window.confirm(
      `Delete "${name}"?\n\nThis permanently removes the clinic and all its doctors, queue data, and invite codes. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await api(`/clinics/${clinicId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `Clinic "${name}" deleted.` });
      if (selectedClinic?.id === clinicId) {
        setSelectedClinic(null);
        setInviteCodes([]);
        setClinicDoctors([]);
        setClinicReceptionists([]);
      }
      await Promise.all([loadClinics(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to delete clinic' });
    }
  }

  async function handleDeleteDoctor(doctorId: string, name: string) {
    if (!selectedClinic) return;
    const ok = window.confirm(
      `Remove Dr. ${name} from ${selectedClinic.name}?\n\nAny waiting queue entries for this doctor will be removed. Past consultation history is preserved.`,
    );
    if (!ok) return;
    try {
      await api(`/clinics/${selectedClinic.id}/doctors/${doctorId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `Dr. ${name} removed.` });
      await Promise.all([loadClinicDoctors(selectedClinic.id), loadClinics(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to delete doctor' });
    }
  }

  async function handleDeleteReceptionist(userId: string, name: string) {
    if (!selectedClinic) return;
    const ok = window.confirm(
      `Remove ${name} from ${selectedClinic.name}?\n\nThey will lose access to this clinic. Their past activity is preserved.`,
    );
    if (!ok) return;
    try {
      await api(`/clinics/${selectedClinic.id}/receptionists/${userId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      await Promise.all([loadClinicReceptionists(selectedClinic.id), loadClinics(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove receptionist' });
    }
  }

  function startEditEmail(userId: string, currentEmail: string | null) {
    setEditEmailUserId(userId);
    setEditEmailValue(currentEmail ?? '');
  }

  async function saveEditEmail(userId: string) {
    if (!selectedClinic || !editEmailValue.trim()) return;
    setEditEmailBusy(true);
    try {
      await api(`/clinics/${selectedClinic.id}/staff/${userId}/email`, {
        method: 'PATCH',
        body: { email: editEmailValue.trim() },
      });
      setEditEmailUserId(null);
      setEditEmailValue('');
      setToast({ type: 'ok', msg: 'Email updated.' });
      await Promise.all([
        loadClinicDoctors(selectedClinic.id),
        loadClinicReceptionists(selectedClinic.id),
      ]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update email' });
    } finally {
      setEditEmailBusy(false);
    }
  }

  async function createClinic(e: React.FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    try {
      await api<Clinic>('/clinics', {
        method: 'POST',
        body: { name: clinicName, address: clinicAddress || undefined, businessType: clinicBusinessType },
      });
      setClinicName('');
      setClinicAddress('');
      setClinicBusinessType('CLINIC');
      setToast({ type: 'ok', msg: `Clinic "${clinicName}" created.` });
      await Promise.all([loadClinics(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to create clinic' });
    } finally {
      setCreateBusy(false);
    }
  }

  async function generateCode(clinicId: string, clinicNameForMsg?: string) {
    try {
      const code = await api<InviteCode>(`/clinics/${clinicId}/invite-codes`, { method: 'POST' });
      setToast({
        type: 'ok',
        msg: `New invite code for ${clinicNameForMsg ?? 'clinic'}: ${code.code} (valid 48h)`,
      });
      if (selectedClinic?.id === clinicId) await loadInviteCodes(clinicId);
      await loadClinics();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to generate code' });
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setToast({ type: 'ok', msg: `${label} copied to clipboard` });
    });
  }

  function registerUrl(code: string) {
    return `${window.location.origin}/register?code=${code}`;
  }

  return (
    <>
      <Header title="Admin" />
      <main className="mx-auto max-w-6xl px-4 py-5 space-y-5 animate-fade-in">
        {/* Tab bar */}
        <div className="tabs-bar">
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={'tab ' + (tab === 'manage' ? 'tab-active' : 'tab-inactive')}
          >
            Manage businesses
            <span className="ml-1.5 opacity-70 text-xs">({clinics.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={'tab ' + (tab === 'overview' ? 'tab-active' : 'tab-inactive')}
          >
            Overview
          </button>
        </div>

        {tab === 'overview' && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Businesses"    value={stats?.totals.clinics}       icon="🏢" accent="from-brand-500 to-brand-700" />
              <StatCard label="Providers"     value={stats?.totals.doctors}       icon="👤" accent="from-sky-500 to-sky-700" />
              <StatCard label="Staff"         value={stats?.totals.receptionists} icon="🧑‍💼" accent="from-emerald-500 to-teal-600" />
              <StatCard label="Customers"     value={stats?.totals.patients}      icon="🙋" accent="from-violet-500 to-purple-700" />
            </section>

            {stats && stats.perClinic.length > 0 && (
              <section className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h2 className="section-title">Per-business breakdown</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{stats.perClinic.length} business(es)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50/50">
                        <th className="px-5 py-2.5 font-medium">Business</th>
                        <th className="px-5 py-2.5 font-medium">Providers</th>
                        <th className="px-5 py-2.5 font-medium">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.perClinic.map((c, idx) => (
                        <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="px-5 py-3 font-medium text-slate-800">{c.name}</td>
                          <td className="px-5 py-3 text-slate-600 tabular-nums">{c.doctors}</td>
                          <td className="px-5 py-3 text-slate-600 tabular-nums">{c.receptionists}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'manage' && (
          <>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Create clinic */}
          <section className="card overflow-hidden lg:col-span-2 h-fit">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-xs font-bold">+</span>
              <h2 className="section-title">New business</h2>
            </div>
            <div className="p-5">
              <form onSubmit={createClinic} className="space-y-2.5">
                <input
                  className="input"
                  placeholder="Business name"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  placeholder="Address (optional)"
                  value={clinicAddress}
                  onChange={(e) => setClinicAddress(e.target.value)}
                />
                <select className="input" value={clinicBusinessType} onChange={(e) => setClinicBusinessType(e.target.value)}>
                  {BUSINESS_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button type="submit" className="btn-primary w-full" disabled={createBusy}>
                  {createBusy ? 'Creating…' : 'Create business'}
                </button>
              </form>
            </div>
          </section>

          {/* Clinic list */}
          <section className="card overflow-hidden lg:col-span-3">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="section-title">All businesses</h2>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{clinics.length}</span>
            </div>

            {loadingClinics ? (
              <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
            ) : clinics.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-2">🏢</div>
                <p className="text-sm text-slate-500">No businesses yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {clinics.map((c, idx) => {
                  const isSelected = selectedClinic?.id === c.id;
                  const isEditing = editingClinicId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`px-5 py-4 transition-colors ${
                        isSelected ? 'bg-brand-50 border-l-4 border-l-brand-500' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
                      }`}
                    >
                      {isEditing ? (
                        /* Inline edit form */
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              className="input !py-1.5 flex-1"
                              placeholder="Business name"
                              value={editClinicName}
                              onChange={(e) => setEditClinicName(e.target.value)}
                            />
                            <input
                              className="input !py-1.5 flex-1"
                              placeholder="Address (optional)"
                              value={editClinicAddress}
                              onChange={(e) => setEditClinicAddress(e.target.value)}
                            />
                          </div>
                          <select className="input !py-1.5 text-xs" value={editClinicBusinessType} onChange={(e) => setEditClinicBusinessType(e.target.value)}>
                            {BUSINESS_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setEditingClinicId(null)} className="btn-ghost !py-1.5 !px-3 text-xs">Cancel</button>
                            <button type="button" onClick={() => saveEditClinic(c.id)} disabled={editClinicBusy || !editClinicName.trim()} className="btn-primary !py-1.5 !px-3 text-xs">
                              {editClinicBusy ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`font-semibold truncate ${isSelected ? 'text-brand-800' : 'text-slate-800'}`}>
                              {c.name}
                              {isSelected && (
                                <span className="ml-2 text-[10px] font-medium text-brand-600 bg-brand-100 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                                  active
                                </span>
                              )}
                            </div>
                            {c.address && <div className="text-xs text-slate-500 truncate mt-0.5">{c.address}</div>}
                            <div className="text-xs text-slate-400 mt-0.5 flex gap-2 items-center">
                              <span>{c._count?.users ?? 0} rcp</span>
                              <span>·</span>
                              <span>{c._count?.doctors ?? 0} dr</span>
                              {c.businessType && c.businessType !== 'CLINIC' && (
                                <span className="pill bg-violet-100 text-violet-700 ring-violet-200 text-[10px]">
                                  {BUSINESS_TYPE_OPTIONS.find((o) => o.value === c.businessType)?.label ?? c.businessType}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditClinic(c)}
                              className="btn-secondary !py-1.5 !px-2.5 text-xs"
                              title="Edit clinic name / address"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClinic(c.id, c.name)}
                              className="btn-secondary !py-1.5 !px-2.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                              title="Permanently delete this clinic"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => selectClinic(c)}
                              className={isSelected ? 'btn-secondary !py-1.5 !px-3 text-xs text-brand-700 border-brand-200 bg-brand-50 hover:bg-brand-100' : 'btn-secondary !py-1.5 !px-3 text-xs'}
                            >
                              {isSelected ? 'Managing' : 'Manage'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Invite codes for selected clinic */}
        {selectedClinic && (
          <section className="card overflow-hidden animate-fade-in">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="section-title">
                  Invite codes — <span className="text-brand-700">{selectedClinic.name}</span>
                </h2>
                <p className="section-sub">
                  Each code lets one staff member self-register. Expires in 48h.
                </p>
              </div>
              <button
                type="button"
                onClick={() => generateCode(selectedClinic.id, selectedClinic.name)}
                className="btn-primary !px-3 !py-1.5 text-xs shrink-0"
              >
                + Generate code
              </button>
            </div>

            {inviteCodes.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No invite codes yet. Generate one above.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inviteCodes.map((ic, idx) => {
                  const expired = new Date(ic.expiresAt) < new Date();
                  const used = !!ic.usedById;
                  const active = !used && !expired;
                  return (
                    <div key={ic.id} className={`px-5 py-4 flex items-center justify-between gap-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <div className="min-w-0">
                        <div className={`font-mono font-bold text-lg tracking-widest ${active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                          {ic.code}
                        </div>
                        <div className="text-xs mt-0.5">
                          {used && <span className="text-emerald-700">✓ Used by {ic.usedBy?.name}{ic.usedBy?.phone && ` (${ic.usedBy.phone})`}</span>}
                          {!used && expired && <span className="text-rose-500">Expired</span>}
                          {active && <span className="text-slate-500">Expires {new Date(ic.expiresAt).toLocaleDateString()} {new Date(ic.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      </div>
                      {active && (
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={() => copy(ic.code, 'Code')} className="btn-secondary !px-3 !py-1.5 text-xs">Copy code</button>
                          <button type="button" onClick={() => copy(registerUrl(ic.code), 'Link')} className="btn-primary !px-3 !py-1.5 text-xs">Copy link</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Staff / Receptionists panel */}
        {selectedClinic && (() => {
          const RL = getLabels(selectedClinic.businessType);
          return (
          <section className="card overflow-hidden animate-fade-in">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="section-title">{RL.staff}s — <span className="text-brand-700">{selectedClinic.name}</span></h2>
                <p className="section-sub">Add directly with a temp password, or share an invite code above.</p>
              </div>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{clinicReceptionists.length}</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <form onSubmit={addReceptionist} className="space-y-2.5 lg:col-span-2 card-inset p-4 h-fit rounded-xl">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs font-bold">+</span>
                    New {RL.staff.toLowerCase()}
                  </h3>
                  <input className="input" placeholder="Full name" value={recName} onChange={(e) => setRecName(e.target.value)} required />
                  <input className="input" type="email" placeholder="Email (for login)" value={recEmail} onChange={(e) => setRecEmail(e.target.value)} />
                  <PhoneInput label={null} value={recPhone} onChange={(raw, result) => { setRecPhone(raw); setRecPhoneResult(result); }} autoComplete="off" />
                  <p className="text-[11px] text-slate-400">At least one of email / mobile is required.</p>
                  <button type="submit" className="btn-primary w-full" disabled={recBusy || (!recEmail && !recPhoneResult.ok)}>
                    {recBusy ? 'Adding…' : `Add ${RL.staff.toLowerCase()}`}
                  </button>
                </form>
                <div className="lg:col-span-3">
                  {clinicReceptionists.length === 0 ? (
                    <div className="py-12 text-center rounded-xl ring-1 ring-slate-200 bg-slate-50">
                      <div className="text-4xl mb-2">👤</div>
                      <p className="text-sm text-slate-500">No {RL.staff.toLowerCase()}s yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 overflow-hidden">
                      {clinicReceptionists.map((r, idx) => (
                        <div key={r.id} className={`px-4 py-3.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">{r.name}</div>
                              <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                                {r.email && <span>{r.email}</span>}
                                {r.email && r.phone && <span>·</span>}
                                {r.phone && <span>{r.phone}</span>}
                                {!r.email && !r.phone && <span className="text-slate-400">no contact</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              <span className="text-xs text-slate-400 hidden sm:block">{new Date(r.createdAt).toLocaleDateString()}</span>
                              <button type="button" onClick={() => startEditEmail(r.id, r.email)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                Edit email
                              </button>
                              <button type="button" onClick={() => resetPassword({ userId: r.id, name: r.name, email: r.email, phone: r.phone, role: 'receptionist' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                Reset pwd
                              </button>
                              <button type="button" onClick={() => handleDeleteReceptionist(r.id, r.name)} className="btn-secondary !px-2.5 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200">
                                Remove
                              </button>
                            </div>
                          </div>
                          {editEmailUserId === r.id && (
                            <div className="mt-2 flex gap-2">
                              <input
                                autoFocus
                                type="email"
                                className="input !py-1.5 flex-1"
                                placeholder="New email address"
                                value={editEmailValue}
                                onChange={(e) => setEditEmailValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEditEmail(r.id); if (e.key === 'Escape') setEditEmailUserId(null); }}
                              />
                              <button type="button" onClick={() => saveEditEmail(r.id)} disabled={editEmailBusy || !editEmailValue.trim()} className="btn-primary !py-1.5 !px-3 text-xs">
                                {editEmailBusy ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditEmailUserId(null)} className="btn-ghost !py-1.5 !px-2 text-xs">Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          );
        })()}

        {/* Doctors panel */}
        {selectedClinic && (() => {
          const SL = getLabels(selectedClinic.businessType);
          return (
          <section className="card overflow-hidden animate-fade-in">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="section-title">{SL.providerPlural} — <span className="text-brand-700">{selectedClinic.name}</span></h2>
                <p className="section-sub">Temporary password is generated and shown once — copy before closing.</p>
              </div>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{clinicDoctors.length}</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <form onSubmit={addDoctor} className="space-y-2.5 lg:col-span-2 card-inset p-4 h-fit rounded-xl">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs font-bold">+</span>
                    New {SL.provider.toLowerCase()}
                  </h3>
                  <input className="input" placeholder="Full name" value={docName} onChange={(e) => setDocName(e.target.value)} required />
                  <input className="input" type="email" placeholder="Email (for login)" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} />
                  <PhoneInput label={null} value={docPhone} onChange={(raw, result) => { setDocPhone(raw); setDocPhoneResult(result); }} autoComplete="off" />
                  <p className="text-[11px] text-slate-400">At least one of email / mobile is required.</p>
                  <DepartmentPicker options={departments} value={docDeptId} onChange={setDocDeptId} required />
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 whitespace-nowrap shrink-0">Avg {SL.service.toLowerCase()}:</span>
                    <input className="input flex-1" type="number" min={1} max={120} value={docAvg} onChange={(e) => setDocAvg(Number(e.target.value))} required />
                    <span className="text-xs text-slate-400 shrink-0">{SL.perCustomer}</span>
                  </label>
                  <button type="submit" className="btn-primary w-full" disabled={docBusy || (!docEmail && !docPhoneResult.ok)}>
                    {docBusy ? 'Adding…' : `Add ${SL.provider.toLowerCase()}`}
                  </button>
                </form>
                <div className="lg:col-span-3">
                  {clinicDoctors.length === 0 ? (
                    <div className="py-12 text-center rounded-xl ring-1 ring-slate-200 bg-slate-50">
                      <div className="text-4xl mb-2">🩺</div>
                      <p className="text-sm text-slate-500">No {SL.providerPlural.toLowerCase()} yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 overflow-hidden">
                      {clinicDoctors.map((d, idx) => (
                        <div key={d.id} className={`px-4 py-3.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">{d.user.name}</div>
                              <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                                <span>{d.department?.name ?? 'No dept'}</span>
                                <span>· ~{d.avgConsultMinutes} min</span>
                                {d.user.email && <span>· {d.user.email}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              <button type="button" onClick={() => startEditEmail(d.userId, d.user.email ?? null)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                Edit email
                              </button>
                              <button type="button" onClick={() => resetPassword({ userId: d.userId, name: d.user.name, email: d.user.email ?? null, phone: (d.user as { phone?: string | null }).phone ?? null, role: 'doctor' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                Reset pwd
                              </button>
                              <button type="button" onClick={() => handleDeleteDoctor(d.id, d.user.name)} className="btn-secondary !px-2.5 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200">
                                Remove
                              </button>
                            </div>
                          </div>
                          {editEmailUserId === d.userId && (
                            <div className="mt-2 flex gap-2">
                              <input
                                autoFocus
                                type="email"
                                className="input !py-1.5 flex-1"
                                placeholder="New email address"
                                value={editEmailValue}
                                onChange={(e) => setEditEmailValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEditEmail(d.userId); if (e.key === 'Escape') setEditEmailUserId(null); }}
                              />
                              <button type="button" onClick={() => saveEditEmail(d.userId)} disabled={editEmailBusy || !editEmailValue.trim()} className="btn-primary !py-1.5 !px-3 text-xs">
                                {editEmailBusy ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditEmailUserId(null)} className="btn-ghost !py-1.5 !px-2 text-xs">Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          );
        })()}

          </>
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

/**
 * Compact stat card. `value` is rendered as "—" when the stats endpoint has
 * not responded yet — better than showing 0 which would be misleading.
 */
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | undefined;
  icon: string;
  accent: string;
}) {
  const display = value === undefined ? '—' : value.toLocaleString();
  return (
    <div className="card p-4 flex items-center gap-3.5 hover:shadow-md transition-shadow">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white text-2xl shadow-sm shrink-0`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-3xl font-bold leading-none tabular-nums tracking-tight">{display}</div>
        <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}
