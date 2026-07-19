'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getLabels, type BusinessType } from '@/lib/labels';
import { Toast, type ToastMessage } from '@/components/Toast';

interface AssignmentDoctor {
  id: string;
  name: string;
  department: string;
}

interface AssignmentReceptionist {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  doctorIds: string[];
}

interface AssignmentsResponse {
  receptionists: AssignmentReceptionist[];
  doctors: AssignmentDoctor[];
}

export function ReceptionistAssignmentsTab({
  businessType,
  setToast,
  locationId,
}: {
  businessType?: BusinessType | string | null;
  setToast: (t: ToastMessage | null) => void;
  locationId?: string | null;
}) {
  const L = getLabels(businessType);
  const [data, setData] = useState<AssignmentsResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localToast, setLocalToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = locationId ? `/clinics/my/receptionist-assignments?locationId=${locationId}` : '/clinics/my/receptionist-assignments';
      const res = await api<AssignmentsResponse>(url);
      setData(res);
      const next: Record<string, Set<string>> = {};
      for (const r of res.receptionists) {
        next[r.id] = new Set(r.doctorIds);
      }
      setDraft(next);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load assignments' });
    } finally {
      setLoading(false);
    }
  }, [setToast, locationId]);

  useEffect(() => {
    void load();
  }, [load, locationId]);

  function toggle(receptionistId: string, doctorId: string) {
    setDraft((prev) => {
      const copy = { ...prev };
      const set = new Set(copy[receptionistId] ?? []);
      if (set.has(doctorId)) set.delete(doctorId);
      else set.add(doctorId);
      copy[receptionistId] = set;
      return copy;
    });
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const assignments: Record<string, string[]> = {};
      for (const r of data.receptionists) {
        assignments[r.id] = [...(draft[r.id] ?? [])];
      }
      const url = locationId ? `/clinics/my/receptionist-assignments?locationId=${locationId}` : '/clinics/my/receptionist-assignments';
      const updated = await api<AssignmentsResponse>(url, {
        method: 'PUT',
        body: { assignments },
      });
      setData(updated);
      const next: Record<string, Set<string>> = {};
      for (const r of updated.receptionists) {
        next[r.id] = new Set(r.doctorIds);
      }
      setDraft(next);
      setLocalToast({ type: 'ok', msg: 'Receptionist assignments saved' });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to save assignments' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-sm text-slate-400">Loading assignments…</div>
    );
  }

  if (!data) return null;

  return (
    <>
      {localToast && <Toast message={localToast} onDismiss={() => setLocalToast(null)} />}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="section-title">Receptionist assignments</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Match each {L.staff.toLowerCase()} to the {L.providerPlural.toLowerCase()} they manage at this branch.
              Only {L.providerPlural.toLowerCase()} assigned to this branch are listed.
              A {L.staff.toLowerCase()} with no doctors ticked cannot see or manage any queue at this branch.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary shrink-0"
            disabled={saving || data.receptionists.length === 0}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save assignments'}
          </button>
        </div>

        {data.receptionists.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No receptionists yet. Add reception staff first, then assign them here.
          </p>
        ) : data.doctors.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No {L.providerPlural.toLowerCase()} yet. Add professionals before creating assignments.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-2 font-medium text-slate-500 text-xs uppercase tracking-wide sticky left-0 bg-white dark:bg-slate-900 z-10">
                    Receptionist
                  </th>
                  {data.doctors.map((d) => (
                    <th
                      key={d.id}
                      className="text-center py-2 px-2 font-medium text-slate-500 text-xs min-w-[88px]"
                      title={d.department}
                    >
                      <span className="block truncate max-w-[88px]">{d.name.split(' ')[0]}</span>
                      <span className="block text-[10px] font-normal text-slate-400 truncate max-w-[88px]">{d.department}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.receptionists.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-2 sticky left-0 bg-white dark:bg-slate-900 z-10">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                        {r.email ?? r.phone ?? '—'}
                      </p>
                    </td>
                    {data.doctors.map((d) => {
                      const checked = draft[r.id]?.has(d.id) ?? false;
                      return (
                        <td key={d.id} className="py-3 px-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={checked}
                            aria-label={`Assign ${r.name} to ${d.name}`}
                            onChange={() => toggle(r.id, d.id)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
