import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { type ToastMessage } from './Toast';

interface DoctorItem {
  id: string;
  name: string;
  department: string;
}

interface WorkflowStep {
  name: string;
  departmentId?: string;
  doctorId?: string;
}

export function WorkflowTab({ doctors, setToast, locationId }: { doctors: DoctorItem[]; setToast: (t: ToastMessage | null) => void; locationId?: string | null }) {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const url = locationId ? `/workflow/my?locationId=${locationId}` : '/workflow/my';
        const data = await api<{ steps: WorkflowStep[] }>(url);
        setSteps(data?.steps || []);
      } catch {
        setToast({ type: 'err', msg: 'Failed to load workflow configuration' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [setToast, locationId]);

  const addStep = () => {
    setSteps([...steps, { name: `Step ${steps.length + 1}`, doctorId: doctors[0]?.id || '' }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof WorkflowStep, val: string) => {
    setSteps(
      steps.map((s, i) => (i === index ? { ...s, [field]: val } : s))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = locationId ? `/workflow/my?locationId=${locationId}` : '/workflow/my';
      await api(url, {
        method: 'POST',
        body: { steps },
      });
      setToast({ type: 'ok', msg: 'Workflow saved successfully' });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to save workflow' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Multi-Step Workflow Routing</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Route customers through sequential steps (e.g. Consultation → Lab → Billing).
          After <strong>Call next</strong>, mark the customer <strong>Done</strong> to send them to the next professional&apos;s queue automatically.
        </p>
      </div>

      <div className="card p-5 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading workflow layout…</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {steps.length === 0 ? (
              <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <p className="text-sm">No workflow routing configured. Customers will follow single-step routing.</p>
                <button type="button" onClick={addStep} className="mt-3 text-xs font-semibold text-teal-600 hover:text-teal-700">+ Add First Routing Step</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative border-l border-teal-500/30 dark:border-teal-500/20 ml-3.5 pl-6 space-y-5">
                  {steps.map((step, idx) => (
                    <div key={idx} className="relative flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/20 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      {/* Number badge on timeline */}
                      <span className="absolute -left-[35px] top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white text-[10px] font-bold ring-4 ring-white dark:ring-slate-900">
                        {idx + 1}
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Step Title</label>
                          <input className="input py-1 text-xs w-full mt-1" type="text" value={step.name}
                            onChange={(e) => updateStep(idx, 'name', e.target.value)} required />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Assign Professional</label>
                          <select className="input py-1 text-xs w-full mt-1" value={step.doctorId || ''}
                            onChange={(e) => updateStep(idx, 'doctorId', e.target.value)}>
                            {doctors.map((d) => (
                              <option key={d.id} value={d.id}>{d.name} ({d.department})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button type="button" onClick={() => removeStep(idx)}
                        className="text-xs text-rose-500 hover:text-rose-600 font-semibold mt-4 sm:mt-0 shrink-0">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addStep}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-xs font-semibold rounded-xl transition-colors">
                  + Add Next Routing Step
                </button>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button type="submit" disabled={saving || steps.length === 0}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition-colors disabled:opacity-50">
                {saving ? 'Saving changes…' : 'Save workflow routing'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
