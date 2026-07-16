import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { type ToastMessage } from './Toast';

interface DoctorItem {
  id: string;
  userId: string;
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
    name: string;
  };
}

const LEAVE_TYPES = [
  { value: 'LEAVE', label: 'Annual Leave' },
  { value: 'BREAK', label: 'Short Break' },
  { value: 'EMERGENCY_LEAVE', label: 'Emergency Leave' },
  { value: 'LUNCH', label: 'Lunch Break' },
  { value: 'BUSY', label: 'Busy' },
];

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50',
  APPROVED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50',
  REJECTED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50',
  CANCELLED: 'text-slate-500 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
};

export function LeavesTab({ doctors, setToast }: { doctors: DoctorItem[]; setToast: (t: ToastMessage | null) => void }) {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedDocId, setSelectedDocId] = useState(doctors[0]?.id || '');
  const [type, setType] = useState('LEAVE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadLeaves = async () => {
    try {
      const data = await api<LeaveRequest[]>('/leaves/clinic');
      setLeaves(data);
    } catch {
      setToast({ type: 'err', msg: 'Failed to load leave requests' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeaves();
  }, [setToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const doc = doctors.find((d) => d.id === selectedDocId);
    if (!doc) return;
    setSubmitting(true);
    try {
      await api('/leaves/request', {
        method: 'POST',
        body: {
          userId: doc.userId,
          type,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          reason,
        },
      });
      setToast({ type: 'ok', msg: 'Leave request submitted successfully' });
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
      setToast({ type: 'ok', msg: `Leave request ${action}d successfully` });
      void loadLeaves();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : `Failed to ${action} leave` });
    }
  };

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="p-5 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Request Form */}
        <div className="card p-5 space-y-4 lg:col-span-1 h-fit">
          <h2 className="section-title flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-sm font-bold">+</span>
            Request Leave/Break
          </h2>
          <form onSubmit={handleRequest} className="space-y-3">
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Select Staff Member</label>
              <select className="input mt-1 w-full" value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.department})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Leave Type</label>
              <select className="input mt-1 w-full" value={type}
                onChange={(e) => setType(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Start Time</label>
              <input className="input mt-1 w-full text-xs" type="datetime-local" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">End Time</label>
              <input className="input mt-1 w-full text-xs" type="datetime-local" value={endDate}
                onChange={(e) => setEndDate(e.target.value)} required />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Reason / Note</label>
              <textarea className="input mt-1 w-full text-xs min-h-[60px]" value={reason}
                onChange={(e) => setReason(e.target.value)} placeholder="E.g., Medical checkup, out of town" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition-colors disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Right Column: Leaves List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="section-title">Leave & Break Registry</h2>
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading leave logs…</div>
            ) : leaves.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No leave or break logs found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/40">
                    <tr>
                      {['Staff Member', 'Type', 'Period', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{l.user.name}</td>
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
                          {l.status === 'PENDING' && (
                            <>
                              <button onClick={() => handleAction(l.id, 'approve')} className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">Approve</button>
                              <button onClick={() => handleAction(l.id, 'reject')} className="text-xs text-rose-600 hover:text-rose-700 font-semibold">Reject</button>
                            </>
                          )}
                          {l.status === 'APPROVED' && (
                            <button onClick={() => handleAction(l.id, 'cancel')} className="text-xs text-slate-600 hover:text-slate-700 font-semibold">Cancel</button>
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
