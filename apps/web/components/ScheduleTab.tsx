import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { type ToastMessage } from './Toast';

interface DoctorItem {
  id: string;
  name: string;
  department: string;
}

interface ScheduleRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isHoliday: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ScheduleTab({ doctors, setToast }: { doctors: DoctorItem[]; setToast: (t: ToastMessage | null) => void }) {
  const [selectedDocId, setSelectedDocId] = useState(doctors[0]?.id || '');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedDocId) return;
    async function load() {
      setLoading(true);
      try {
        const data = await api<ScheduleRow[]>(`/schedules/doctor/${selectedDocId}`);
        // Ensure all days 0-6 are present in the list
        const daysMap = new Map(data.map((s) => [s.dayOfWeek, s]));
        const fullList: ScheduleRow[] = Array.from({ length: 7 }, (_, i) => {
          return daysMap.get(i) || { dayOfWeek: i, startTime: '09:00', endTime: '17:00', isHoliday: true };
        });
        setSchedules(fullList);
      } catch {
        setToast({ type: 'err', msg: 'Failed to load doctor schedules' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [selectedDocId, setToast]);

  const handleUpdate = (day: number, field: keyof ScheduleRow, val: any) => {
    setSchedules((prev) =>
      prev.map((s) => (s.dayOfWeek === day ? { ...s, [field]: val } : s))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;
    setSaving(true);
    try {
      await api(`/schedules/doctor/${selectedDocId}`, {
        method: 'POST',
        body: { shifts: schedules },
      });
      setToast({ type: 'ok', msg: 'Schedules updated successfully' });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update schedule' });
    } finally {
      setSaving(false);
    }
  };

  if (doctors.length === 0) {
    return <div className="py-12 text-center text-slate-400 text-sm">Please add staff members first.</div>;
  }

  return (
    <div className="p-5 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Professional Working Schedules</h2>
        <p className="text-xs text-slate-400 mt-0.5">Define multi-shift and weekly schedule configurations for each professional</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="label text-xs font-semibold text-slate-500 uppercase">Select Professional</label>
          <select className="input mt-1 w-full max-w-md" value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.department})</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading schedule templates…</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {schedules.map((s) => (
                <div key={s.dayOfWeek} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="w-32">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{DAYS[s.dayOfWeek]}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                        checked={!s.isHoliday} onChange={(e) => handleUpdate(s.dayOfWeek, 'isHoliday', !e.target.checked)} />
                      Working Day
                    </label>

                    {!s.isHoliday && (
                      <div className="flex items-center gap-2">
                        <input className="input py-1 text-xs w-28" type="text" placeholder="HH:MM" value={s.startTime}
                          onChange={(e) => handleUpdate(s.dayOfWeek, 'startTime', e.target.value)} required />
                        <span className="text-slate-400 text-xs">to</span>
                        <input className="input py-1 text-xs w-28" type="text" placeholder="HH:MM" value={s.endTime}
                          onChange={(e) => handleUpdate(s.dayOfWeek, 'endTime', e.target.value)} required />
                      </div>
                    )}
                    {s.isHoliday && (
                      <span className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded">Holiday / Off-time</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3">
              <button type="submit" disabled={saving}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition-colors disabled:opacity-50">
                {saving ? 'Saving changes…' : 'Save working schedule'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
