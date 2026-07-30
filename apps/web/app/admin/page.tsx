'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Clinic, type Doctor, type InviteCode, type BusinessSignupRequest, type SignupRequestStatus } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { useTabState } from '@/lib/useTabState';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { AdminPageSkeleton } from '@/components/Skeleton';
import { Toast, type ToastMessage } from '@/components/Toast';
import { DepartmentPicker, type DepartmentOption } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import {
  DoctorCredentialsModal,
  type DoctorCredentials,
} from '@/components/DoctorCredentialsModal';
import { formatDateIst, formatDateTimeIst, formatTimeIst } from '@/lib/datetime';
import { BUSINESS_TYPE_OPTIONS, getLabels, departmentPresetsFor, normalizeBusinessType, type BusinessType } from '@/lib/labels';
import { HOSPITAL_DEPARTMENTS } from '@/lib/config';
import dynamic from 'next/dynamic';
const LocationPickerModal = dynamic(() => import('@/components/LocationPickerModal'), { ssr: false });
import { Icon } from '@/components/Icons';

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
    loginId?: string | null;
    status?: 'PENDING' | 'ACTIVE' | 'DISABLED';
    createdAt: string;
  }
  const [clinicReceptionists, setClinicReceptionists] = useState<ReceptionistRow[]>([]);
  const [clinicAdmins, setClinicAdmins] = useState<ReceptionistRow[]>([]);
  const [clinicManagers, setClinicManagers] = useState<(ReceptionistRow & { locations?: { location: { name: string } }[] })[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);

  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [isCreateMapOpen, setIsCreateMapOpen] = useState(false);
  const [clinicBusinessType, setClinicBusinessType] = useState('CLINIC');
  const [createBusy, setCreateBusy] = useState(false);

  // Add-doctor form (admin-side, scoped to the currently selected clinic)
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docPhoneResult, setDocPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [docDeptId, setDocDeptId] = useState('');
  const [docAvg, setDocAvg] = useState(7);
  const [docLanguages, setDocLanguages] = useState('');
  const [docBusy, setDocBusy] = useState(false);

  // Add-receptionist form (admin-only). Same shape as the doctor form minus
  // department / avg-consult.
  const [recName, setRecName] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoneResult, setRecPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [recBusy, setRecBusy] = useState(false);

  const [baName, setBaName] = useState('');
  const [baEmail, setBaEmail] = useState('');
  const [baPhone, setBaPhone] = useState('');
  const [baPhoneResult, setBaPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [baBusy, setBaBusy] = useState(false);

  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrPhone, setMgrPhone] = useState('');
  const [mgrPhoneResult, setMgrPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [mgrBusy, setMgrBusy] = useState(false);

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
  const [tab, setTab] = useTabState<'overview' | 'manage' | 'requests' | 'billing'>('manage', ['overview', 'manage', 'requests', 'billing']);

  const [signupRequests, setSignupRequests] = useState<BusinessSignupRequest[]>([]);
  const [pendingSignupCount, setPendingSignupCount] = useState(0);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState<SignupRequestStatus | 'ALL'>('PENDING');

  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Billing state variables
  const [billingStats, setBillingStats] = useState<{ totals: { activeBusinesses: number; activePlans: number; totalOutstanding: number; monthlyRevenue: number; totalEvents30Days: number }; planDistribution: Record<string, number> } | null>(null);
  const [billingBusinesses, setBillingBusinesses] = useState<any[]>([]);
  const [billingPlans, setBillingPlans] = useState<any[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);

  // Modals state
  const [selectedBillingClinic, setSelectedBillingClinic] = useState<any | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showInvoicesListModal, setShowInvoicesListModal] = useState(false);
  const [invoicesListClinic, setInvoicesListClinic] = useState<any | null>(null);

  // Plan management
  const [targetPlanId, setTargetPlanId] = useState('');
  const [customTokenPrice, setCustomTokenPrice] = useState('');

  // Invoice management
  const [invoiceStartDate, setInvoiceStartDate] = useState('');
  const [invoiceEndDate, setInvoiceEndDate] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('0');
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  // Create plan form
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  const [newPlanTokenPrice, setNewPlanTokenPrice] = useState('5');
  const [newPlanFixedCost, setNewPlanFixedCost] = useState('0');
  const [createPlanBusy, setCreatePlanBusy] = useState(false);
  const [platformInvoices, setPlatformInvoices] = useState<any[]>([]);

  // Filters
  const [billingSearch, setBillingSearch] = useState('');
  const [billingFilterPlan, setBillingFilterPlan] = useState('ALL');
  const [billingFilterCycle, setBillingFilterCycle] = useState('ALL');

  // Inline edit state for clinics
  const [editingClinicId, setEditingClinicId] = useState<string | null>(null);
  const [editClinicName, setEditClinicName] = useState('');
  const [editClinicAddress, setEditClinicAddress] = useState('');
  const [isEditMapOpen, setIsEditMapOpen] = useState(false);
  const [editClinicBusinessType, setEditClinicBusinessType] = useState('CLINIC');
  const [editClinicBusy, setEditClinicBusy] = useState(false);

  // Inline email edit state for staff (doctors + receptionists)
  const [editEmailUserId, setEditEmailUserId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [editEmailBusy, setEditEmailBusy] = useState(false);

  const loadBillingData = useCallback(async () => {
    try {
      setLoadingBilling(true);
      const [statsData, businessesData, plansData, invoicesData] = await Promise.all([
        api<any>('/billing/dashboard'),
        api<any[]>('/billing/businesses'),
        api<any[]>('/billing/plans'),
        api<any[]>('/billing/invoices'),
      ]);
      setBillingStats(statsData);
      setBillingBusinesses(businessesData);
      setBillingPlans(plansData);
      setPlatformInvoices(invoicesData);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load billing telemetry' });
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  useEffect(() => {
    if (ready && tab === 'billing') {
      loadBillingData();
    }
  }, [ready, tab, loadBillingData]);

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillingClinic) return;
    try {
      const customPricing = customTokenPrice.trim() ? { TOKEN_COMPLETED: parseFloat(customTokenPrice) } : undefined;
      await api(`/billing/businesses/${selectedBillingClinic.id}/assign-plan`, {
        method: 'POST',
        body: { planId: targetPlanId, customPricing },
      });
      setToast({ type: 'ok', msg: `Billing plan updated for ${selectedBillingClinic.name}` });
      setShowPlanModal(false);
      setCustomTokenPrice('');
      loadBillingData();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to assign plan' });
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillingClinic || !invoiceStartDate || !invoiceEndDate) return;
    try {
      setInvoiceBusy(true);
      const res = await api<any>(`/billing/businesses/${selectedBillingClinic.id}/generate-invoice`, {
        method: 'POST',
        body: {
          startDate: new Date(invoiceStartDate).toISOString(),
          endDate: new Date(invoiceEndDate).toISOString(),
          discount: parseFloat(invoiceDiscount) || 0,
        },
      });
      setToast({ type: 'ok', msg: `Invoice ${res.invoiceNumber} generated successfully!` });
      setShowInvoiceModal(false);
      loadBillingData();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to generate invoice' });
    } finally {
      setInvoiceBusy(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName.trim()) return;
    try {
      setCreatePlanBusy(true);
      const rules = [
        {
          eventType: 'TOKEN_COMPLETED',
          price: parseFloat(newPlanTokenPrice) || 0,
          ruleType: 'PER_EVENT',
        },
      ];
      const fixedCost = parseFloat(newPlanFixedCost);
      if (fixedCost > 0) {
        rules.push({
          eventType: 'SYSTEM_ACCESS',
          price: fixedCost,
          ruleType: 'FLAT_RATE',
        });
      }

      await api('/billing/plans', {
        method: 'POST',
        body: {
          name: newPlanName,
          description: newPlanDescription,
          rules,
        },
      });
      setToast({ type: 'ok', msg: `Billing plan "${newPlanName}" created successfully!` });
      setNewPlanName('');
      setNewPlanDescription('');
      setNewPlanTokenPrice('5');
      setNewPlanFixedCost('0');
      setShowCreatePlanModal(false);
      loadBillingData();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to create plan' });
    } finally {
      setCreatePlanBusy(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this billing plan? This cannot be undone.')) {
      return;
    }
    try {
      await api(`/billing/plans/${planId}`, {
        method: 'DELETE',
      });
      setToast({ type: 'ok', msg: 'Billing plan successfully deleted.' });
      loadBillingData();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to delete plan' });
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete (void) this unpaid invoice? This will reduce the clinic outstanding balance accordingly.')) {
      return;
    }
    try {
      await api(`/billing/invoices/${invoiceId}/void`, {
        method: 'POST',
      });
      setToast({ type: 'ok', msg: 'Invoice successfully deleted / voided.' });
      loadBillingData();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to void invoice' });
    }
  };

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

  const loadPendingSignupCount = useCallback(async () => {
    try {
      const count = await api<number>('/signup-requests/stats/pending-count');
      setPendingSignupCount(count);
    } catch {
      setPendingSignupCount(0);
    }
  }, []);

  const loadSignupRequests = useCallback(async (filter: SignupRequestStatus | 'ALL' = requestFilter) => {
    setLoadingRequests(true);
    try {
      const qs = filter === 'ALL' ? '' : `?status=${filter}`;
      const rows = await api<BusinessSignupRequest[]>(`/signup-requests${qs}`);
      setSignupRequests(rows);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load signup requests' });
      setSignupRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [requestFilter]);

  useEffect(() => {
    if (!ready) return;
    loadClinics();
    loadStats();
    loadPendingSignupCount();
  }, [ready, loadClinics, loadStats, loadPendingSignupCount]);

  useEffect(() => {
    if (!ready || tab !== 'requests') return;
    void loadSignupRequests(requestFilter);
  }, [ready, tab, requestFilter, loadSignupRequests]);

  if (!ready) return <AdminPageSkeleton />;

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

  async function loadClinicAdmins(clinicId: string) {
    try {
      const list = await api<ReceptionistRow[]>(`/clinics/${clinicId}/clinic-admins`);
      setClinicAdmins(list);
    } catch {
      setClinicAdmins([]);
    }
  }

  async function loadClinicManagers(clinicId: string) {
    try {
      const list = await api<(ReceptionistRow & { locations?: { location: { name: string } }[] })[]>(
        `/clinics/${clinicId}/managers`,
      );
      setClinicManagers(list);
    } catch {
      setClinicManagers([]);
    }
  }

  async function loadDepartments(businessType?: string | null) {
    try {
      const btype = normalizeBusinessType(businessType);
      const presets = departmentPresetsFor(businessType);
      if (btype !== 'CLINIC' && presets.length > 0) {
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
    setBaName('');
    setBaEmail('');
    setBaPhone('');
    setBaPhoneResult({ ok: false });
    await Promise.all([
      loadInviteCodes(clinic.id),
      loadClinicDoctors(clinic.id),
      loadClinicReceptionists(clinic.id),
      loadClinicAdmins(clinic.id),
      loadClinicManagers(clinic.id),
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
    loginId?: string | null;
    role: 'doctor' | 'receptionist' | 'clinic_admin' | 'manager';
  }) {
    if (!selectedClinic) return;
    const ok = window.confirm(
      `Reset password for ${opts.name}?\n\n` +
      `Their current password will stop working immediately across all devices. You'll see the new ` +
      `temporary password and Login ID on screen — copy it before closing.`,
    );
    if (!ok) return;
    try {
      const result = await api<{ user: { id: string; loginId?: string | null }; tempPassword: string }>(
        `/clinics/${selectedClinic.id}/staff/${opts.userId}/reset-password`,
        { method: 'POST' },
      );
      setCreds({
        role: opts.role,
        name: opts.name,
        email: opts.email,
        phone: opts.phone,
        loginId: result.user.loginId ?? opts.loginId ?? null,
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
        loginId: (result.user as any).loginId,
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

  async function addClinicAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) return;
    setBaBusy(true);
    try {
      const result = await api<{
        user: { id: string; name: string; email: string | null; phone: string | null; loginId: string | null };
        tempPassword: string;
      }>(`/clinics/${selectedClinic.id}/clinic-admins`, {
        method: 'POST',
        body: {
          name: baName,
          email: baEmail || undefined,
          phone: baPhoneResult.e164 || undefined,
        },
      });

      setBaName('');
      setBaEmail('');
      setBaPhone('');
      setBaPhoneResult({ ok: false });
      setCreds({
        role: 'clinic_admin',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        loginId: result.user.loginId,
        tempPassword: result.tempPassword,
        clinicName: selectedClinic.name,
      });
      await Promise.all([
        loadClinicAdmins(selectedClinic.id),
        loadStats(),
      ]);
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to add business admin',
      });
    } finally {
      setBaBusy(false);
    }
  }

  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) return;
    setMgrBusy(true);
    try {
      const result = await api<{
        user: { id: string; name: string; email: string | null; phone: string | null; loginId: string | null };
        tempPassword: string;
      }>(`/clinics/${selectedClinic.id}/managers`, {
        method: 'POST',
        body: {
          name: mgrName,
          email: mgrEmail || undefined,
          phone: mgrPhoneResult.e164 || undefined,
        },
      });
      setMgrName('');
      setMgrEmail('');
      setMgrPhone('');
      setMgrPhoneResult({ ok: false });
      setCreds({
        role: 'manager',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        loginId: result.user.loginId,
        tempPassword: result.tempPassword,
        clinicName: selectedClinic.name,
      });
      await loadClinicManagers(selectedClinic.id);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add branch manager' });
    } finally {
      setMgrBusy(false);
    }
  }

  async function handleDeleteManager(userId: string, name: string) {
    if (!selectedClinic) return;
    if (!window.confirm(`Remove branch manager ${name}?`)) return;
    try {
      await api(`/clinics/${selectedClinic.id}/managers/${userId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      await loadClinicManagers(selectedClinic.id);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove manager' });
    }
  }

  async function handleDeleteClinicAdmin(userId: string, name: string) {
    if (!selectedClinic) return;
    const ok = window.confirm(`Remove business admin "${name}" from ${selectedClinic.name}?`);
    if (!ok) return;
    try {
      await api(`/clinics/${selectedClinic.id}/clinic-admins/${userId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      await Promise.all([loadClinicAdmins(selectedClinic.id), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove business admin' });
    }
  }

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) return;
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
          languages: docLanguages || undefined,
        },
      });

      // Reset the form fields …
      setDocName('');
      setDocEmail('');
      setDocPhone('');
      setDocPhoneResult({ ok: false });
      setDocDeptId('');
      setDocAvg(7);
      setDocLanguages('');

      // … then surface the credentials in a persistent modal. The temp
      // password is shown only once, so we never use a toast for it.
      setCreds({
        role: 'doctor',
        name: result.doctor.user.name,
        email: result.doctor.user.email,
        phone: result.doctor.user.phone,
        loginId: (result.doctor.user as any).loginId,
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
        setClinicAdmins([]);
        setClinicManagers([]);
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
        loadClinicManagers(selectedClinic.id),
      ]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update email' });
    } finally {
      setEditEmailBusy(false);
    }
  }

  async function toggleStaffStatus(userId: string, currentStatus?: string) {
    if (!selectedClinic) return;
    const newStatus = currentStatus === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    try {
      await api(`/clinics/${selectedClinic.id}/staff/${userId}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      setToast({ type: 'ok', msg: `Staff status changed to ${newStatus}.` });
      await Promise.all([
        loadClinicDoctors(selectedClinic.id),
        loadClinicReceptionists(selectedClinic.id),
        loadClinicAdmins(selectedClinic.id),
        loadClinicManagers(selectedClinic.id),
      ]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update status' });
    }
  }

  async function togglePrescriptionAccess(docId: string, currentVal: boolean) {
    try {
      const nextVal = !currentVal;
      await api<any>(`/doctors/${docId}`, {
        method: 'PATCH',
        body: {
          prescriptionAllowed: nextVal,
          ...(!nextVal ? { prescriptionEnabled: false } : {}),
        },
      });
      setClinicDoctors((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                prescriptionAllowed: nextVal,
                ...(!nextVal ? { prescriptionEnabled: false } : {}),
              }
            : d,
        ),
      );
      setToast({ type: 'ok', msg: 'Doctor AI prescription access updated.' });
    } catch (err: any) {
      setToast({ type: 'err', msg: err.message || 'Failed to update prescription access' });
    }
  }

  function renderStaffStatusBadge(status?: string) {
    if (!status || status === 'ACTIVE' || status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
          ● Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-600/20">
        🚫 Disabled
      </span>
    );
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

  async function updateSignupRequest(id: string, status: SignupRequestStatus) {
    try {
      await api(`/signup-requests/${id}`, { method: 'PATCH', body: { status } });
      setToast({ type: 'ok', msg: `Request marked as ${status.toLowerCase()}` });
      await Promise.all([loadSignupRequests(requestFilter), loadPendingSignupCount()]);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update request' });
    }
  }

  async function approveSignupRequest(req: BusinessSignupRequest) {
    if (!window.confirm(`Create business "${req.businessName}" and a business admin login for ${req.contactName}?`)) return;
    try {
      const result = await api<{
        request: BusinessSignupRequest;
        clinic: Clinic;
        clinicAdmin: { user: { name: string; email: string | null; phone: string | null }; tempPassword: string };
      }>(
        `/signup-requests/${req.id}/approve`,
        { method: 'POST', body: {} },
      );
      setCreds({
        role: 'clinic_admin',
        name: result.clinicAdmin.user.name,
        email: result.clinicAdmin.user.email,
        phone: result.clinicAdmin.user.phone,
        tempPassword: result.clinicAdmin.tempPassword,
        clinicName: result.clinic.name,
      });
      setToast({ type: 'ok', msg: `Business "${result.clinic.name}" created with admin account.` });
      await Promise.all([loadClinics(), loadStats(), loadSignupRequests(requestFilter), loadPendingSignupCount()]);
      setTab('manage');
      await selectClinic(result.clinic);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to approve request' });
    }
  }

  const STATUS_PILL: Record<SignupRequestStatus, string> = {
    PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
    CONTACTED: 'bg-sky-100 text-sky-800 ring-sky-200',
    APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  };

  return (
    <>
      <Header title="Admin" />
      <main className="mx-auto max-w-6xl px-4 py-5 space-y-5 animate-fade-in">
        {/* Tab bar */}
        <div className="tabs-bar">
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={'tab rounded-xl !py-2 !px-4 ' + (tab === 'requests' ? 'tab-active' : 'tab-inactive')}
          >
            Signup requests
            {pendingSignupCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 shadow-glow">
                {pendingSignupCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={'tab rounded-xl !py-2 !px-4 ' + (tab === 'manage' ? 'tab-active' : 'tab-inactive')}
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
          <button
            type="button"
            onClick={() => setTab('billing')}
            className={'tab ' + (tab === 'billing' ? 'tab-active' : 'tab-inactive')}
          >
            Billing & Usage
          </button>
        </div>

        {tab === 'requests' && (
          <section className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Business signup requests</h2>
                <p className="text-xs text-slate-500 mt-0.5">Submissions from the Get Started page</p>
              </div>
              <select
                className="input w-auto text-sm py-1.5"
                value={requestFilter}
                onChange={(e) => setRequestFilter(e.target.value as SignupRequestStatus | 'ALL')}
              >
                <option value="PENDING">Pending</option>
                <option value="CONTACTED">Contacted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">All</option>
              </select>
            </div>

            {loadingRequests ? (
              <div className="p-10 text-center text-sm text-slate-500">Loading requests…</div>
            ) : signupRequests.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No {requestFilter === 'ALL' ? '' : requestFilter.toLowerCase() + ' '}signup requests yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {signupRequests.map((req, idx) => (
                  <div key={req.id} className={'px-5 py-4 transition-colors ' + (idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/40 dark:bg-white/5')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{req.businessName}</h3>
                          <span className={'pill text-[10px] ' + STATUS_PILL[req.status]}>{req.status}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                          {req.contactName} · {req.email} · {req.phone}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Submitted {formatDateTimeIst(req.createdAt)}
                          {req.clinic && <> · Linked to <span className="font-medium text-slate-600">{req.clinic.name}</span></>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {req.status === 'PENDING' && (
                          <>
                            <button type="button" className="btn-secondary text-xs py-1.5"
                              onClick={() => updateSignupRequest(req.id, 'CONTACTED')}>
                              Mark contacted
                            </button>
                            <button type="button" className="btn-primary text-xs py-1.5"
                              onClick={() => approveSignupRequest(req)}>
                              Approve & create business
                            </button>
                            <button type="button" className="btn-ghost text-xs py-1.5 text-rose-600"
                              onClick={() => updateSignupRequest(req.id, 'REJECTED')}>
                              Reject
                            </button>
                          </>
                        )}
                        {req.status === 'CONTACTED' && (
                          <>
                            <button type="button" className="btn-primary text-xs py-1.5"
                              onClick={() => approveSignupRequest(req)}>
                              Approve & create business
                            </button>
                            <button type="button" className="btn-ghost text-xs py-1.5 text-rose-600"
                              onClick={() => updateSignupRequest(req.id, 'REJECTED')}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'overview' && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Businesses" value={stats?.totals.clinics} icon="🏢" accent="from-brand-500 to-brand-700" />
              <StatCard label="Providers" value={stats?.totals.doctors} icon="👤" accent="from-sky-500 to-sky-700" />
              <StatCard label="Staff" value={stats?.totals.receptionists} icon="🧑‍💼" accent="from-emerald-500 to-teal-600" />
              <StatCard label="Customers" value={stats?.totals.patients} icon="🙋" accent="from-violet-500 to-purple-700" />
            </section>

            {stats && stats.perClinic.length > 0 && (
              <section className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                  <h2 className="section-title">Per-business breakdown</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/10 rounded-full px-2 py-0.5">{stats.perClinic.length} business(es)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                        <th className="px-5 py-2.5 font-medium">Business</th>
                        <th className="px-5 py-2.5 font-medium">Providers</th>
                        <th className="px-5 py-2.5 font-medium">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                      {stats.perClinic.map((c, idx) => (
                        <tr key={c.id} className={'transition-colors ' + (idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/40 dark:bg-white/5')}>
                          <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{c.doctors}</td>
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{c.receptionists}</td>
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
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center gap-2">
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
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Address (optional)"
                        value={clinicAddress}
                        onChange={(e) => setClinicAddress(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setIsCreateMapOpen(true)}
                        className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shrink-0"
                        title="Pick location on map"
                      >
                        📍 Map
                      </button>
                    </div>
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
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                  <h2 className="section-title">All businesses</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/10 rounded-full px-2 py-0.5">{clinics.length}</span>
                </div>

                {loadingClinics ? (
                  <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                ) : clinics.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-4xl mb-2">🏢</div>
                    <p className="text-sm text-slate-500">No businesses yet. Create one to get started.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/10">
                    {clinics.map((c, idx) => {
                      const isSelected = selectedClinic?.id === c.id;
                      const isEditing = editingClinicId === c.id;
                      return (
                          <div
                            key={c.id}
                            className={`px-5 py-4 transition-colors ${isSelected ? 'bg-brand-50 dark:bg-brand-500/10 border-l-4 border-l-brand-500' : idx % 2 === 0 ? 'bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-slate-50/40 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10'
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
                                <div className="flex flex-1 gap-1">
                                  <input
                                    className="input !py-1.5 flex-1 text-xs"
                                    placeholder="Address (optional)"
                                    value={editClinicAddress}
                                    onChange={(e) => setEditClinicAddress(e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setIsEditMapOpen(true)}
                                    className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shrink-0 !py-1"
                                    title="Pick location on map"
                                  >
                                    📍 Map
                                  </button>
                                </div>
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
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-200'}`}>
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`font-semibold truncate ${isSelected ? 'text-brand-800 dark:text-brand-300' : 'text-slate-800 dark:text-slate-100'}`}>
                                  {c.name}
                                  {isSelected && (
                                    <span className="ml-2 text-[10px] font-medium text-brand-600 dark:text-brand-300 bg-brand-100 dark:bg-brand-500/20 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                                      active
                                    </span>
                                  )}
                                </div>
                                {c.address && <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{c.address}</div>}
                                <div className="text-xs text-slate-400 dark:text-slate-400 mt-0.5 flex gap-2 items-center">
                                  <span>{c._count?.users ?? 0} rcp</span>
                                  <span>·</span>
                                  <span>{c._count?.doctors ?? 0} dr</span>
                                  {c.businessType && c.businessType !== 'CLINIC' && (
                                    <span className="pill bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-500/30 text-[10px]">
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
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between flex-wrap gap-2">
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
                        <div key={ic.id} className={`px-5 py-4 flex items-center justify-between gap-3 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/40 dark:bg-white/5'}`}>
                          <div className="min-w-0">
                            <div className={`font-mono font-bold text-lg tracking-widest ${active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                              {ic.code}
                            </div>
                            <div className="text-xs mt-0.5">
                              {used && <span className="text-emerald-700">✓ Used by {ic.usedBy?.name}{ic.usedBy?.phone && ` (${ic.usedBy.phone})`}</span>}
                              {!used && expired && <span className="text-rose-500">Expired</span>}
                              {active && <span className="text-slate-500">Expires {formatDateIst(ic.expiresAt)} {formatTimeIst(ic.expiresAt)}</span>}
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

            {/* Business admins — full reception portal access */}
            {selectedClinic && (
              <section className="card overflow-hidden animate-fade-in">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="section-title">
                      Business admins — <span className="text-brand-700">{selectedClinic.name}</span>
                    </h2>
                    <p className="section-sub">
                      Owner/manager accounts with full reception portal access (queue, analytics, settings).
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{clinicAdmins.length}</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <form onSubmit={addClinicAdmin} className="space-y-2.5 lg:col-span-2 card-inset p-4 h-fit rounded-xl">
                      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-700 text-xs font-bold">+</span>
                        New business admin
                      </h3>
                      <input className="input" placeholder="Full name" value={baName} onChange={(e) => setBaName(e.target.value)} required />
                      <button type="submit" className="btn-primary w-full" disabled={baBusy || !baName.trim()}>
                        {baBusy ? 'Adding…' : 'Add business admin'}
                      </button>
                    </form>
                    <div className="lg:col-span-3">
                      {clinicAdmins.length === 0 ? (
                        <div className="py-12 text-center rounded-xl ring-1 ring-slate-200 bg-slate-50">
                          <div className="text-4xl mb-2">🏢</div>
                          <p className="text-sm text-slate-500">No business admin yet.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 overflow-hidden">
                          {clinicAdmins.map((a, idx) => (
                            <div key={a.id} className={`px-4 py-3.5 flex items-center justify-between gap-3 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-white/5'}`}>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800 truncate">{a.name}</div>
                                <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                                  {a.email && <span>{a.email}</span>}
                                  {a.email && a.phone && <span>·</span>}
                                  {a.phone && <span>{a.phone}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                {renderStaffStatusBadge(a.status)}
                                <span className="text-xs text-slate-400 hidden sm:block">{formatDateIst(a.createdAt)}</span>
                                <button type="button" onClick={() => void toggleStaffStatus(a.id, a.status)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                  {a.status === 'DISABLED' ? 'Activate' : 'Disable'}
                                </button>
                                <button type="button" onClick={() => resetPassword({ userId: a.id, name: a.name, email: a.email, phone: a.phone, loginId: a.loginId, role: 'clinic_admin' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                  Reset pwd
                                </button>
                                <button type="button" onClick={() => handleDeleteClinicAdmin(a.id, a.name)} className="btn-secondary !px-2.5 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200">
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Branch managers — location-scoped day-to-day operators */}
            {selectedClinic && (
              <section className="card overflow-hidden animate-fade-in">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="section-title">
                      Branch managers — <span className="text-brand-700">{selectedClinic.name}</span>
                    </h2>
                    <p className="section-sub">
                      Per-branch operators with reception portal access. Created from the business admin portal staff tab.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{clinicManagers.length}</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <form onSubmit={addManager} className="space-y-2.5 lg:col-span-2 card-inset p-4 h-fit rounded-xl">
                      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-700 text-xs font-bold">+</span>
                        New branch manager
                      </h3>
                      <input className="input" placeholder="Full name" value={mgrName} onChange={(e) => setMgrName(e.target.value)} required />
                      <button type="submit" className="btn-primary w-full" disabled={mgrBusy || !mgrName.trim()}>
                        {mgrBusy ? 'Adding…' : 'Add branch manager'}
                      </button>
                    </form>
                    <div className="lg:col-span-3">
                      {clinicManagers.length === 0 ? (
                        <div className="py-12 text-center rounded-xl ring-1 ring-slate-200 bg-slate-50">
                          <div className="text-4xl mb-2">🧭</div>
                          <p className="text-sm text-slate-500">No branch managers yet.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 overflow-hidden">
                          {clinicManagers.map((m, idx) => (
                            <div key={m.id} className={`px-4 py-3.5 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-white/5'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{m.name}</div>
                                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                                    {m.email && <span>{m.email}</span>}
                                    {m.email && m.phone && <span>·</span>}
                                    {m.phone && <span>{m.phone}</span>}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-500 shrink-0 text-right hidden sm:block">
                                  {m.locations?.map((l) => l.location.name).join(', ') || '—'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {editEmailUserId === m.id ? (
                                  <>
                                    <input className="input !py-1.5 text-xs flex-1 min-w-[160px]" value={editEmailValue}
                                      onChange={(e) => setEditEmailValue(e.target.value)} placeholder="New email" />
                                    <button type="button" className="btn-primary !px-2.5 !py-1.5 text-xs" disabled={editEmailBusy}
                                      onClick={() => void saveEditEmail(m.id)}>Save</button>
                                    <button type="button" className="btn-secondary !px-2.5 !py-1.5 text-xs"
                                      onClick={() => { setEditEmailUserId(null); setEditEmailValue(''); }}>Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    {renderStaffStatusBadge(m.status)}
                                    <button type="button" onClick={() => void toggleStaffStatus(m.id, m.status)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                      {m.status === 'DISABLED' ? 'Activate' : 'Disable'}
                                    </button>
                                    <button type="button" onClick={() => startEditEmail(m.id, m.email)} className="btn-secondary !px-2.5 !py-1.5 text-xs">Edit email</button>
                                    <button type="button" onClick={() => resetPassword({ userId: m.id, name: m.name, email: m.email, phone: m.phone, loginId: m.loginId, role: 'manager' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">Reset pwd</button>
                                    <button type="button" onClick={() => handleDeleteManager(m.id, m.name)} className="btn-secondary !px-2.5 !py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-rose-200">Remove</button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Staff / Receptionists panel */}
            {selectedClinic && (() => {
              const RL = getLabels(selectedClinic.businessType);
              return (
                <section className="card overflow-hidden animate-fade-in">
                  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between flex-wrap gap-2">
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
                        <button type="submit" className="btn-primary w-full" disabled={recBusy || !recName.trim()}>
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
                              <div key={r.id} className={`px-4 py-3.5 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-white/5'}`}>
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
                                    {renderStaffStatusBadge(r.status)}
                                    <span className="text-xs text-slate-400 hidden sm:block">{formatDateIst(r.createdAt)}</span>
                                    <button type="button" onClick={() => void toggleStaffStatus(r.id, r.status)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                      {r.status === 'DISABLED' ? 'Activate' : 'Disable'}
                                    </button>
                                    <button type="button" onClick={() => startEditEmail(r.id, r.email)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                      Edit email
                                    </button>
                                    <button type="button" onClick={() => resetPassword({ userId: r.id, name: r.name, email: r.email, phone: r.phone, loginId: r.loginId, role: 'receptionist' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">
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
                  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between flex-wrap gap-2">
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
                        <DepartmentPicker
                          options={departments}
                          value={docDeptId}
                          onChange={setDocDeptId}
                          required
                          allowCustom
                          placeholder={`Search ${SL.department.toLowerCase()}…`}
                          label={`Select ${SL.department.toLowerCase()}`}
                        />
                        <input className="input" placeholder="Languages (optional, e.g. English, Hindi)" value={docLanguages} onChange={(e) => setDocLanguages(e.target.value)} />
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-slate-600 whitespace-nowrap shrink-0">Avg {SL.service.toLowerCase()}:</span>
                          <input className="input flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={1} max={120} value={docAvg} onChange={(e) => setDocAvg(Number(e.target.value))} required />
                          <span className="text-xs text-slate-400 shrink-0">{SL.perCustomer}</span>
                        </label>
                        <button type="submit" className="btn-primary w-full" disabled={docBusy || !docName.trim() || !docDeptId}>
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
                              <div key={d.id} className={`px-4 py-3.5 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-white/5'}`}>
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
                                    {renderStaffStatusBadge(d.user.status)}
                                    <button type="button" onClick={() => void toggleStaffStatus(d.userId, d.user.status)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                      {d.user.status === 'DISABLED' ? 'Activate' : 'Disable'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void togglePrescriptionAccess(d.id, d.prescriptionAllowed)}
                                      className={`btn !px-2.5 !py-1.5 text-xs font-semibold ${
                                        d.prescriptionAllowed
                                          ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-300'
                                      }`}
                                    >
                                      {d.prescriptionAllowed ? 'AI Rx: Allowed' : 'AI Rx: Blocked'}
                                    </button>
                                    <button type="button" onClick={() => startEditEmail(d.userId, d.user.email ?? null)} className="btn-secondary !px-2.5 !py-1.5 text-xs">
                                      Edit email
                                    </button>
                                    <button type="button" onClick={() => resetPassword({ userId: d.userId, name: d.user.name, email: d.user.email ?? null, phone: (d.user as { phone?: string | null }).phone ?? null, loginId: d.user.loginId, role: 'doctor' })} className="btn-secondary !px-2.5 !py-1.5 text-xs">
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

        {tab === 'billing' && (
          <>
            {/* Billing Stats cards */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Monthly Revenue"
                value={billingStats ? billingStats.totals.monthlyRevenue : undefined}
                icon="💰"
                accent="from-emerald-500 to-teal-600"
              />
              <StatCard
                label="Outstanding Balance"
                value={billingStats ? billingStats.totals.totalOutstanding : undefined}
                icon="⌛"
                accent="from-amber-500 to-orange-600"
              />
              <StatCard
                label="Active Plans"
                value={billingStats ? billingStats.totals.activePlans : undefined}
                icon="📋"
                accent="from-sky-500 to-sky-700"
              />
              <StatCard
                label="Events (30d)"
                value={billingStats ? billingStats.totals.totalEvents30Days : undefined}
                icon="⚡"
                accent="from-violet-500 to-purple-700"
              />
            </section>

            {/* Billing Filter and Create Plan */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-white/10 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search businesses..."
                  className="input py-1.5 px-3 text-sm w-60"
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                />
                <select
                  className="input py-1.5 px-3 text-sm w-44"
                  value={billingFilterPlan}
                  onChange={(e) => setBillingFilterPlan(e.target.value)}
                >
                  <option value="ALL">All Plans</option>
                  {Array.from(new Set(billingBusinesses.map((b) => b.planName))).map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
                <select
                  className="input py-1.5 px-3 text-sm w-40"
                  value={billingFilterCycle}
                  onChange={(e) => setBillingFilterCycle(e.target.value)}
                >
                  <option value="ALL">All Cycles</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUALLY">Annually</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePlanModal(true)}
                className="btn-primary py-1.5 px-4 text-sm"
              >
                + Create Plan
              </button>
            </div>

            {/* Businesses Billing Table */}
            <section className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                <h2 className="section-title">Business Invoicing & Pricing</h2>
                <span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/10 rounded-full px-2 py-0.5">
                  {billingBusinesses.length} Business(es)
                </span>
              </div>
              
              {loadingBilling ? (
                <div className="py-12 text-center text-sm text-slate-450">Loading billing telemetry...</div>
              ) : billingBusinesses.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">No businesses found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/10 bg-slate-50/55 dark:bg-white/5">
                        <th className="px-5 py-2.5 font-medium">Business</th>
                        <th className="px-5 py-2.5 font-medium">Plan / Price</th>
                        <th className="px-5 py-2.5 font-medium">Cycle</th>
                        <th className="px-5 py-2.5 font-medium text-center">Tokens (Completed)</th>
                        <th className="px-5 py-2.5 font-medium text-center">Uninvoiced Cost</th>
                        <th className="px-5 py-2.5 font-medium text-center">Outstanding Balance</th>
                        <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                      {billingBusinesses
                        .filter((b) => {
                          const matchesSearch = b.name.toLowerCase().includes(billingSearch.toLowerCase());
                          const matchesPlan = billingFilterPlan === 'ALL' || b.planName === billingFilterPlan;
                          const matchesCycle = billingFilterCycle === 'ALL' || b.billingCycle === billingFilterCycle;
                          return matchesSearch && matchesPlan && matchesCycle;
                        })
                        .map((b, idx) => (
                          <tr key={b.id} className={`transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-transparent hover:bg-slate-50/40 dark:hover:bg-white/5' : 'bg-slate-50/40 dark:bg-white/5 hover:bg-slate-50/60 dark:hover:bg-white/10'}`}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInvoicesListClinic(b);
                                    setShowInvoicesListModal(true);
                                  }}
                                  className="text-slate-500 hover:text-brand-600 bg-slate-100 hover:bg-brand-50 h-7 w-7 rounded-lg flex items-center justify-center text-xs font-semibold border border-slate-200/60 transition-colors"
                                  title="View Bills / Invoices"
                                >
                                  📄
                                </button>
                                <div>
                                  <a href={`/admin/business/${b.id}`} className="font-semibold text-brand-600 hover:underline block">
                                    {b.name}
                                  </a>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    {b.locationCount} branch(es) · {b.professionalCount} provider(s)
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{b.planName}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">₹{b.pricePerToken} per TOKEN_COMPLETED</span>
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300 uppercase">{b.billingCycle}</td>
                            <td className="px-5 py-3.5 text-center font-mono tabular-nums text-slate-700 dark:text-slate-200">{b.tokenCompleted}</td>
                            <td className="px-5 py-3.5 text-center font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">₹{b.currentBill}</td>
                            <td className="px-5 py-3.5 text-center font-mono tabular-nums font-semibold text-rose-600">₹{b.outstandingAmount}</td>
                            <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBillingClinic(b);
                                  setTargetPlanId(billingPlans.find((p) => p.name === b.planName)?.id || '');
                                  setShowPlanModal(true);
                                }}
                                className="btn-secondary !py-1 !px-2.5 text-xs"
                              >
                                Modify Plan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBillingClinic(b);
                                  const end = new Date();
                                  const start = new Date();
                                  start.setDate(end.getDate() - 30);
                                  setInvoiceStartDate(start.toISOString().slice(0, 10));
                                  setInvoiceEndDate(end.toISOString().slice(0, 10));
                                  setInvoiceDiscount('0');
                                  setShowInvoiceModal(true);
                                }}
                                className="btn-primary !py-1 !px-2.5 text-xs"
                              >
                                Invoice
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Secondary billing panels */}
            <div className="grid grid-cols-1 gap-6 mt-6">
              {/* Card 1: Billing Plans Manager */}
              <section className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                  <h3 className="section-title">Billing Plans</h3>
                </div>
                {billingPlans.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 italic">No plans created yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/10 max-h-[350px] overflow-y-auto">
                    {billingPlans.map((plan) => {
                      const tokenRule = plan.rules?.find((r: any) => r.eventType === 'TOKEN_COMPLETED');
                      const flatRule = plan.rules?.find((r: any) => r.ruleType === 'FLAT_RATE');
                      return (
                        <div key={plan.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5">
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 block text-xs truncate">{plan.name}</span>
                            <span className="text-[10px] text-slate-400 block truncate" title={plan.description}>
                              {plan.description || 'No description'}
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded">
                                ₹{tokenRule ? Number(tokenRule.price) : 0}/token
                              </span>
                              {flatRule && (
                                <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded">
                                  ₹{Number(flatRule.price)}/mo fixed
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePlan(plan.id)}
                            className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 rounded-full flex items-center justify-center font-bold border border-transparent hover:border-rose-100"
                            title="Delete Plan"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {/* Modal: Modify Plan */}
      {showPlanModal && selectedBillingClinic && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Assign Billing Plan — {selectedBillingClinic.name}</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <form onSubmit={handleAssignPlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Select Pricing Plan</label>
                <select
                  className="input"
                  value={targetPlanId}
                  onChange={(e) => setTargetPlanId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Plan --</option>
                  {billingPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.billingCycle})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Custom Price override (Optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 4.50"
                    className="input pl-7"
                    value={customTokenPrice}
                    onChange={(e) => setCustomTokenPrice(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Leaves blank to use plan default price (₹5 per TOKEN_COMPLETED)</p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowPlanModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generate Invoice */}
      {showInvoiceModal && selectedBillingClinic && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Generate Cycle Invoice</h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <form onSubmit={handleGenerateInvoice} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="date"
                    className="input"
                    value={invoiceStartDate}
                    onChange={(e) => setInvoiceStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input
                    type="date"
                    className="input"
                    value={invoiceEndDate}
                    onChange={(e) => setInvoiceEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Flat Discount (₹)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 50"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={invoiceBusy}>
                  {invoiceBusy ? 'Generating...' : 'Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: View Clinic Bills */}
      {showInvoicesListModal && invoicesListClinic && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Invoices & Bills</h3>
                <p className="text-xs text-slate-400 mt-0.5">{invoicesListClinic.name}</p>
              </div>
              <button onClick={() => setShowInvoicesListModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <div className="p-6">
              {platformInvoices.filter((inv) => inv.businessId === invoicesListClinic.id).length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400 italic">No invoices generated for this clinic yet.</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-2">
                  {platformInvoices
                    .filter((inv) => inv.businessId === invoicesListClinic.id)
                    .map((inv) => (
                      <div key={inv.id} className="py-3.5 flex items-center justify-between hover:bg-slate-50/30 text-xs">
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-800 block">{inv.invoiceNumber}</span>
                          <span className="text-[10px] text-slate-400 block">
                            Period: {new Date(inv.startDate).toLocaleDateString()} — {new Date(inv.endDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-slate-700">₹{Number(inv.total)}</span>
                          <span className={`pill text-[10px] uppercase font-bold ${
                            inv.status === 'PAID' 
                              ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' 
                              : inv.status === 'VOID'
                              ? 'bg-slate-100 text-slate-500 ring-slate-200 line-through'
                              : 'bg-rose-100 text-rose-800 ring-rose-200'
                          }`}>
                            {inv.status}
                          </span>
                          {inv.status === 'UNPAID' && (
                            <button
                              type="button"
                              onClick={() => handleVoidInvoice(inv.id)}
                              className="btn-secondary !py-1 !px-2.5 text-[10px] !text-rose-600 hover:!bg-rose-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
                <button type="button" onClick={() => setShowInvoicesListModal(false)} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Plan */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Create New Billing Plan</h3>
              <button onClick={() => setShowCreatePlanModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Plan Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Enterprise Plan"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  className="input h-20 resize-none"
                  placeholder="Plan details..."
                  value={newPlanDescription}
                  onChange={(e) => setNewPlanDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Price Per Completed Token (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={newPlanTokenPrice}
                  onChange={(e) => setNewPlanTokenPrice(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fixed Monthly Access Cost (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="e.g. 1000"
                  value={newPlanFixedCost}
                  onChange={(e) => setNewPlanFixedCost(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreatePlanModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={createPlanBusy}>
                  {createPlanBusy ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <LocationPickerModal
        isOpen={isCreateMapOpen}
        onClose={() => setIsCreateMapOpen(false)}
        onConfirm={(details) => {
          setClinicAddress(details.address);
        }}
      />
      <LocationPickerModal
        isOpen={isEditMapOpen}
        onClose={() => setIsEditMapOpen(false)}
        onConfirm={(details) => {
          setEditClinicAddress(details.address);
        }}
      />
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
