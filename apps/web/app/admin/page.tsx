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

  // In-page reset-password confirmation (replaces window.confirm which is
  // blocked in TWA / Chrome Custom Tabs).
  type ResetTarget = {
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: 'doctor' | 'receptionist';
  };
  const [confirmReset, setConfirmReset] = useState<ResetTarget | null>(null);

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

  async function loadDepartments() {
    // Departments are global — same list shown in the receptionist UI.
    // We load them lazily the first time a clinic is opened.
    if (departments.length > 0) return;
    try {
      const list = await api<DepartmentOption[]>('/clinics/my/departments');
      setDepartments(list);
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
    // Same for the add-receptionist form.
    setRecName('');
    setRecEmail('');
    setRecPhone('');
    setRecPhoneResult({ ok: false });
    await Promise.all([
      loadInviteCodes(clinic.id),
      loadClinicDoctors(clinic.id),
      loadClinicReceptionists(clinic.id),
      loadDepartments(),
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
  /** Step 1 — show the in-page confirmation modal instead of window.confirm */
  function requestResetPassword(opts: ResetTarget) {
    setConfirmReset(opts);
  }

  /** Step 2 — called when the user confirms inside the modal */
  async function executeResetPassword() {
    if (!confirmReset || !selectedClinic) return;
    const opts = confirmReset;
    setConfirmReset(null);
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
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>(`/clinics/${selectedClinic.id}/doctors`, {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: docDeptId,
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

  async function createClinic(e: React.FormEvent) {
    e.preventDefault();
    setCreateBusy(true);
    try {
      await api<Clinic>('/clinics', {
        method: 'POST',
        body: { name: clinicName, address: clinicAddress || undefined },
      });
      setClinicName('');
      setClinicAddress('');
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
      <main className="mx-auto max-w-6xl p-4 space-y-5 animate-fade-in">
        {/* Page intro — heading text is driven by the active tab so the
            page title always reflects what the admin is currently looking at. */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {tab === 'overview' ? 'Overview' : 'Manage clinics'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tab === 'overview'
                ? 'At-a-glance counts across every clinic. Switch to Manage to make changes.'
                : 'Create new clinics, invite receptionists, and add doctors directly.'}
            </p>
          </div>
        </div>

        {/* Tab bar — Manage clinics is the primary surface and comes first;
            Overview is a secondary read-only summary. */}
        <div className="flex gap-1 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={'tab ' + (tab === 'manage' ? 'tab-active' : 'tab-inactive')}
          >
            Manage clinics{' '}
            <span className="opacity-60">({clinics.length})</span>
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
            {/* ── Overview stats ────────────────────────────────────────── */}
            {/* Four count cards. Each renders "—" until the stats endpoint
                responds; the count refreshes after every mutation made on
                the Manage tab. */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Clinics" value={stats?.totals.clinics} icon="🏥" accent="from-brand-500 to-brand-700" />
              <StatCard label="Doctors" value={stats?.totals.doctors} icon="🩺" accent="from-sky-500 to-sky-700" />
              <StatCard label="Receptionists" value={stats?.totals.receptionists} icon="👤" accent="from-emerald-500 to-teal-600" />
              <StatCard label="Patients" value={stats?.totals.patients} icon="👨‍⚕️" accent="from-violet-500 to-purple-700" />
            </section>

            {/* Per-clinic breakdown — horizontally scrollable on small screens
                via overflow-x-auto so the table never breaks the layout. */}
            {stats && stats.perClinic.length > 0 && (
              <section className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Per-clinic breakdown</h2>
                  <span className="text-xs text-slate-400">{stats.perClinic.length} clinic(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <th className="py-2 pr-4 font-medium">Clinic</th>
                        <th className="py-2 pr-4 font-medium">Doctors</th>
                        <th className="py-2 pr-4 font-medium">Receptionists</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.perClinic.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 pr-4 font-medium">{c.name}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.doctors}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.receptionists}</td>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Create clinic */}
          <section className="card p-5 space-y-3 h-fit">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">+</span>
              New clinic
            </h2>
            <form onSubmit={createClinic} className="space-y-2">
              <input
                className="input"
                placeholder="Clinic name"
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
              <button type="submit" className="btn-primary w-full" disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create clinic'}
              </button>
            </form>
          </section>

          {/* Clinic list */}
          <section className="card p-5 lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">All clinics</h2>
              <span className="text-xs text-slate-400">{clinics.length} total</span>
            </div>

            {loadingClinics ? (
              <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
            ) : clinics.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-4xl mb-2">🏥</div>
                <p className="text-sm text-slate-500">No clinics yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {clinics.map((c) => {
                  const isSelected = selectedClinic?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      className={
                        'py-3 flex items-center justify-between gap-3 transition-colors ' +
                        (isSelected ? '-mx-5 px-5 bg-brand-50/40' : '')
                      }
                    >
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {c.name}
                          {isSelected && <span className="text-xs text-brand-600">selected</span>}
                        </div>
                        {c.address && <div className="text-xs text-slate-500 truncate">{c.address}</div>}
                        <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                          <span>{c._count?.users ?? 0} receptionist(s)</span>
                          <span>{c._count?.doctors ?? 0} doctor(s)</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {/* One button only — Manage opens the panel that has
                            both invite codes (for receptionists) and direct
                            add-doctor / add-receptionist forms. */}
                        <button
                          type="button"
                          onClick={() => selectClinic(c)}
                          className={
                            'btn-primary !px-3 !py-1.5 text-xs ' +
                            (isSelected ? '' : '')
                          }
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Invite codes for selected clinic */}
        {selectedClinic && (
          <section className="card p-5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">
                  Invite codes for receptionist —{' '}
                  <span className="text-brand-700">{selectedClinic.name}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each code lets one receptionist self-register with a password they choose. Codes
                  expire in 48h. To skip self-service and create a receptionist directly with a
                  temporary password, use the form below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => generateCode(selectedClinic.id, selectedClinic.name)}
                className="btn-primary !px-3 !py-1.5 text-sm"
              >
                Generate new code
              </button>
            </div>

            {inviteCodes.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No invite codes yet. Generate one to invite a receptionist.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inviteCodes.map((ic) => {
                  const expired = new Date(ic.expiresAt) < new Date();
                  const used = !!ic.usedById;
                  const active = !used && !expired;
                  return (
                    <div key={ic.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className={
                          'font-mono font-semibold text-lg tracking-widest ' +
                          (active ? 'text-slate-900' : 'text-slate-400 line-through')
                        }>
                          {ic.code}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 space-x-2">
                          {used && (
                            <span className="text-emerald-700">
                              ✓ Used by {ic.usedBy?.name}
                              {ic.usedBy?.phone && ` (${ic.usedBy.phone})`}
                            </span>
                          )}
                          {!used && expired && <span className="text-rose-500">Expired</span>}
                          {active && (
                            <span>Expires {new Date(ic.expiresAt).toLocaleDateString()} {new Date(ic.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </div>

                      {active && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => copy(ic.code, 'Code')}
                            className="btn-secondary !px-3 !py-1.5 text-xs"
                          >
                            Copy code
                          </button>
                          <button
                            type="button"
                            onClick={() => copy(registerUrl(ic.code), 'Link')}
                            className="btn-primary !px-3 !py-1.5 text-xs"
                          >
                            Copy link
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ─── Receptionists panel ─────────────────────────────────────────── */}
        {selectedClinic && (
          <section className="card p-5 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">
                  Receptionists —{' '}
                  <span className="text-brand-700">{selectedClinic.name}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add a receptionist directly with a temporary password. They can change
                  it after the first sign-in.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {clinicReceptionists.length} receptionist(s)
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Add-receptionist form */}
              <form
                onSubmit={addReceptionist}
                className="space-y-2 lg:col-span-1 rounded-lg ring-1 ring-slate-200 p-4 bg-slate-50/40 h-fit"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">
                    +
                  </span>
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

              {/* Existing receptionists list */}
              <div className="lg:col-span-2">
                {clinicReceptionists.length === 0 ? (
                  <div className="py-10 text-center rounded-lg ring-1 ring-slate-200 bg-slate-50/40">
                    <div className="text-4xl mb-2">👤</div>
                    <p className="text-sm text-slate-500">
                      No receptionists yet. Add one directly or share an invite code above.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 px-3">
                    {clinicReceptionists.map((r) => (
                      <div
                        key={r.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400 hidden sm:inline">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              requestResetPassword({
                                userId: r.id,
                                name: r.name,
                                email: r.email,
                                phone: r.phone,
                                role: 'receptionist',
                              })
                            }
                            className="btn-secondary !px-2.5 !py-2 text-xs whitespace-nowrap"
                            title="Generate a new temporary password"
                          >
                            Reset password
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ─── Doctors panel for the selected clinic ───────────────────────── */}
        {selectedClinic && (
          <section className="card p-5 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">
                  Doctors — <span className="text-brand-700">{selectedClinic.name}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add a doctor directly (no invite code needed). A temporary password is
                  generated and shown once — copy it before closing.
                </p>
              </div>
              <span className="text-xs text-slate-400">{clinicDoctors.length} doctor(s)</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Add-doctor form */}
              <form
                onSubmit={addDoctor}
                className="space-y-2 lg:col-span-1 rounded-lg ring-1 ring-slate-200 p-4 bg-slate-50/40 h-fit"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs">+</span>
                  New doctor
                </h3>

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
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  At least one of email / mobile is required.
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

              {/* Existing doctors list */}
              <div className="lg:col-span-2">
                {clinicDoctors.length === 0 ? (
                  <div className="py-10 text-center rounded-lg ring-1 ring-slate-200 bg-slate-50/40">
                    <div className="text-4xl mb-2">🩺</div>
                    <p className="text-sm text-slate-500">
                      No doctors yet. Use the form on the left to add the first one.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 px-3">
                    {clinicDoctors.map((d) => (
                      <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{d.user.name}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                            <span>{d.department?.name ?? 'No department'}</span>
                            {d.user.email && <span>· {d.user.email}</span>}
                            {d.user.phone && <span>· {d.user.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400 hidden sm:inline">
                            ~{d.avgConsultMinutes} min
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              requestResetPassword({
                                userId: d.userId,
                                name: d.user.name,
                                email: d.user.email ?? null,
                                phone: (d.user as { phone?: string | null }).phone ?? null,
                                role: 'doctor',
                              })
                            }
                            className="btn-secondary !px-2.5 !py-2 text-xs whitespace-nowrap"
                            title="Generate a new temporary password"
                          >
                            Reset password
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

          </>
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <DoctorCredentialsModal
        credentials={creds}
        onClose={() => setCreds(null)}
      />

      {/* ── In-page reset-password confirmation modal ─────────────────────
          window.confirm() is silently suppressed in TWA / Chrome Custom Tabs,
          so we use a proper modal overlay instead.
      ─────────────────────────────────────────────────────────────────── */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setConfirmReset(null)}
        >
          <div
            className="card w-full max-w-sm p-6 space-y-4 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                ⚠
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Reset password?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  This will immediately invalidate{' '}
                  <span className="font-medium">{confirmReset.name}</span>&apos;s current
                  password. You&apos;ll see the new temporary password on screen — copy it
                  before closing.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmReset(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeResetPassword}
                className="btn-danger"
              >
                Yes, reset
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="card p-4 flex items-center gap-3">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white text-xl shadow-sm shrink-0`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight tabular-nums">{display}</div>
        <div className="text-xs text-slate-500 truncate">{label}</div>
      </div>
    </div>
  );
}
