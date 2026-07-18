import { useEffect, useState } from 'react';
import { formatDateTimeIst } from '@/lib/datetime';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type ToastMessage } from './Toast';

interface DoctorItem {
  id: string;
  userId?: string;
  name: string;
  department: string;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  reason?: string;
  user: {
    id: string;
    name: string;
    role?: string;
  };
}

export const LEAVE_TYPES = [
  { value: 'LEAVE', label: 'Annual Leave' },
  { value: 'BREAK', label: 'Short Break' },
  { value: 'EMERGENCY_LEAVE', label: 'Emergency Leave' },
  { value: 'LUNCH', label: 'Lunch Break' },
  { value: 'BUSY', label: 'Busy / Unavailable' },
];

interface LeaveAnalytics {
  from: string;
  to: string;
  totals: {
    requests: number;
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
  };
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byRole: { role: string; count: number }[];
  topStaff: { name: string; role: string; count: number; days: number }[];
}

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50',
  APPROVED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50',
  REJECTED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50',
  CANCELLED: 'text-slate-500 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
};

function roleLabel(role?: string) {
  if (role === 'CLINIC_ADMIN') return 'Business Admin';
  if (role === 'MANAGER') return 'Branch Manager';
  if (role === 'RECEPTIONIST') return 'Reception';
  if (role === 'DOCTOR') return 'Professional';
  return role ?? '';
}

