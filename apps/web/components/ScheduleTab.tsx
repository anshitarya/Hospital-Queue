import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { type ToastMessage } from './Toast';
import { TimePicker } from './TimePicker';
import { FormSkeleton } from './Skeleton';

interface DoctorItem {
  id: string;
  name: string;
  department: string;
}

export interface ScheduleRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isHoliday: boolean;
  maxCapacity?: number | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function defaultOffDay(day: number): ScheduleRow {
  return { dayOfWeek: day, startTime: '09:00', endTime: '17:00', isHoliday: true };
}

function defaultWorkingDay(day: number): ScheduleRow {
  return { dayOfWeek: day, startTime: '09:00', endTime: '18:00', isHoliday: false };
}

export function ScheduleTab({
  doctors,
  setToast,
  locationId,
}: {
  doctors: DoctorItem[];
  setToast: (t: ToastMessage | null) => void;
  locationId?: string | null;
}) {
  const [selectedDocId, setSelectedDocId] = useState(doctors[0]?.id || '');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedDocId || !locationId) return;
    async function load() {
      setLoading(true);
      try {
        const data = await api<ScheduleRow[]>(`/schedules/doctor/${selectedDocId}?locationId=${locationId}`);
        if (data.length === 0) {
          setSchedules(
            Array.from({ length: 7 }, (_, i) =>
              i === 0 ? defaultOffDay(i) : defaultWorkingDay(i),
            ),
          );
        } else {
          setSchedules(data);
        }
      } catch {
        setToast({ type: 'err', msg: 'Failed to load doctor schedules' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [selectedDocId, locationId, setToast]);

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleRow[]>();
    for (let d = 0; d < 7; d++) map.set(d, []);
    for (const s of schedules) {
      map.get(s.dayOfWeek)?.push(s);
    }
    for (let d = 0; d < 7; d++) {
      if (map.get(d)!.length === 0) map.set(d, [defaultOffDay(d)]);
    }
    return map;
  }, [schedules]);

  const updateShift = (day: number, index: number, field: keyof ScheduleRow, val: string | boolean) => {
    setSchedules((prev) => {
      const dayRows = prev.filter((s) => s.dayOfWeek === day);
      const other = prev.filter((s) => s.dayOfWeek !== day);
      const updated = dayRows.map((s, i) => (i === index ? { ...s, [field]: val } : s));
      return [...other, ...updated];
    });
  };

  const addShift = (day: number) => {
    setSchedules((prev) => {
      const dayRows = prev.filter((s) => s.dayOfWeek === day);
      const other = prev.filter((s) => s.dayOfWeek !== day);
      const base = dayRows.length ? dayRows[dayRows.length - 1] : defaultWorkingDay(day);
      const next: ScheduleRow = {
        dayOfWeek: day,
        startTime: '14:00',
        endTime: '18:00',
        isHoliday: false,
      };
      if (dayRows.every((r) => r.isHoliday)) {
        return [...other, { ...defaultWorkingDay(day), startTime: '09:00', endTime: '13:00' }, next];
      }
      return [...other, ...dayRows.map((r) => ({ ...r, isHoliday: false })), next];
    });
  };

  const removeShift = (day: number, index: number) => {
    setSchedules((prev) => {
      const dayRows = prev.filter((s) => s.dayOfWeek === day);
      const other = prev.filter((s) => s.dayOfWeek !== day);
      if (dayRows.length <= 1) {
        return [...other, defaultOffDay(day)];
      }
      return [...other, ...dayRows.filter((_, i) => i !== index)];
    });
  };

  const setDayOff = (day: number, off: boolean) => {
    if (off) {
      setSchedules((prev) => [...prev.filter((s) => s.dayOfWeek !== day), defaultOffDay(day)]);
    } else {
      setSchedules((prev) => [...prev.filter((s) => s.dayOfWeek !== day), defaultWorkingDay(day)]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !locationId) return;
    setSaving(true);
    try {
      const flat = Array.from(byDay.entries()).flatMap(([, rows]) => rows);
      const cleanShifts = flat.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        isHoliday: r.isHoliday,
        maxCapacity: r.maxCapacity ?? null,
      }));
      await api(`/schedules/doctor/${selectedDocId}?locationId=${locationId}`, {
        method: 'POST',
        body: { shifts: cleanShifts },
      });
      setSchedules(flat);
      setToast({ type: 'ok', msg: 'Schedules updated successfully' });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update schedule' });
    } finally {
      setSaving(false);
    }
  };

  if (!locationId) {
    return <div className="py-12 text-center text-slate-400 text-sm">Select a branch to edit schedules.</div>;
  }

  if (doctors.length === 0) {
    return <div className="py-12 text-center text-slate-400 text-sm">Please add staff members first.</div>;
  }

  return (
    <div className="p-5 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Professional Working Schedules</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          All business professionals appear here. Hours are saved per branch (IST). Overlapping slots across branches for the same person are blocked.
        </p>
      </div>

      <div className="card p-6 space-y-4 backdrop-blur-2xl bg-slate-900/40 border border-white/10 rounded-3xl shadow-card">
        <div>
          <label className="label text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Professional</label>
          <select className="input mt-1 w-full max-w-md" value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id} className="bg-slate-900 text-white">{d.name} ({d.department})</option>
            ))}
          </select>
        </div>

        {loading ? (
          <FormSkeleton rows={7} />
        ) : (
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {DAYS.map((dayName, day) => {
                const rows = byDay.get(day) ?? [defaultOffDay(day)];
                const isOff = rows.every((r) => r.isHoliday);
                return (
                  <div key={day} className="py-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm w-28">{dayName}</span>
                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded accent-teal-600"
                          checked={!isOff} onChange={(e) => setDayOff(day, !e.target.checked)} />
                        Working day
                      </label>
                      {!isOff && (
                        <button type="button" onClick={() => addShift(day)}
                          className="text-xs text-teal-600 hover:text-teal-700 font-semibold ml-auto">
                          + Add shift
                        </button>
                      )}
                    </div>
                    {isOff ? (
                      <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded w-fit">Off / holiday</p>
                    ) : (
                      rows.map((s, idx) => (
                        <div key={`${day}-${idx}`} className="flex flex-wrap items-center gap-2 pl-0 sm:pl-28">
                          <span className="text-[10px] text-slate-400 uppercase w-14">Shift {idx + 1}</span>
                          <TimePicker value={s.startTime} onChange={(v) => updateShift(day, idx, 'startTime', v)} />
                          <span className="text-slate-400 text-xs">to</span>
                          <TimePicker value={s.endTime} onChange={(v) => updateShift(day, idx, 'endTime', v)} />
                          <span className="text-[10px] text-slate-400">IST</span>
                          <div className="flex items-center gap-1.5 ml-2">
                            <span className="text-[11px] font-medium text-slate-500">Max limit:</span>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              placeholder="No limit"
                              value={s.maxCapacity ?? ''}
                              onChange={(e) =>
                                updateShift(
                                  day,
                                  idx,
                                  'maxCapacity',
                                  e.target.value ? parseInt(e.target.value, 10) : (null as any),
                                )
                              }
                              className="w-20 px-2 py-1 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                          </div>
                          {rows.length > 1 && (
                            <button type="button" onClick={() => removeShift(day, idx)}
                              className="text-xs text-rose-500 hover:text-rose-600 ml-1">Remove</button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
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

/** Compact editor for the add-professional form (optional). */
export function ScheduleEditor({
  shifts,
  onChange,
}: {
  shifts: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
}) {
  const toggleDefault = (on: boolean) => {
    if (on) {
      onChange(
        Array.from({ length: 7 }, (_, i) =>
          i === 0 ? defaultOffDay(i) : i === 6
            ? { dayOfWeek: 6, startTime: '09:00', endTime: '14:00', isHoliday: false }
            : i === 1
              ? { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', isHoliday: false }
              : defaultWorkingDay(i),
        ).concat([
          { dayOfWeek: 1, startTime: '14:00', endTime: '18:00', isHoliday: false },
        ]),
      );
    } else {
      onChange([]);
    }
  };

  return (
    <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
        <input type="checkbox" className="rounded accent-teal-600"
          checked={shifts.length > 0}
          onChange={(e) => toggleDefault(e.target.checked)} />
        Set default working schedule (Mon–Sat, dual shift Monday)
      </label>
      {shifts.length > 0 && (
        <p className="text-[11px] text-slate-400">
          You can fine-tune shifts after creation under Schedules. Times are IST.
        </p>
      )}
    </div>
  );
}
