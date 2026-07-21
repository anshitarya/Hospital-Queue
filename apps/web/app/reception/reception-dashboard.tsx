'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProfileMenu } from '@/components/ProfileMenu';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { getLabels, departmentPresetsFor, normalizeBusinessType, type BusinessType } from '@/lib/labels';
import { HOSPITAL_DEPARTMENTS } from '@/lib/config';
import { useRequireRole } from '@/lib/useRequireRole';
import { PageLoader } from '@/components/PageLoader';
import { QueueManager } from '@/components/QueueManager';
import { Toast, type ToastMessage } from '@/components/Toast';
import { DepartmentPicker, type DepartmentOption } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { DoctorCredentialsModal, type DoctorCredentials } from '@/components/DoctorCredentialsModal';
import { TurnosIcon } from '@/components/Icons';
import { ReviewFormButton } from '@/components/ReviewFormButton';
import { SettingsTab } from '@/components/SettingsTab';
import { LocationsTab } from '@/components/LocationsTab';
import { ScheduleTab } from '@/components/ScheduleTab';
import { LeavesTab } from '@/components/LeavesTab';
import { WorkflowTab } from '@/components/WorkflowTab';
import { AnalyticsTab } from '@/components/AnalyticsTab';
import { ReceptionistAssignmentsTab } from '@/components/ReceptionistAssignmentsTab';
import { formatDateIst, formatTimeIst, formatDurationHms, serviceDay, serviceDaysAgo } from '@/lib/datetime';
import { DatePicker } from '@/components/DatePicker';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'queue' | 'history' | 'staff' | 'settings' | 'schedule' | 'leaves' | 'workflows' | 'analytics' | 'locations';

const LOCATION_STORAGE_KEY = 'turnos_reception_location';

interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  loginId?: string | null;
  createdAt?: string;
  locations?: { locationId: string; location: { id: string; name: string } }[];
}

interface DashboardDoctor {
  id: string; userId: string; name: string; department: string;
  loginId?: string | null;
  status: 'AVAILABLE' | 'PAUSED' | 'OFFLINE';
  waiting: number; inConsultation: number;
  completed: number; missed: number; skipped: number; cancelled: number;
  locationIds?: string[];
}

interface BranchDoctorRef {
  id: string;
  userId: string;
  name: string;
  loginId?: string | null;
  department: string;
  locationIds?: string[];
}

const EMPTY_DOCTOR_STATS: Omit<DashboardDoctor, keyof BranchDoctorRef> = {
  status: 'OFFLINE',
  waiting: 0,
  inConsultation: 0,
  completed: 0,
  missed: 0,
  skipped: 0,
  cancelled: 0,
};