export function LeavesTab({
  doctors = [],
  setToast,
}: {
  doctors?: DoctorItem[];
  setToast: (t: ToastMessage | null) => void;
}) {
  const { user } = useAuth();
  const isBusinessAdmin = user?.role === 'CLINIC_ADMIN' || user?.role === 'MANAGER';
  const isStaff = user?.role === 'RECEPTIONIST' || user?.role === 'DOCTOR';

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [analytics, setAnalytics] = useState<LeaveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedDocId, setSelectedDocId] = useState(doctors[0]?.id || '');
  const [type, setType] = useState('BREAK');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadLeaves = async () => {
    try {
      const url = isBusinessAdmin ? '/leaves/clinic' : '/leaves/my';
      const [data, stats] = await Promise.all([
        api<LeaveRequest[]>(url),
        api<LeaveAnalytics>('/leaves/analytics').catch(() => null),
      ]);
      setLeaves(data);
      setAnalytics(stats);
    } catch {
      setToast({ type: 'err', msg: 'Failed to load leave requests' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    useAuth.getState().hydrate();
  }, []);

  useEffect(() => {
    void loadLeaves();
  }, [isBusinessAdmin, setToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        type,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      };
      if (reason.trim()) body.reason = reason.trim();

      if (isBusinessAdmin && selectedDocId) {
        const doc = doctors.find((d) => d.id === selectedDocId);
        if (doc?.userId) body.userId = doc.userId;
      }

      await api('/leaves/request', { method: 'POST', body });
      setToast({
        type: 'ok',
        msg: isBusinessAdmin && body.userId
          ? 'Leave request submitted for staff member'
          : 'Leave request sent to business admin for approval',
      });
      setStartDate('');
      setEndDate('');
      setReason('');
      void loadLeaves();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to request leave' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    try {
      await api(`/leaves/${id}/${action}`, { method: 'POST' });
      setToast({ type: 'ok', msg: `Leave request ${action}${action === 'cancel' ? 'led' : 'ed'} successfully` });
      void loadLeaves();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : `Failed to ${action} leave` });
    }
  };

  const fmtDateTime = (iso: string) => formatDateTimeIst(iso);
  const pendingCount = leaves.filter((l) => l.status === 'PENDING').length;

  return (
    <div className="p-5 sm:p-6 max-w-6xl mx-auto space-y-6">
      {analytics && (
        <div className="space-y-4">
          <h2 className="section-title">Leave & break analytics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analytics.totals.requests}</p>
              <p className="text-[10px] text-slate-400 uppercase">Total requests</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{analytics.totals.pending}</p>
              <p className="text-[10px] text-slate-400 uppercase">Pending</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{analytics.totals.approved}</p>
              <p className="text-[10px] text-slate-400 uppercase">Approved</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-rose-600">{analytics.totals.rejected}</p>
              <p className="text-[10px] text-slate-400 uppercase">Rejected</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-slate-500">{analytics.totals.cancelled}</p>
              <p className="text-[10px] text-slate-400 uppercase">Cancelled</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">By type</h3>
              <ul className="space-y-1 text-sm">
                {analytics.byType.map((t) => (
                  <li key={t.type} className="flex justify-between">
                    <span>{LEAVE_TYPES.find((x) => x.value === t.type)?.label ?? t.type}</span>
                    <span className="font-semibold tabular-nums">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">By role</h3>
              <ul className="space-y-1 text-sm">
                {analytics.byRole.map((r) => (
                  <li key={r.role} className="flex justify-between">
                    <span>{roleLabel(r.role)}</span>
                    <span className="font-semibold tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Most time off (days)</h3>
              <ul className="space-y-1 text-sm">
                {analytics.topStaff.length === 0 ? (
                  <li className="text-slate-400 text-xs">No data yet</li>
                ) : analytics.topStaff.map((s) => (
                  <li key={s.name} className="flex justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <span className="font-semibold tabular-nums shrink-0">{s.days}d</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isBusinessAdmin && pendingCount > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {pendingCount} pending request{pendingCount === 1 ? '' : 's'} awaiting your approval.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 space-y-4 lg:col-span-1 h-fit">
          <h2 className="section-title flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-sm font-bold">+</span>
            Request Leave/Break
          </h2>
          {isStaff && (
            <p className="text-xs text-slate-500 -mt-2">
              Submitted to your business admin for approval.
            </p>
          )}
          <form onSubmit={handleRequest} className="space-y-3">
            {isBusinessAdmin && doctors.length > 0 && (
              <div>
                <label className="label text-xs font-semibold text-slate-500 uppercase">Staff member (optional)</label>
                <select className="input mt-1 w-full" value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}>
                  <option value="">Myself</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.department})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Type</label>
              <select className="input mt-1 w-full" value={type}
                onChange={(e) => setType(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Start</label>
              <input className="input mt-1 w-full text-xs" type="datetime-local" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">End</label>
              <input className="input mt-1 w-full text-xs" type="datetime-local" value={endDate}
                onChange={(e) => setEndDate(e.target.value)} required />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Reason / note</label>
              <textarea className="input mt-1 w-full text-xs min-h-[60px]" value={reason}
                onChange={(e) => setReason(e.target.value)} placeholder="E.g. medical appointment, lunch break" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition-colors disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="section-title">
              {isBusinessAdmin ? 'Team leave & break requests' : 'My requests'}
            </h2>
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
            ) : leaves.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No leave or break requests yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/40">
                    <tr>
                      {(isBusinessAdmin
                        ? ['Staff member', 'Type', 'Period', 'Status', 'Actions']
                        : ['Type', 'Period', 'Status', 'Actions']
                      ).map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        {isBusinessAdmin && (
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{l.user.name}</div>
                            {l.user.role && (
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide">{roleLabel(l.user.role)}</div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {LEAVE_TYPES.find((t) => t.value === l.type)?.label || l.type}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-[11px] leading-tight">
                          <div>{fmtDateTime(l.startDate)}</div>
                          <div className="text-[10px] text-slate-500">to</div>
                          <div>{fmtDateTime(l.endDate)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEAVE_STATUS_COLORS[l.status] || 'bg-slate-100'}`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 space-x-1.5 whitespace-nowrap">
                          {l.status === 'PENDING' && isBusinessAdmin && l.user.id !== user?.id && (
                            <>
                              <button type="button" onClick={() => handleAction(l.id, 'approve')} className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">Approve</button>
                              <button type="button" onClick={() => handleAction(l.id, 'reject')} className="text-xs text-rose-600 hover:text-rose-700 font-semibold">Reject</button>
                            </>
                          )}
                          {l.status === 'PENDING' && !isBusinessAdmin && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">Awaiting business admin</span>
                          )}
                          {l.status === 'PENDING' && isBusinessAdmin && l.user.id === user?.id && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">Awaiting another admin</span>
                          )}
                          {l.status === 'PENDING' && l.user.id === user?.id && (
                            <button type="button" onClick={() => handleAction(l.id, 'cancel')} className="text-xs text-slate-600 hover:text-slate-700 font-semibold ml-2">Cancel</button>
                          )}
                          {l.status === 'APPROVED' && l.user.id === user?.id && (
                            <button type="button" onClick={() => handleAction(l.id, 'cancel')} className="text-xs text-slate-600 hover:text-slate-700 font-semibold">Cancel</button>
                          )}
                          {l.status !== 'PENDING' && l.status !== 'APPROVED' && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