function mergeBranchDoctors(
  branchList: BranchDoctorRef[],
  statsList: DashboardDoctor[],
): DashboardDoctor[] {
  const statsById = new Map(statsList.map((d) => [d.id, d]));
  return branchList.map((d) => {
    const stats = statsById.get(d.id);
    return stats
      ? { ...stats, locationIds: d.locationIds ?? stats.locationIds }
      : { ...EMPTY_DOCTOR_STATS, ...d };
  });
}
interface TrafficPoint { date: string; label: string; count: number }
interface AnalyticsPoint {
  date: string; label: string;
  completed: number; missed: number; cancelled: number; skipped: number; total: number;
}
interface DoctorAnalyticsRow {
  id: string; name: string; department: string; status: string;
  completed: number; missed: number; cancelled: number; skipped: number;
}
interface HistoryEntry {
  id: string; tokenNumber: number; status: string;
  serviceDay: string; joinedAt: string; completedAt: string | null;
  consultMinutes: number | null;
  patient: { name: string; phone: string };
  doctor: { name: string; department: string };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function fmtTime(iso: string | null): string {
  return formatTimeIst(iso);
}

function fmtDuration(mins: number | null | undefined): string {
  if (mins == null) return '—';
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

const HISTORY_STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
  MISSED: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30',
  CANCELLED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30',
  SKIPPED: 'text-slate-600 bg-slate-100 dark:bg-slate-700',
};

function HistoryEntriesTable({
  entries,
  labels: L,
  showProvider = true,
}: {
  entries: HistoryEntry[];
  labels: ReturnType<typeof getLabels>;
  showProvider?: boolean;
}) {
  const columns = [
    'Token', 'Date', 'Time', L.customer, 'Phone',
    ...(showProvider ? [L.provider] : []),
    'Time taken', 'Status',
  ];

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">No visit records.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-700/40">
          <tr>
            {columns.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">#{e.tokenNumber}</td>
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(e.serviceDay)}</td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtTime(e.joinedAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{e.patient.name}</td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">{e.patient.phone}</td>
              {showProvider && (
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.doctor.name}</td>
              )}
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDuration(e.consultMinutes)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${HISTORY_STATUS_COLORS[e.status] ?? 'text-slate-500 bg-slate-100'}`}>
                  {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HistorySummary { completed: number; missed: number; cancelled: number; skipped: number; total: number }
interface HistoryResponse {
  entries: HistoryEntry[]; total: number; page: number; pages: number;
  summary: HistorySummary;
}
interface ClinicDashboard {
  clinic: { id: string; name: string; address?: string; businessType?: string | null };
  today: { waiting: number; inConsultation: number; completed: number; skipped: number; cancelled: number };
  doctors: DashboardDoctor[];
  allDoctors?: BranchDoctorRef[];
  weeklyTraffic: TrafficPoint[];
  activeLocationId?: string | null;
  locations?: Array<{ id: string; name: string }>;
}
interface ClinicAnalytics { period: string; points: AnalyticsPoint[] }
interface DoctorAnalytics { from: string; to: string; doctors: DoctorAnalyticsRow[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TABS: Tab[] = ['dashboard', 'queue', 'history', 'staff', 'settings', 'schedule', 'leaves', 'workflows', 'analytics', 'locations'];
const TODAY = serviceDay();
const daysAgo = (n: number) => serviceDaysAgo(n);
const SEVEN_AGO = daysAgo(6);

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV: { label: string; tab: Tab; icon: (p: { className?: string }) => JSX.Element }[] = [
  { label: 'Dashboard', tab: 'dashboard', icon: GridIcon },
  { label: 'Queue', tab: 'queue', icon: ListIcon },
  { label: 'History', tab: 'history', icon: ClockIcon },
  { label: 'Staff', tab: 'staff', icon: UsersIcon },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

type BookingPeriod = '7d' | '30d' | '3m' | '12m' | 'hourly' | 'custom';
type DocPeriod = '7d' | '30d' | '3m' | '12m' | 'today' | 'custom';

export function ReceptionDashboard({ locationIdFromParams }: { locationIdFromParams?: string | null }) {
  const { ready, user } = useRequireRole(['RECEPTIONIST', 'CLINIC_ADMIN', 'MANAGER', 'ADMIN']);
  const router = useRouter();

  // ── Tab — persisted in localStorage so refresh keeps the user here ──
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('turnos_reception_tab');
    if (saved && VALID_TABS.includes(saved as Tab)) setActiveTab(saved as Tab);
  }, []);
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    localStorage.setItem('turnos_reception_tab', tab);
  };

  const [data, setData] = useState<ClinicDashboard | null>(null);
  const [analytics, setAnalytics] = useState<ClinicAnalytics | null>(null);
  const [doctorAnalytics, setDoctorAnalytics] = useState<DoctorAnalytics | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyAnalytics, setHistoryAnalytics] = useState<ClinicAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Booking overview
  const [bookingPeriod, setBookingPeriod] = useState<BookingPeriod>('30d');
  const [bookingFrom, setBookingFrom] = useState(SEVEN_AGO);
  const [bookingTo, setBookingTo] = useState(TODAY);
  const [bookingHourlyDate, setBookingHourlyDate] = useState(TODAY);

  // Doctor histogram — period presets
  const [histPeriod, setHistPeriod] = useState<DocPeriod>('today');
  const [histFrom, setHistFrom] = useState(TODAY);
  const [histTo, setHistTo] = useState(TODAY);

  // Active selected location state (receptionists/admins can switch locations)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(locationIdFromParams ?? null);

  useEffect(() => {
    if (locationIdFromParams) {
      setSelectedLocationId(locationIdFromParams);
    }
  }, [locationIdFromParams]);

  const [locationReady, setLocationReady] = useState(false);
  const [managers, setManagers] = useState<StaffRow[]>([]);
  const [receptionists, setReceptionists] = useState<StaffRow[]>([]);

  // Compute from/to when a preset is picked
  useEffect(() => {
    if (histPeriod === 'custom') return;
    const map: Record<string, { from: string; to: string }> = {
      today: { from: TODAY, to: TODAY },
      '7d': { from: daysAgo(6), to: TODAY },
      '30d': { from: daysAgo(29), to: TODAY },
      '3m': { from: daysAgo(89), to: TODAY },
      '12m': { from: daysAgo(364), to: TODAY },
    };
    const d = map[histPeriod];
    if (d) { setHistFrom(d.from); setHistTo(d.to); }
  }, [histPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // History tab
  const [historyFrom, setHistoryFrom] = useState(SEVEN_AGO);
  const [historyTo, setHistoryTo] = useState(TODAY);
  const [historyPage, setHistoryPage] = useState(1);

  // Add-doctor form (staff tab)
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docPhoneResult, setDocPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [docDeptId, setDocDeptId] = useState('');
  const [docAvg, setDocAvg] = useState(7);
  const [docUseDefaultSchedule, setDocUseDefaultSchedule] = useState(true);
  const [docBusy, setDocBusy] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [creds, setCreds] = useState<DoctorCredentials | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [togglingDocId, setTogglingDocId] = useState<string | null>(null);
  const [manageAssignmentsMode, setManageAssignmentsMode] = useState(false);
  const [assignmentsRefreshKey, setAssignmentsRefreshKey] = useState(0);

  // Add-receptionist form (business admin / clinic admin in staff tab)
  const [recName, setRecName] = useState('');
  const [recBusy, setRecBusy] = useState(false);

  // Add branch manager form (business admin only)
  const [mgrName, setMgrName] = useState('');
  const [mgrBusy, setMgrBusy] = useState(false);

  const [editEmailUserId, setEditEmailUserId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [editEmailBusy, setEditEmailBusy] = useState(false);

  const canManageStaff = user?.role === 'CLINIC_ADMIN' || user?.role === 'MANAGER' || user?.role === 'ADMIN';

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async (silent = false, locId?: string) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const targetLoc = locId ?? selectedLocationId;
    const qs = targetLoc ? `?locationId=${targetLoc}` : '';
    try {
      const res = await api<any>(`/clinics/my/dashboard${qs}`);
      setData(res);
      const locIds = (res?.locations ?? []).map((l: { id: string }) => l.id);
      if (locIds.length && targetLoc && !locIds.includes(targetLoc)) {
        const fallback = res.activeLocationId ?? locIds[0];
        setSelectedLocationId(fallback);
        if (user?.clinicId && fallback) {
          localStorage.setItem(`${LOCATION_STORAGE_KEY}:${user.clinicId}`, fallback);
        }
      } else if (res?.activeLocationId && !targetLoc) {
        setSelectedLocationId(res.activeLocationId);
        if (user?.clinicId) {
          localStorage.setItem(`${LOCATION_STORAGE_KEY}:${user.clinicId}`, res.activeLocationId);
        }
      }
    }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedLocationId, user?.clinicId]);

  const loadStaffLists = useCallback(async () => {
    // Managers are clinic-wide — don't filter by location so all managers created
    // via the super-admin portal appear here regardless of the selected branch.
    const recQs = selectedLocationId ? `?locationId=${selectedLocationId}` : '';
    try {
      const [mgrs, recs] = await Promise.all([
        api<StaffRow[]>('/clinics/my/managers'),
        api<StaffRow[]>(`/clinics/my/receptionists${recQs}`),
      ]);
      setManagers(mgrs);
      setReceptionists(recs);
    } catch {
      setManagers([]);
      setReceptionists([]);
    }
  }, [selectedLocationId]);

  const selectLocation = useCallback((locId: string) => {
    setSelectedLocationId(locId);
    if (user?.clinicId) {
      localStorage.setItem(`${LOCATION_STORAGE_KEY}:${user.clinicId}`, locId);
    }
    router.push(`/reception/${locId}`);
  }, [user?.clinicId, router]);

  const loadAnalytics = useCallback(async (period: BookingPeriod, from?: string, to?: string, hourlyDate?: string) => {
    try {
      let qs: string;
      if (period === 'hourly') {
        qs = `period=hourly&date=${hourlyDate ?? TODAY}`;
      } else if (period === 'custom') {
        qs = `period=daily&from=${from ?? SEVEN_AGO}&to=${to ?? TODAY}`;
      } else {
        const map: Record<string, string> = { '7d': 'period=daily&count=7', '30d': 'period=daily&count=30', '3m': 'period=daily&count=90', '12m': 'period=monthly&count=12' };
        qs = map[period] ?? 'period=daily&count=30';
      }
      if (selectedLocationId) {
        qs += `&locationId=${selectedLocationId}`;
      }
      setAnalytics(await api<ClinicAnalytics>(`/clinics/my/analytics?${qs}`));
    } catch { /* ignore */ }
  }, [selectedLocationId]);

  const loadDoctorAnalytics = useCallback(async (from: string, to: string) => {
    let url = `/clinics/my/doctor-analytics?from=${from}&to=${to}`;
    if (selectedLocationId) url += `&locationId=${selectedLocationId}`;
    try { setDoctorAnalytics(await api<DoctorAnalytics>(url)); }
    catch { /* ignore */ }
  }, [selectedLocationId]);

  const loadHistory = useCallback(async (from: string, to: string, page: number) => {
    let url = `/clinics/my/history?from=${from}&to=${to}&page=${page}&limit=100`;
    if (selectedLocationId) url += `&locationId=${selectedLocationId}`;
    try { setHistory(await api<HistoryResponse>(url)); }
    catch { /* ignore */ }
  }, [selectedLocationId]);

  const loadHistoryAnalytics = useCallback(async (from: string, to: string) => {
    let url = `/clinics/my/analytics?period=daily&from=${from}&to=${to}`;
    if (selectedLocationId) url += `&locationId=${selectedLocationId}`;
    try { setHistoryAnalytics(await api<ClinicAnalytics>(url)); }
    catch { /* ignore */ }
  }, [selectedLocationId]);

  const loadDepartments = useCallback(async () => {
    try {
      const btype = normalizeBusinessType(data?.clinic?.businessType);
      const presets = departmentPresetsFor(data?.clinic?.businessType);
      if (btype !== 'CLINIC' && presets.length > 0) {
        setDepartments(presets.map((p) => ({ id: `__new__${p}`, name: p })));
      } else {
        const fromDb = await api<DepartmentOption[]>('/clinics/my/departments');
        setDepartments(fromDb.length > 0 ? fromDb : HOSPITAL_DEPARTMENTS.map((n) => ({ id: `__new__${n}`, name: n })));
      }
    } catch { /* ignore */ }
  }, [data?.clinic?.businessType]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.clinicId) return;
    const saved = localStorage.getItem(`${LOCATION_STORAGE_KEY}:${user.clinicId}`);
    const active = locationIdFromParams || saved;
    if (active) setSelectedLocationId(active);
    setLocationReady(true);
  }, [user?.clinicId, locationIdFromParams]);

  useEffect(() => {
    if (!ready || !locationReady) return;
    void loadDashboard(false, selectedLocationId || undefined);
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    void loadDoctorAnalytics(histFrom, histTo);
  }, [ready, locationReady, selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
  }, [bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    void loadDoctorAnalytics(histFrom, histTo);
  }, [histFrom, histTo, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || activeTab !== 'history') return;
    void loadHistory(historyFrom, historyTo, historyPage);
    void loadHistoryAnalytics(historyFrom, historyTo);
  }, [activeTab, historyFrom, historyTo, historyPage, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || activeTab !== 'staff') return;
    void loadDepartments();
    void loadStaffLists();
  }, [activeTab, ready, selectedLocationId, data?.clinic?.businessType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resetStaffPassword(opts: {
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    loginId?: string | null;
    role: DoctorCredentials['role'];
  }) {
    const ok = window.confirm(
      `Reset password for ${opts.name}?\n\nTheir current password will stop working immediately across all devices.`,
    );
    if (!ok) return;
    try {
      const result = await api<{ user: { id: string; loginId?: string | null }; tempPassword: string }>(
        `/clinics/my/staff/${opts.userId}/reset-password`,
        { method: 'POST' },
      );
      setCreds({
        role: opts.role,
        name: opts.name,
        email: opts.email,
        phone: opts.phone,
        loginId: result.user.loginId ?? opts.loginId ?? null,
        tempPassword: result.tempPassword,
      });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to reset password' });
    }
  }

  async function removeProfessional(doctorId: string, name: string) {
    if (!window.confirm(`Remove ${name}? Waiting queue entries for today will be cleared.`)) return;
    try {
      await api(`/clinics/my/doctors/${doctorId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      await loadDashboard(true);
      void loadStaffLists();
      setAssignmentsRefreshKey((key) => key + 1);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove professional' });
    }
  }

  async function toggleDoctorBranchAssignment(doc: any) {
    if (togglingDocId || !selectedLocationId) return;
    setTogglingDocId(doc.id);
    try {
      const isAssigned = doc.locationIds?.includes(selectedLocationId);
      await api(`/clinics/my/doctors/${doc.id}/locations/${selectedLocationId}`, {
        method: isAssigned ? 'DELETE' : 'POST',
      });

      setToast({ type: 'ok', msg: `Updated branch assignment for ${doc.name}` });
      void loadStaffLists();
      await loadDashboard(true);
      setAssignmentsRefreshKey((key) => key + 1);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update branch assignment' });
    } finally {
      setTogglingDocId(null);
    }
  }

  async function removeWorker(userId: string, name: string) {
    if (!window.confirm(`Remove ${name}? They will lose access to this business.`)) return;
    try {
      await api(`/clinics/my/receptionists/${userId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      void loadStaffLists();
      await loadDashboard(true);
      setAssignmentsRefreshKey((key) => key + 1);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove staff' });
    }
  }

  async function removeBranchManager(userId: string, name: string) {
    if (!window.confirm(`Remove branch manager ${name}?`)) return;
    try {
      await api(`/clinics/my/managers/${userId}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: `${name} removed.` });
      void loadStaffLists();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to remove manager' });
    }
  }

  async function toggleStaffBranchAssignment(staff: any) {
    if (!selectedLocationId) return;
    try {
      const currentIds = staff.locations?.map((l: any) => l.locationId) ?? [];
      const isAssigned = currentIds.includes(selectedLocationId);

      await api(`/clinics/my/staff/${staff.id}/locations/${selectedLocationId}`, {
        method: isAssigned ? 'DELETE' : 'POST',
      });

      setToast({ type: 'ok', msg: `Updated branch assignment for ${staff.name}` });
      void loadStaffLists();
      setAssignmentsRefreshKey((key) => key + 1);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update branch assignment' });
    }
  }

  async function saveStaffEmail(userId: string) {
    if (!editEmailValue.trim()) return;
    setEditEmailBusy(true);
    try {
      await api(`/clinics/my/staff/${userId}/email`, {
        method: 'PATCH',
        body: { email: editEmailValue.trim() },
      });
      setEditEmailUserId(null);
      setEditEmailValue('');
      setToast({ type: 'ok', msg: 'Email updated.' });
      void loadStaffLists();
      await loadDashboard(true);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update email' });
    } finally {
      setEditEmailBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || (activeTab !== 'dashboard' && activeTab !== 'queue')) return;
    const id = setInterval(() => {
      void loadDashboard(true);
      void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    }, 30_000);
    return () => clearInterval(id);
  }, [ready, activeTab, bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    if ((data?.locations?.length ?? 0) > 1 && !selectedLocationId) {
      setToast({ type: 'err', msg: 'Select a branch before adding staff.' });
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
      const docUrl = selectedLocationId
        ? `/clinics/my/doctors?locationId=${selectedLocationId}`
        : '/clinics/my/doctors';
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null; loginId?: string } };
        tempPassword: string;
      }>(docUrl, {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: deptId,
          avgConsultMinutes: docAvg,
          useDefaultSchedule: docUseDefaultSchedule,
          locationIds: selectedLocationId ? [selectedLocationId] : undefined,
        },
      });
      setDocName(''); setDocEmail(''); setDocPhone('');
      setDocPhoneResult({ ok: false }); setDocDeptId(''); setDocAvg(7);
      setDocUseDefaultSchedule(true);
      setCreds({
        role: 'doctor',
        name: result.doctor.user.name,
        loginId: result.doctor.user.loginId,
        email: result.doctor.user.email,
        phone: result.doctor.user.phone,
        tempPassword: result.tempPassword,
      });
      await loadDashboard(true);
      void loadStaffLists();
      setAssignmentsRefreshKey((key) => key + 1);

    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add doctor' });
    } finally {
      setDocBusy(false);
    }
  }

  async function addReceptionist(e: React.FormEvent) {
    e.preventDefault();
    if (!recName.trim()) return;
    if ((data?.locations?.length ?? 0) > 1 && !selectedLocationId) {
      setToast({ type: 'err', msg: 'Select a branch before adding staff.' });
      return;
    }
    setRecBusy(true);
    try {
      const recUrl = selectedLocationId
        ? `/clinics/my/receptionists?locationId=${selectedLocationId}`
        : '/clinics/my/receptionists';
      const result = await api<{
        user: { id: string; name: string; email: string | null; phone: string | null; loginId?: string | null };
        tempPassword: string;
      }>(recUrl, {
        method: 'POST',
        body: {
          name: recName,
          locationId: selectedLocationId || undefined,
        },
      });
      setRecName('');
      setCreds({
        role: 'receptionist',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        loginId: result.user.loginId ?? null,
        tempPassword: result.tempPassword,
      });
      await loadDashboard(true);
      void loadStaffLists();
      setAssignmentsRefreshKey((key) => key + 1);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add receptionist' });
    } finally {
      setRecBusy(false);
    }
  }

  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    if (!mgrName.trim()) return;
    if ((data?.locations?.length ?? 0) > 1 && !selectedLocationId) {
      setToast({ type: 'err', msg: 'Select a branch before adding a manager.' });
      return;
    }
    setMgrBusy(true);
    try {
      const mgrUrl = selectedLocationId
        ? `/clinics/my/managers?locationId=${selectedLocationId}`
        : '/clinics/my/managers';
      const result = await api<{
        user: { id: string; name: string; email: string | null; phone: string | null; loginId?: string | null };
        tempPassword: string;
      }>(mgrUrl, {
        method: 'POST',
        body: {
          name: mgrName,
          locationId: selectedLocationId || undefined,
        },
      });
      setMgrName('');
      setCreds({
        role: 'manager',
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        loginId: result.user.loginId ?? null,
        tempPassword: result.tempPassword,
      });
      await loadDashboard(true);
      void loadStaffLists();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add branch manager' });
    } finally {
      setMgrBusy(false);
    }
  }

  const scheduleDoctors = useMemo(
    (): DashboardDoctor[] =>
      mergeBranchDoctors(data?.allDoctors ?? data?.doctors ?? [], data?.doctors ?? []),
    [data?.allDoctors, data?.doctors],
  );

  if (!ready || loading) return <PageLoader label="Loading…" />;

  const L = getLabels(data?.clinic?.businessType);

  const today = data?.today ?? { waiting: 0, inConsultation: 0, completed: 0, skipped: 0, cancelled: 0 };
  const doctors = data?.doctors ?? [];
  const histDoctors = doctorAnalytics?.doctors ?? doctors;

  const todayDate = formatDateIst(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const refresh = () => {
    void loadDashboard(true);
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    void loadDoctorAnalytics(histFrom, histTo);
    if (activeTab === 'history') { void loadHistory(historyFrom, historyTo, historyPage); void loadHistoryAnalytics(historyFrom, historyTo); }
  };

  const tabLabel: Record<Tab, string> = {
    dashboard: 'Dashboard',
    queue: 'Live Queue',
    history: 'History',
    staff: 'Staff',
    settings: 'Business Settings',
    locations: 'Branches & Locations',
    schedule: 'Staff Schedules',
    leaves: 'Leaves & Breaks',
    workflows: 'Workflows',
    analytics: 'Business Analytics',
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#0a0a0b] overflow-hidden">
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* ── Mobile Nav Drawer Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-4/5 max-w-xs bg-white dark:bg-slate-950 flex flex-col h-full z-10 shadow-2xl border-r border-slate-200 dark:border-slate-800 animate-drawer-in">
            {/* Mobile Drawer Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <TurnosIcon className="h-9 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{data?.clinic?.name ?? 'Turnos'}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {user?.role === 'CLINIC_ADMIN' ? 'Business Admin' : user?.role === 'MANAGER' ? 'Branch Manager' : user?.role === 'ADMIN' ? 'Admin' : user?.role === 'DOCTOR' ? 'Doctor' : 'Reception'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-icon p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>

            {/* Mobile Navigation Links */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {NAV.map(({ label, tab, icon: Icon }) => (
                <button key={tab} type="button" onClick={() => handleTabChange(tab)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === tab
                    ? 'bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
                  }`}>
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{label}</span>
                  {activeTab === tab && <span className="ml-auto w-2 h-2 rounded-full bg-brand-500" />}
                </button>
              ))}

              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Configuration</div>
                {[
                  { label: 'Settings', tab: 'settings', icon: GearIcon },
                  ...(user?.role !== 'MANAGER' ? [{ label: 'Locations', tab: 'locations', icon: MapPinIcon }] : []),
                  { label: 'Schedules', tab: 'schedule', icon: CalendarIcon },
                  { label: 'Leaves & Breaks', tab: 'leaves', icon: ClockIcon },
                  { label: 'Workflows', tab: 'workflows', icon: RouteIcon },
                  { label: 'Analytics', tab: 'analytics', icon: ChartIcon },
                ].map(({ label, tab, icon: Icon }) => (
                  <button key={tab} type="button" onClick={() => handleTabChange(tab as Tab)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab
                      ? 'bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
                    }`}>
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{label}</span>
                    {activeTab === tab && <span className="ml-auto w-2 h-2 rounded-full bg-brand-500" />}
                  </button>
                ))}
              </div>
            </nav>

            {/* User Footer inside Drawer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-200 truncate">{user?.name ?? 'User'}</div>
                <div className="text-[10px] text-slate-500 truncate">{user?.email ?? user?.phone ?? ''}</div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-white dark:bg-slate-950 flex-col border-r border-slate-200/80 dark:border-slate-800/60">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-200/80 dark:border-slate-800/60">
          <TurnosIcon className="h-10 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white text-sm leading-tight truncate">{data?.clinic?.name ?? 'Turnos'}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {user?.role === 'CLINIC_ADMIN' ? 'Business Admin' : user?.role === 'MANAGER' ? 'Branch Manager' : user?.role === 'ADMIN' ? 'Admin' : user?.role === 'DOCTOR' ? 'Doctor' : 'Reception'}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, tab, icon: Icon }) => (
            <button key={tab} type="button" onClick={() => handleTabChange(tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${activeTab === tab
                ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200/60 dark:bg-white/10 dark:text-white dark:ring-white/10'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/6 cursor-pointer'
                }`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {activeTab === tab && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />}
            </button>
          ))}

          <div className="pt-2 mt-2 border-t border-slate-200/80 dark:border-slate-800/60 space-y-0.5">
            <div className="px-3 py-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Configuration</div>
            {[
              { label: 'Settings', tab: 'settings', icon: GearIcon },
              ...(user?.role !== 'MANAGER' ? [{ label: 'Locations', tab: 'locations', icon: MapPinIcon }] : []),
              { label: 'Schedules', tab: 'schedule', icon: CalendarIcon },
              { label: 'Leaves & Breaks', tab: 'leaves', icon: ClockIcon },
              { label: 'Workflows', tab: 'workflows', icon: RouteIcon },
              { label: 'Analytics', tab: 'analytics', icon: ChartIcon },
            ].map(({ label, tab, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => handleTabChange(tab as Tab)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${activeTab === tab
                  ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200/60 dark:bg-white/10 dark:text-white dark:ring-white/10'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/6 cursor-pointer'
                  }`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs">{label}</span>
                {activeTab === tab && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />}
              </button>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors group">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(user?.name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-800 dark:text-slate-300 truncate">{user?.name ?? 'User'}</div>
              <div className="text-[10px] text-slate-500 truncate">{user?.email ?? user?.phone ?? ''}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-[#0a0a0b]/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60 px-4 sm:px-6 py-3 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 touch-target flex items-center justify-center"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 tracking-tight truncate">{tabLabel[activeTab]}</h1>
              <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{todayDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {data?.locations && data.locations.length > 0 && (
              data.locations.length > 1 ? (
                <select
                  value={selectedLocationId || ''}
                  onChange={(e) => selectLocation(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium cursor-pointer max-w-[130px] sm:max-w-none truncate"
                >
                  {data.locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2 py-1.5 rounded-lg font-medium border border-slate-200/50 dark:border-slate-750 truncate max-w-[110px] sm:max-w-none">
                  {data.locations[0].name}
                </span>
              )
            )}
            <button type="button" onClick={refresh} disabled={refreshing}
              className={`btn-icon ${refreshing ? 'opacity-50' : ''}`} title="Refresh">
              <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <DarkModeToggle />
            <ReviewFormButton />
            <ProfileMenu />
          </div>
        </div>

        {/* ── Dashboard ── */}
        {activeTab === 'dashboard' && (
          <div className="p-4 sm:p-6 space-y-5">
            {/* Today's stat cards */}
            <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="Waiting" value={today.waiting} color="teal" />
              <StatCard label={L.inService} value={today.inConsultation} color="blue" />
              <StatCard label="Completed" value={today.completed} color="green" />
              <StatCard label="Skipped" value={today.skipped} color="amber" />
              <StatCard label="Cancelled" value={today.cancelled} color="red" />
            </div>

            {/* Booking Overview */}
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Booking Overview</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Completed, missed, and cancelled visits over time</p>
                </div>
                <div className="overflow-x-auto scrollbar-none max-w-full pb-0.5">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 shrink-0">
                    {(['7d', '30d', '3m', '12m', 'hourly', 'custom'] as BookingPeriod[]).map((p) => (
                      <button key={p} type="button" onClick={() => setBookingPeriod(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${bookingPeriod === p ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}>
                        {p === 'hourly' ? 'Today/hr' : p === 'custom' ? 'Custom' : p === '12m' ? '12 mo' : p === '3m' ? '3 mo' : p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {bookingPeriod === 'custom' && (
                <div className="flex flex-wrap items-center gap-3 mb-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    From <DatePicker value={bookingFrom} max={bookingTo} onChange={setBookingFrom} size="sm" />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    To <DatePicker value={bookingTo} min={bookingFrom} max={TODAY} onChange={setBookingTo} size="sm" />
                  </label>
                </div>
              )}
              {bookingPeriod === 'hourly' && (
                <div className="flex items-center gap-3 mb-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg flex-wrap">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    Date <DatePicker value={bookingHourlyDate} max={TODAY} onChange={setBookingHourlyDate} size="sm" />
                  </label>
                  <span className="text-xs text-slate-400">Visits distributed by hour of day</span>
                </div>
              )}
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <LegendDot color="#14b8a6" label="Completed" />
                <LegendDot color="#f59e0b" label="Missed" />
                <LegendDot color="#ef4444" label="Cancelled" />
              </div>
              <BookingLineChart points={analytics?.points ?? []} />
            </div>

            {/* Doctor Histogram — with period presets */}
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Breakdown by {L.provider}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Completed / Missed / Cancelled / Skipped per {L.provider.toLowerCase()}</p>
                </div>
                <div className="overflow-x-auto scrollbar-none max-w-full pb-0.5">
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                      {(['today', '7d', '30d', '3m', '12m', 'custom'] as DocPeriod[]).map((p) => (
                        <button key={p} type="button" onClick={() => setHistPeriod(p)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${histPeriod === p ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}>
                          {p === 'today' ? 'Today' : p === 'custom' ? 'Custom' : p === '12m' ? '12 mo' : p === '3m' ? '3 mo' : p}
                        </button>
                      ))}
                    </div>
                    {histPeriod === 'custom' && (
                      <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          From <DatePicker value={histFrom} max={histTo} onChange={setHistFrom} size="sm" />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          To <DatePicker value={histTo} min={histFrom} max={TODAY} onChange={setHistTo} size="sm" />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <LegendDot color="#14b8a6" label="Completed" />
                <LegendDot color="#f59e0b" label="Missed" />
                <LegendDot color="#ef4444" label="Cancelled" />
                <LegendDot color="#94a3b8" label="Skipped" />
              </div>
              <DoctorHistogram doctors={histDoctors} />
            </div>
          </div>
        )}

        {/* ── Queue ── */}
        {activeTab === 'queue' && (
          <div className="p-4 sm:p-5 mx-auto max-w-7xl">
            <QueueManager locationId={selectedLocationId} />
          </div>
        )}

        {/* ── History ── */}
        {activeTab === 'history' && (
          <HistoryTab
            from={historyFrom} to={historyTo} page={historyPage}
            data={history} trendPoints={historyAnalytics?.points ?? []}
            onDateChange={(f, t) => { setHistoryFrom(f); setHistoryTo(t); setHistoryPage(1); }}
            onPageChange={setHistoryPage}
            onRefresh={() => { void loadHistory(historyFrom, historyTo, historyPage); void loadHistoryAnalytics(historyFrom, historyTo); }}
            labels={L}
          />
        )}

        {/* ── Staff ── */}
        {activeTab === 'staff' && (
          <div className="p-5 sm:p-6 space-y-5">

            {(user?.role === 'CLINIC_ADMIN' || user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
              <ReceptionistAssignmentsTab
                businessType={data?.clinic?.businessType}
                setToast={setToast}
                locationId={selectedLocationId}
                refreshKey={assignmentsRefreshKey}
              />
            )}

            {/* Add receptionist form — business admin / admin only */}
            {(user?.role === 'CLINIC_ADMIN' || user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
              <div className="card p-5">
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-sm font-bold">+</span>
                  Add {L.staff.toLowerCase()}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 max-w-xl">
                  Enter their name — a unique Login ID and password will be generated automatically.
                </p>
                <form onSubmit={addReceptionist} className="flex flex-col sm:flex-row gap-3 max-w-xl">
                  <input className="input flex-1" placeholder="Full name" value={recName} onChange={(e) => setRecName(e.target.value)} required />
                  <button type="submit" className="btn-primary shrink-0" disabled={recBusy || !recName.trim()}>
                    {recBusy ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Adding…
                      </span>
                    ) : `Add ${L.staff.toLowerCase()}`}
                  </button>
                </form>
              </div>
            )}

            {user?.role === 'CLINIC_ADMIN' && (
              <div className="card p-5">
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-bold">+</span>
                  Add branch manager
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 max-w-xl">
                  Branch managers run day-to-day operations at the selected location. Enter their name — Login ID and password will be generated.
                  {selectedLocationId && data?.locations?.find((l: { id: string }) => l.id === selectedLocationId) && (
                    <> Assigned to <strong>{data.locations.find((l: { id: string }) => l.id === selectedLocationId)?.name}</strong>.</>
                  )}
                </p>
                <form onSubmit={addManager} className="flex flex-col sm:flex-row gap-3 max-w-xl">
                  <input className="input flex-1" placeholder="Full name" value={mgrName} onChange={(e) => setMgrName(e.target.value)} required />
                  <button type="submit" className="btn-primary shrink-0" disabled={mgrBusy || !mgrName.trim()}>
                    {mgrBusy ? 'Adding…' : 'Add branch manager'}
                  </button>
                </form>
              </div>
            )}

            {(user?.role === 'CLINIC_ADMIN' || user?.role === 'ADMIN') && (
              <div className="card p-5">
                <h2 className="section-title mb-4">
                  Branch managers
                  <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal text-sm">({managers.length})</span>
                </h2>
                {managers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No branch managers at this location yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
                    {managers.map((m) => (
                      <div key={m.id} className="px-4 py-3 bg-white dark:bg-slate-900/40 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{m.name}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {[m.email, m.phone].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          {m.locations?.[0]?.location?.name && (
                            <span className="text-xs text-slate-400 shrink-0">{m.locations[0].location.name}</span>
                          )}
                        </div>
                        {user?.role === 'CLINIC_ADMIN' && (
                          <div className="flex flex-wrap gap-1.5">
                            {editEmailUserId === m.id ? (
                              <>
                                <input className="input !py-1 text-xs flex-1 min-w-[140px]" value={editEmailValue}
                                  onChange={(e) => setEditEmailValue(e.target.value)} placeholder="New email" />
                                <button type="button" className="btn-primary !px-2 !py-1 text-xs" disabled={editEmailBusy}
                                  onClick={() => void saveStaffEmail(m.id)}>Save</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => { setEditEmailUserId(null); setEditEmailValue(''); }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => { setEditEmailUserId(m.id); setEditEmailValue(m.email ?? ''); }}>Edit email</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => void resetStaffPassword({ userId: m.id, name: m.name, email: m.email, phone: m.phone, loginId: m.loginId, role: 'manager' })}>Reset pwd</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs text-rose-600 border-rose-200"
                                  onClick={() => void removeBranchManager(m.id, m.name)}>Remove</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(user?.role === 'CLINIC_ADMIN' || user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
              <div className="card p-5">
                <h2 className="section-title mb-4">
                  {L.staff}
                  <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal text-sm">({receptionists.length})</span>
                </h2>
                {receptionists.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No {L.staff.toLowerCase()} at this location yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
                    {receptionists.map((r) => (
                      <div key={r.id} className="px-4 py-3 bg-white dark:bg-slate-900/40 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{r.name}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {[r.email, r.phone].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          {r.locations?.[0]?.location?.name && (
                            <span className="text-xs text-slate-400 shrink-0">{r.locations[0].location.name}</span>
                          )}
                        </div>
                        {canManageStaff && (
                          <div className="flex flex-wrap gap-1.5">
                            {editEmailUserId === r.id ? (
                              <>
                                <input className="input !py-1 text-xs flex-1 min-w-[140px]" value={editEmailValue}
                                  onChange={(e) => setEditEmailValue(e.target.value)} placeholder="New email" />
                                <button type="button" className="btn-primary !px-2 !py-1 text-xs" disabled={editEmailBusy}
                                  onClick={() => void saveStaffEmail(r.id)}>Save</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => { setEditEmailUserId(null); setEditEmailValue(''); }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => { setEditEmailUserId(r.id); setEditEmailValue(r.email ?? ''); }}>Edit email</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs"
                                  onClick={() => void resetStaffPassword({ userId: r.id, name: r.name, email: r.email, phone: r.phone, loginId: r.loginId, role: 'receptionist' })}>Reset pwd</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs text-rose-600 border-rose-200"
                                  onClick={() => void removeWorker(r.id, r.name)}>Remove</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add doctor form */}
            <div className="card p-5">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 text-sm font-bold">+</span>
                Add {L.provider.toLowerCase()}
              </h2>
              <form onSubmit={addDoctor} className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <input className="input sm:col-span-2" placeholder="Full name" value={docName} onChange={(e) => setDocName(e.target.value)} required />
                <div className="sm:col-span-2">
                  <DepartmentPicker
                    options={departments}
                    value={docDeptId}
                    onChange={setDocDeptId}
                    required
                    allowCustom
                    placeholder={`Search ${L.department.toLowerCase()}…`}
                    label={`Select ${L.department.toLowerCase()}`}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">Avg {L.service.toLowerCase()} time:</span>
                  <input className="input flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={1} max={120} value={docAvg}
                    onChange={(e) => setDocAvg(Number(e.target.value))} required />
                  <span className="text-xs text-slate-400 shrink-0">{L.perCustomer}</span>
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2 cursor-pointer">
                  <input type="checkbox" className="rounded accent-brand-600"
                    checked={docUseDefaultSchedule}
                    onChange={(e) => setDocUseDefaultSchedule(e.target.checked)} />
                  <span className="text-slate-600 dark:text-slate-400 text-sm">
                    Apply default working schedule (Mon–Sat, multiple shifts — editable under Schedules)
                  </span>
                </label>
                <button type="submit" className="btn-primary sm:col-span-2" disabled={docBusy}>
                  {docBusy ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Adding…
                    </span>
                  ) : `Add ${L.provider.toLowerCase()}`}
                </button>
              </form>

            </div>

            {/* Doctor list */}
            <div className="card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="section-title">
                  {L.providerPlural}
                  <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal text-sm">
                    ({manageAssignmentsMode ? scheduleDoctors.length : doctors.length})
                  </span>
                </h2>
                {canManageStaff && (
                  <button
                    type="button"
                    onClick={() => setManageAssignmentsMode(!manageAssignmentsMode)}
                    className="btn btn-secondary !py-1.5 !px-3 !text-xs font-semibold w-fit"
                  >
                    {manageAssignmentsMode ? 'Show Working at Branch' : 'Manage Branch Assignments'}
                  </button>
                )}
              </div>

              {manageAssignmentsMode ? (
                scheduleDoctors.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No {L.providerPlural.toLowerCase()} in clinic yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {scheduleDoctors.map((doc) => {
                      const isAssigned = selectedLocationId
                        ? (doc.locationIds?.includes(selectedLocationId) ?? false)
                        : false;
                      const isToggling = togglingDocId === doc.id;
                      return (
                        <div key={doc.id} className="card-hover p-4 flex flex-col justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-brand-100 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
                              {doc.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{doc.name}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.department}</p>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-slate-400">
                              {isAssigned ? 'Assigned to branch' : 'Not assigned to branch'}
                            </span>
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => void toggleDoctorBranchAssignment(doc)}
                              className={`btn !py-1 !px-3 !text-xs font-bold ${isAssigned
                                ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400'
                                : 'btn-primary'
                                }`}
                            >
                              {isToggling ? 'Saving…' : isAssigned ? 'Remove' : 'Add to Branch'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : scheduleDoctors.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                    <UsersIcon className="w-7 h-7" />
                  </div>
                  <p className="font-semibold text-slate-600 dark:text-slate-300 text-sm">No {L.providerPlural.toLowerCase()} yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use the form above to add your first {L.provider.toLowerCase()}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scheduleDoctors.map((doc) => {
                    const isAssigned = !selectedLocationId || doc.locationIds?.includes(selectedLocationId);
                    return (
                      <div key={doc.id} className={`card-hover p-4 space-y-3 transition-all ${!isAssigned ? 'opacity-65 bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isAssigned
                            ? 'bg-gradient-to-br from-brand-100 to-emerald-100 dark:from-brand-900/40 dark:to-emerald-900/40 text-brand-700 dark:text-brand-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}>
                            {doc.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{doc.name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.department}</p>
                          </div>
                          <div className="shrink-0">
                            {isAssigned ? (
                              <DoctorStatusBadge status={doc.status} />
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/60 uppercase">Not in Branch</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 text-center text-xs pt-2 border-t border-slate-100 dark:border-slate-800/60">
                          <div className="space-y-0.5">
                            <p className={`font-bold text-base leading-none ${isAssigned ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                              {isAssigned ? doc.completed : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">Done</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className={`font-bold text-base leading-none ${isAssigned ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                              {isAssigned ? doc.missed : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">Missed</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className={`font-bold text-base leading-none ${isAssigned ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                              {isAssigned ? doc.cancelled : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">Cancel</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className={`font-bold text-base leading-none ${isAssigned ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'}`}>
                              {isAssigned ? doc.skipped : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">Skip</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="card-inset p-2 rounded-xl">
                            <p className={`font-bold ${isAssigned ? 'text-brand-700 dark:text-brand-400' : 'text-slate-400'}`}>
                              {isAssigned ? doc.waiting : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">Waiting</p>
                          </div>
                          <div className="card-inset p-2 rounded-xl">
                            <p className={`font-bold ${isAssigned ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400'}`}>
                              {isAssigned ? (doc.inConsultation ? '1' : '0') : '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500">In {L.service.toLowerCase()}</p>
                          </div>
                        </div>
                        {canManageStaff && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <button type="button" className="btn-secondary !px-2 !py-1 text-xs flex-1"
                              onClick={() => void resetStaffPassword({ userId: doc.userId, name: doc.name, email: null, phone: null, loginId: doc.loginId, role: 'doctor' })}>Reset pwd</button>
                            <button
                              type="button"
                              className={`btn !px-2 !py-1 text-xs flex-1 font-bold ${isAssigned
                                ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400'
                                : 'btn-primary'
                                }`}
                              onClick={() => void toggleDoctorBranchAssignment(doc)}
                            >
                              {isAssigned ? 'Remove' : 'Add to Branch'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {activeTab === 'settings' && (
          <SettingsTab
            setToast={setToast}
            locationId={selectedLocationId}
            onSettingsSaved={() => { void loadDashboard(true); setDepartments([]); void loadDepartments(); }}
          />
        )}

        {/* ── Locations ── */}
        {activeTab === 'locations' && (
          <LocationsTab setToast={setToast} />
        )}

        {/* ── Schedule ── */}
        {activeTab === 'schedule' && (
          <ScheduleTab doctors={scheduleDoctors} setToast={setToast} locationId={selectedLocationId} />
        )}

        {/* ── Leaves ── */}
        {activeTab === 'leaves' && (
          <LeavesTab doctors={doctors as any[]} setToast={setToast} />
        )}

        {/* ── Workflows ── */}
        {activeTab === 'workflows' && (
          <WorkflowTab doctors={doctors as any[]} setToast={setToast} locationId={selectedLocationId} />
        )}

        {/* ── Analytics ── */}
        {activeTab === 'analytics' && (
          <AnalyticsTab setToast={setToast} locationId={selectedLocationId} />
        )}
      </main>
    </div>
  );
}

// ─── Print helper ─────────────────────────────────────────────────────────────

function printHistory(entries: HistoryEntry[], L: ReturnType<typeof getLabels>, from: string, to: string) {
  const rows = entries.map((e) => `
    <tr>
      <td>#${e.tokenNumber}</td>
      <td>${e.serviceDay}</td>
      <td>${e.patient.name}</td>
      <td>${e.patient.phone}</td>
      <td>${e.doctor.name}</td>
      <td>${e.doctor.department}</td>
      <td>${fmtDuration(e.consultMinutes)}</td>
      <td>${e.status.charAt(0) + e.status.slice(1).toLowerCase()}</td>
    </tr>`).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Visit History ${from} to ${to}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
    h2 { font-size: 16px; margin-bottom: 4px; }
    p  { color: #64748b; margin-bottom: 16px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 10px; background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:last-child td { border-bottom: none; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h2>Visit History</h2>
  <p>${from === to ? from : `${from} → ${to}`} · ${entries.length} record${entries.length !== 1 ? 's' : ''}</p>
  <table>
    <thead><tr>
      <th>Token</th><th>Date</th><th>${L.customer}</th><th>Phone</th><th>${L.provider}</th><th>Time taken</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ─── Reports hub ──────────────────────────────────────────────────────────────

type HistoryReport =
  | 'catalog'
  | 'visit-entries'
  | 'by-provider'
  | 'staff-performance'
  | 'ratings'
  | 'queue-overview'
  | 'staff-leaves';

interface ReportCard {
  id: HistoryReport;
  title: string;
  description: string;
  category: string;
}

const HISTORY_REPORTS: ReportCard[] = [
  {
    id: 'visit-entries',
    category: 'Queue',
    title: 'Visit entries',
    description: 'Detailed log of every queue visit with status, duration, and patient info.',
  },
  {
    id: 'by-provider',
    category: 'Queue',
    title: 'By provider',
    description: 'Visit counts and breakdown grouped by each professional.',
  },
  {
    id: 'queue-overview',
    category: 'Queue',
    title: 'Overview per period',
    description: 'Daily visit trend — completed, missed, and cancelled over the selected range.',
  },
  {
    id: 'staff-performance',
    category: 'Staff',
    title: 'Staff performance',
    description: 'Visitors served, tokens generated, served time, and idle time per professional.',
  },
  {
    id: 'ratings',
    category: 'Staff',
    title: 'Ratings & feedback',
    description: 'Customer ratings and comments submitted after completed visits.',
  },
  {
    id: 'staff-leaves',
    category: 'Staff',
    title: 'Staff leave report',
    description: 'Leave and break requests in the selected period with status breakdown.',
  },
];

interface StaffPerformanceRow {
  doctorId: string;
  staffName: string;
  department: string;
  visitorsServed: number;
  tokensGenerated: number;
  totalServedMs: number;
  avgServedMs: number;
  idleMs: number;
}

interface RatingsReport {
  from: string;
  to: string;
  total: number;
  average: number;
  byDoctor: Array<{ doctorId: string; name: string; department: string; count: number; avg: number }>;
  entries: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    doctor: { name: string; department: string };
    patient: { name: string };
    tokenNumber: number;
    serviceDay: string;
  }>;
}

interface LeaveAnalyticsReport {
  from: string;
  to: string;
  totals: { requests: number; pending: number; approved: number; rejected: number; cancelled: number };
  byType: Array<{ type: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  topStaff: Array<{ name: string; role: string; count: number; days: number }>;
}

function ReportCatalog({
  active,
  onSelect,
}: {
  active: HistoryReport;
  onSelect: (id: HistoryReport) => void;
}) {
  const categories = [...new Set(HISTORY_REPORTS.map((r) => r.category))];
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reports by service</h3>
        <p className="text-xs text-slate-500 mt-1">Choose a report to view, filter, and export.</p>
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{cat}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {HISTORY_REPORTS.filter((r) => r.category === cat).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm ${active === r.id
                  ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-900/20 ring-2 ring-teal-500/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
              >
                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">{r.title}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{r.description}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffPerformanceReportView({
  from,
  to,
  search,
  onSearchChange,
  labels: L,
}: {
  from: string;
  to: string;
  search: string;
  onSearchChange: (v: string) => void;
  labels: ReturnType<typeof getLabels>;
}) {
  const [rows, setRows] = useState<StaffPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
    api<{ staff: StaffPerformanceRow[] }>(`/clinics/my/reports/staff-performance?from=${from}&to=${to}${q}`)
      .then((r) => setRows(r.staff))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [from, to, search]);

  async function exportCsv() {
    setExporting(true);
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      const res = await api<{ csv: string }>(`/clinics/my/reports/staff-performance/export?from=${from}&to=${to}${q}`);
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-performance-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function exportPdf() {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const body = rows.map((r) => `
      <tr>
        <td>${r.staffName}</td>
        <td>${r.visitorsServed}</td>
        <td>${r.tokensGenerated}</td>
        <td>${formatDurationHms(r.totalServedMs)}</td>
        <td>${formatDurationHms(r.avgServedMs)}</td>
        <td>${formatDurationHms(r.idleMs)}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Staff Performance</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}</style>
      </head><body><h2>Staff performance report</h2><p>${from} → ${to}</p>
      <table><thead><tr><th>${L.provider}</th><th>Visitors served</th><th>Tokens generated</th><th>Total served</th><th>Avg served</th><th>Idle time</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={`Search ${L.provider.toLowerCase()}…`}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input !py-1.5 text-xs max-w-xs"
        />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void exportCsv()} disabled={exporting}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 rounded-lg disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button type="button" onClick={exportPdf}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 rounded-lg">
            Export PDF
          </button>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No data for this period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">{L.provider}</th>
                <th className="px-4 py-3 font-semibold">Visitors served</th>
                <th className="px-4 py-3 font-semibold">Tokens generated</th>
                <th className="px-4 py-3 font-semibold">Total served time</th>
                <th className="px-4 py-3 font-semibold">Average served time</th>
                <th className="px-4 py-3 font-semibold">Idle time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.map((r) => (
                <tr key={r.doctorId} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/20">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.staffName}</td>
                  <td className="px-4 py-3 tabular-nums">{r.visitorsServed}</td>
                  <td className="px-4 py-3 tabular-nums">{r.tokensGenerated}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatDurationHms(r.totalServedMs)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatDurationHms(r.avgServedMs)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatDurationHms(r.idleMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RatingsReportView({
  from,
  to,
  search,
  onSearchChange,
  labels: L,
}: {
  from: string;
  to: string;
  search: string;
  onSearchChange: (v: string) => void;
  labels: ReturnType<typeof getLabels>;
}) {
  const [report, setReport] = useState<RatingsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
    api<RatingsReport>(`/ratings/clinic?from=${from}&to=${to}${q}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [from, to, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={`Search ${L.provider.toLowerCase()}…`}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input !py-1.5 text-xs max-w-xs"
        />
        {report && (
          <div className="ml-auto flex gap-4 text-sm">
            <span className="text-slate-500">{report.total} rating{report.total !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-amber-600">Avg {report.average} ★</span>
          </div>
        )}
      </div>
      {report && report.byDoctor.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {report.byDoctor.map((d) => (
            <div key={d.doctorId} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-xs text-slate-500 truncate">{d.name}</div>
              <div className="text-lg font-bold text-amber-600 mt-1">{d.avg} ★</div>
              <div className="text-[10px] text-slate-400">{d.count} review{d.count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : !report?.entries.length ? (
          <div className="py-16 text-center text-sm text-slate-400">No ratings in this period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">{L.provider}</th>
                <th className="px-4 py-3 font-semibold">{L.customer}</th>
                <th className="px-4 py-3 font-semibold">Rating</th>
                <th className="px-4 py-3 font-semibold">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {report.entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-xs">{e.serviceDay}</td>
                  <td className="px-4 py-3">{e.doctor.name}</td>
                  <td className="px-4 py-3">{e.patient.name}</td>
                  <td className="px-4 py-3 text-amber-500">{'★'.repeat(e.rating)}{'☆'.repeat(5 - e.rating)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{e.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LeavesReportView({ from, to }: { from: string; to: string }) {
  const [report, setReport] = useState<LeaveAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<LeaveAnalyticsReport>(`/leaves/analytics?from=${from}&to=${to}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading…</div>;
  if (!report) return <div className="py-16 text-center text-sm text-slate-400">Could not load leave report.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Requests" value={report.totals.requests} color="teal" />
        <StatCard label="Pending" value={report.totals.pending} color="amber" />
        <StatCard label="Approved" value={report.totals.approved} color="green" />
        <StatCard label="Rejected" value={report.totals.rejected} color="red" />
        <StatCard label="Cancelled" value={report.totals.cancelled} color="slate" />
      </div>
      {report.topStaff.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Requests</th>
                <th className="px-4 py-3 font-semibold">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {report.topStaff.map((s, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.role.replace('_', ' ')}</td>
                  <td className="px-4 py-3 tabular-nums">{s.count}</td>
                  <td className="px-4 py-3 tabular-nums">{s.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── History Tab (redesigned) ─────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SKIPPED';

function HistoryTab({
  from, to, page, data, trendPoints,
  onDateChange, onPageChange, onRefresh, labels: L,
}: {
  from: string; to: string; page: number;
  data: HistoryResponse | null;
  trendPoints: AnalyticsPoint[];
  onDateChange: (f: string, t: string) => void;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  labels: ReturnType<typeof getLabels>;
}) {
  const { user } = useAuth();
  const canImport = user?.role === 'CLINIC_ADMIN' || user?.role === 'ADMIN';
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeReport, setActiveReport] = useState<HistoryReport>('catalog');
  const [staffSearch, setStaffSearch] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('ALL');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const summary = data?.summary ?? { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 };

  const presets = [
    { label: 'Today', from: TODAY, to: TODAY },
    { label: '7d', from: daysAgo(6), to: TODAY },
    { label: '30d', from: daysAgo(29), to: TODAY },
    { label: '3 mo', from: daysAgo(89), to: TODAY },
  ];

  // Build doctor list for officer pills
  const officerGroups = useMemo(
    () => buildOfficerGroups(data?.entries ?? []),
    [data?.entries],
  );

  useEffect(() => {
    if (selectedOfficer === 'ALL') return;
    if (!officerGroups.some((g) => g.name === selectedOfficer)) {
      setSelectedOfficer('ALL');
    }
  }, [officerGroups, selectedOfficer]);

  // Client-side filtering
  const filtered = (data?.entries ?? []).filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (selectedOfficer !== 'ALL' && e.doctor.name !== selectedOfficer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.patient.name.toLowerCase().includes(q) && !e.doctor.name.toLowerCase().includes(q) && !e.doctor.department.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredGroups = useMemo(() => {
    const groups = buildOfficerGroups(filtered);
    return selectedOfficer === 'ALL'
      ? groups
      : groups.filter((g) => g.name === selectedOfficer);
  }, [filtered, selectedOfficer]);

  const statusBtns: { value: StatusFilter; label: string; color: string }[] = [
    { value: 'ALL', label: 'All', color: 'bg-slate-700 text-white' },
    { value: 'COMPLETED', label: 'Completed', color: 'bg-emerald-600 text-white' },
    { value: 'MISSED', label: 'Missed', color: 'bg-amber-500 text-white' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-rose-500 text-white' },
    { value: 'SKIPPED', label: 'Skipped', color: 'bg-slate-500 text-white' },
  ];

  const hasFilters = search || statusFilter !== 'ALL' || selectedOfficer !== 'ALL';

  const activeReportMeta = HISTORY_REPORTS.find((r) => r.id === activeReport);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await api<{ csv: string; count: number }>(`/clinics/my/history/export?from=${from}&to=${to}`);
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visit-history-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await api<{ imported: number; errors: string[] }>('/clinics/my/history/import', {
        method: 'POST',
        body: { csv: text },
      });
      alert(`Imported ${res.imported} record(s).${res.errors?.length ? `\n\nIssues:\n${res.errors.join('\n')}` : ''}`);
      onRefresh();
    } catch {
      alert('Import failed. Use CSV with columns: serviceDay, patientName, patientPhone, doctorName, status');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Filter bar ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex gap-1">
            {presets.map((pr) => (
              <button key={pr.label} type="button" onClick={() => onDateChange(pr.from, pr.to)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${from === pr.from && to === pr.to
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}>{pr.label}</button>
            ))}
          </div>
          {/* Custom date range */}
          <div className="flex items-center gap-1.5 ml-2">
            <DatePicker value={from} max={to} onChange={(v) => onDateChange(v, to)} size="sm" />
            <span className="text-slate-400 text-xs">→</span>
            <DatePicker value={to} min={from} max={TODAY} onChange={(v) => onDateChange(from, v)} size="sm" />
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 ml-auto flex-1 min-w-[160px] max-w-xs">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text" placeholder={`Search ${L.customer.toLowerCase()}, ${L.provider.toLowerCase()}…`} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedOfficer('ALL'); }}
                className="text-xs text-rose-500 hover:text-rose-600 whitespace-nowrap">Clear</button>
            )}
          </div>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <div className="flex gap-1 flex-wrap">
            {statusBtns.map(({ value, label, color }) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity ${statusFilter === value ? color : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" value={summary.total} color="teal" />
        <StatCard label="Completed" value={summary.completed} color="green" />
        <StatCard label="Missed" value={summary.missed} color="amber" />
        <StatCard label="Cancelled" value={summary.cancelled} color="red" />
        <StatCard label="Skipped" value={summary.skipped} color="slate" />
      </div>

      {/* ── Trend chart (queue overview) ── */}
      {(activeReport === 'catalog' || activeReport === 'queue-overview') && trendPoints.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Visit Trend</h3>
            <div className="flex items-center gap-3">
              <LegendDot color="#14b8a6" label="Completed" />
              <LegendDot color="#f59e0b" label="Missed" />
              <LegendDot color="#ef4444" label="Cancelled" />
            </div>
          </div>
          <BookingLineChart points={trendPoints} />
        </div>
      )}

      {/* ── Report navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveReport('catalog')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeReport === 'catalog'
            ? 'border-teal-600 text-teal-600'
            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
        >
          All reports
        </button>
        {activeReport !== 'catalog' && activeReportMeta && (
          <span className="px-4 py-2.5 text-sm font-medium border-b-2 border-teal-600 text-teal-600 -mb-px">
            {activeReportMeta.title}
          </span>
        )}
        {activeReport !== 'catalog' && (
          <button
            type="button"
            onClick={() => setActiveReport('catalog')}
            className="ml-auto text-xs text-slate-500 hover:text-teal-600 pb-2"
          >
            ← Back to reports
          </button>
        )}
        {(activeReport === 'visit-entries' || activeReport === 'by-provider') && (
          <div className="ml-auto pb-1 flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              type="button"
              onClick={() => printHistory(filtered, L, from, to)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >
              <PrintIcon className="w-3.5 h-3.5" />
              Export PDF
            </button>
            {canImport && (
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-lg cursor-pointer transition-colors">
                {importing ? 'Importing…' : 'Import CSV'}
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {activeReport === 'visit-entries' && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Delete period
              </button>
            )}
          </div>
        )}
      </div>

      {activeReport === 'catalog' && (
        <ReportCatalog active={activeReport} onSelect={setActiveReport} />
      )}

      {activeReport === 'staff-performance' && (
        <StaffPerformanceReportView
          from={from}
          to={to}
          search={staffSearch}
          onSearchChange={setStaffSearch}
          labels={L}
        />
      )}

      {activeReport === 'ratings' && (
        <RatingsReportView
          from={from}
          to={to}
          search={staffSearch}
          onSearchChange={setStaffSearch}
          labels={L}
        />
      )}

      {activeReport === 'staff-leaves' && (
        <LeavesReportView from={from} to={to} />
      )}

      {activeReport === 'queue-overview' && trendPoints.length <= 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-16 text-center text-sm text-slate-400">
          Not enough data for a trend chart in this period.
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && activeReport === 'visit-entries' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Delete history records</h3>
                <p className="text-xs text-slate-500 mt-0.5">{fmtDate(from)} → {fmtDate(to)}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete all completed, missed, cancelled, and skipped entries in this date range. <strong>This cannot be undone.</strong>
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api(`/clinics/my/history?from=${from}&to=${to}`, { method: 'DELETE' });
                    setShowDeleteConfirm(false);
                    onPageChange(1);
                    onRefresh();
                  } catch { /* ignore */ }
                  finally { setDeleting(false); }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-sm text-white font-medium transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete records'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visit Entries ── */}
      {activeReport === 'visit-entries' && (
        <div className="space-y-4">
          {officerGroups.length > 0 && (
            <OfficerSelectorPills
              groups={officerGroups}
              totalEntries={(data?.entries ?? []).length}
              selected={selectedOfficer}
              onSelect={setSelectedOfficer}
              labels={L}
            />
          )}

          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-16 text-center text-slate-400 text-sm">
              {hasFilters ? 'No entries match your filters.' : 'No visit records for this period.'}
            </div>
          ) : (
            <>
              {filteredGroups.map((g) => (
                <div
                  key={g.name}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{g.name}</h3>
                      <p className="text-xs text-slate-500">{g.department}</p>
                    </div>
                    <OfficerStatusBadges group={g} />
                  </div>
                  <HistoryEntriesTable
                    entries={g.entries}
                    labels={L}
                    showProvider={selectedOfficer === 'ALL'}
                  />
                </div>
              ))}

              {!hasFilters && data && data.pages > 1 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{data.total} total entries</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onPageChange(data.page - 1)} disabled={data.page <= 1}
                      className="px-3 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">← Prev</button>
                    <span className="text-xs text-slate-500">{data.page} / {data.pages}</span>
                    <button type="button" onClick={() => onPageChange(data.page + 1)} disabled={data.page >= data.pages}
                      className="px-3 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── By Provider ── */}
      {activeReport === 'by-provider' && (
        <ByDoctorView entries={filtered} labels={L} />
      )}
    </div>
  );
}

// ─── By Officer view — summary chart + counts ─────────────────────────────────

type OfficerGroup = {
  name: string;
  department: string;
  entries: HistoryEntry[];
  completed: number;
  missed: number;
  cancelled: number;
  skipped: number;
};

function buildOfficerGroups(entries: HistoryEntry[]): OfficerGroup[] {
  const map = new Map<string, OfficerGroup>();
  for (const e of entries) {
    if (!map.has(e.doctor.name)) {
      map.set(e.doctor.name, {
        name: e.doctor.name,
        department: e.doctor.department,
        entries: [],
        completed: 0,
        missed: 0,
        cancelled: 0,
        skipped: 0,
      });
    }
    const g = map.get(e.doctor.name)!;
    g.entries.push(e);
    if (e.status === 'COMPLETED') g.completed++;
    else if (e.status === 'MISSED') g.missed++;
    else if (e.status === 'CANCELLED') g.cancelled++;
    else if (e.status === 'SKIPPED') g.skipped++;
  }
  return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length);
}

function OfficerStatusBadges({ group: g }: { group: OfficerGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
        {g.completed} completed
      </span>
      {g.missed > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
          {g.missed} missed
        </span>
      )}
      {g.cancelled > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-medium">
          {g.cancelled} cancelled
        </span>
      )}
      {g.skipped > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
          {g.skipped} skipped
        </span>
      )}
    </div>
  );
}

function OfficerSelectorPills({
  groups,
  totalEntries,
  selected,
  onSelect,
  labels: L,
}: {
  groups: OfficerGroup[];
  totalEntries: number;
  selected: string;
  onSelect: (name: string) => void;
  labels: ReturnType<typeof getLabels>;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Select {L.provider.toLowerCase()}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect('ALL')}
          className={`rounded-xl border px-3.5 py-2 text-left text-sm transition-all ${selected === 'ALL'
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-sm ring-2 ring-teal-500/20'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
        >
          <div className={`font-semibold ${selected === 'ALL' ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-100'}`}>
            All {L.providerPlural.toLowerCase()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{totalEntries} visits</div>
        </button>
        {groups.map((g) => {
          const isSelected = selected === g.name;
          const total = g.completed + g.missed + g.cancelled + g.skipped;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => onSelect(g.name)}
              className={`rounded-xl border px-3.5 py-2 text-left text-sm transition-all ${isSelected
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-sm ring-2 ring-teal-500/20'
                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              <div className={`font-semibold truncate ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-100'}`}>
                {g.name}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {g.department} · {total} visit{total !== 1 ? 's' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ByDoctorView({ entries, labels: L }: { entries: HistoryEntry[]; labels: ReturnType<typeof getLabels> }) {
  type DRow = { name: string; department: string; completed: number; missed: number; cancelled: number; skipped: number };

  const docMap = new Map<string, DRow>();
  for (const e of entries) {
    if (!docMap.has(e.doctor.name)) docMap.set(e.doctor.name, { name: e.doctor.name, department: e.doctor.department, completed: 0, missed: 0, cancelled: 0, skipped: 0 });
    const d = docMap.get(e.doctor.name)!;
    if (e.status === 'COMPLETED') d.completed++;
    else if (e.status === 'MISSED') d.missed++;
    else if (e.status === 'CANCELLED') d.cancelled++;
    else if (e.status === 'SKIPPED') d.skipped++;
  }
  const rows = Array.from(docMap.values()).sort((a, b) => (b.completed + b.missed) - (a.completed + a.missed));

  if (rows.length === 0) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-16 text-center text-slate-400 text-sm">
      No data for this period.
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <LegendDot color="#14b8a6" label="Completed" />
          <LegendDot color="#f59e0b" label="Missed" />
          <LegendDot color="#ef4444" label="Cancelled" />
          <LegendDot color="#94a3b8" label="Skipped" />
        </div>
        <DoctorHistogram doctors={rows as DoctorAnalyticsRow[]} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/40">
              <tr>
                {[L.provider, L.department, 'Completed', 'Missed', 'Cancelled', 'Skipped', 'Total'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{r.department}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-emerald-600">{r.completed}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-amber-600">{r.missed}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-rose-600">{r.cancelled}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-slate-500">{r.skipped}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-slate-800 dark:text-slate-100">{r.completed + r.missed + r.cancelled + r.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, { bg: string; text: string; bar: string }> = {
    teal: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-brand-600 dark:text-brand-400', bar: 'bg-brand-500' },
    blue: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
    green: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
    amber: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
    red: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
    slate: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800', text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400' },
  };
  const c = cls[color] ?? cls.slate;
  return (
    <div className={`rounded-2xl shadow-card p-4 overflow-hidden relative ${c.bg}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar} opacity-70`} />
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 tracking-tight ${c.text}`}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function DoctorStatusBadge({ status }: { status: string }) {
  if (status === 'AVAILABLE')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Available</span>;
  if (status === 'PAUSED')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Break</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Offline</span>;
}

// ─── Booking Overview — multi-series line chart ───────────────────────────────

interface LineTooltip { idx: number; screenX: number; screenY: number }

function BookingLineChart({ points }: { points: AnalyticsPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<LineTooltip | null>(null);

  if (!points.length) {
    return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No data yet — visit data will appear here.</div>;
  }

  const W = 700; const H = 200;
  const pad = { t: 10, r: 20, b: 36, l: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const maxVal = Math.max(...points.flatMap((p) => [p.completed, p.missed, p.cancelled]), 1);
  const step = cW / Math.max(points.length - 1, 1);
  const toX = (i: number) => pad.l + i * step;
  const toY = (v: number) => pad.t + cH - (v / maxVal) * cH;

  const tickCount = Math.min(maxVal, 5);
  const yTicks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];

  const line = (key: 'completed' | 'missed' | 'cancelled') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p[key]).toFixed(1)}`).join(' ');

  const series: Array<{ key: 'completed' | 'missed' | 'cancelled'; color: string }> = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed', color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
  ];

  const labelEvery = points.length > 20 ? Math.ceil(points.length / 10) : 1;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(relX * (points.length - 1))));
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

// ─── Doctor histogram — grouped bar chart ─────────────────────────────────────

interface BarTooltip { doctorIdx: number; screenX: number; screenY: number }

function DoctorHistogram({ doctors }: { doctors: (DashboardDoctor | DoctorAnalyticsRow)[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<BarTooltip | null>(null);

  if (!doctors.length) {
    return <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No doctors added yet.</div>;
  }

  const W = 700; const H = 220;
  const pad = { t: 10, r: 20, b: 54, l: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const BARS: Array<{ key: keyof DoctorAnalyticsRow; color: string; label: string }> = [
    { key: 'completed', color: '#14b8a6', label: 'Completed' },
    { key: 'missed', color: '#f59e0b', label: 'Missed' },
    { key: 'cancelled', color: '#ef4444', label: 'Cancelled' },
    { key: 'skipped', color: '#94a3b8', label: 'Skipped' },
  ];
  const barW = Math.min(12, Math.floor((cW / doctors.length - 8) / BARS.length));
  const gap = Math.max(2, Math.floor(barW * 0.35));
  const groupW = BARS.length * barW + (BARS.length - 1) * gap;
  const docSpacing = cW / doctors.length;

  const getVal = (d: DashboardDoctor | DoctorAnalyticsRow, key: string) =>
    (d as unknown as Record<string, number>)[key] ?? 0;

  const maxVal = Math.max(...doctors.flatMap((d) => BARS.map(({ key }) => getVal(d, key as string))), 1);
  const tickCount = Math.min(maxVal, 5);
  const yTicks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];
  const toY = (v: number) => pad.t + cH - (v / maxVal) * cH;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(doctors.length - 1, Math.floor((svgX - pad.l) / docSpacing)));
    setTip({ doctorIdx: idx, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
  };

  const tipDoc = tip !== null ? doctors[tip.doctorIdx] : null;

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
          <rect x={pad.l + tip.doctorIdx * docSpacing} y={pad.t} width={docSpacing} height={cH}
            fill="currentColor" fillOpacity="0.04" />
        )}
        {doctors.map((doc, di) => {
          const cx = pad.l + di * docSpacing + docSpacing / 2;
          const groupLeft = cx - groupW / 2;
          const nameLabel = doc.name.length > 10 ? doc.name.split(' ').map((w) => w[0]).join('') : doc.name.split(' ')[0];
          return (
            <g key={(doc as DoctorAnalyticsRow).id ?? doc.name}>
              {BARS.map(({ key, color }, bi) => {
                const val = getVal(doc, key as string);
                const barH = val > 0 ? Math.max((val / maxVal) * cH, 3) : 0;
                const x = groupLeft + bi * (barW + gap);
                const y = pad.t + cH - barH;
                return (
                  <g key={key}>
                    <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2"
                      opacity={tip?.doctorIdx === di ? 1 : 0.82} />
                    {val > 0 && barH > 16 && (
                      <text x={x + barW / 2} y={y + 11} textAnchor="middle" className="fill-white" fontSize="7" fontWeight="600">{val}</text>
                    )}
                  </g>
                );
              })}
              <text x={cx} y={H - 22} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="8" fontWeight="500">{nameLabel}</text>
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="7">{doc.department?.slice(0, 8)}</text>
            </g>
          );
        })}
      </svg>
      {tip !== null && tipDoc && (
        <div className="absolute pointer-events-none z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[150px]"
          style={{ left: tip.screenX > 500 ? tip.screenX - 170 : tip.screenX + 12, top: Math.max(4, tip.screenY - 80) }}>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5 truncate">{tipDoc.name}</p>
          <p className="text-slate-400 text-[10px] mb-1.5">{tipDoc.department}</p>
          <div className="space-y-1">
            {BARS.map(({ key, color, label }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />{label}</span>
                <span className="font-bold" style={{ color }}>{(tipDoc as unknown as Record<string, number>)[key as string] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
}
function ListIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;
}
function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" /></svg>;
}
function UsersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function HeartIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
}
function CoinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 015 0c0 3.5-5 4-5 6.5a2.5 2.5 0 005 0" /></svg>;
}
function GearIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function RefreshIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
function LogoutIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function PrintIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
}
function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}
function RouteIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>;
}
function ChartIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>;
}
function MapPinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" /></svg>;
}
