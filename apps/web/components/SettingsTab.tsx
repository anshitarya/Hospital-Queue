import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { type ToastMessage } from './Toast';

interface SettingsData {
  businessType: string;
  queueMode: string;
  appointmentMode: string;
  tokenPrefix: string;
  queueNumberFormat: string;
  appointmentInterval: number;
  maxCustomersPerSlot: number;
  bufferTime: number;
  gracePeriod: number;
  noShowTimeout: number;
  walkinJoinRule: string;
  walkinJoinRuleParam: number;
  followupJoinRule: string;
  followupJoinRuleParam: number;
  emergencyJoinRule: string;
  vipJoinRule: string;
  autoQueueAssignment: boolean;
}

export function SettingsTab({ setToast }: { setToast: (t: ToastMessage | null) => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api<SettingsData>('/business-settings/my');
        setSettings(data);
      } catch {
        setToast({ type: 'err', msg: 'Failed to load business settings' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [setToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await api('/business-settings/my', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setToast({ type: 'ok', msg: 'Settings updated successfully' });
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-400 text-sm">Loading settings…</div>;
  }

  if (!settings) {
    return <div className="py-12 text-center text-rose-500 text-sm">No settings loaded.</div>;
  }

  return (
    <div className="p-5 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Business Configuration Engine</h2>
          <p className="text-xs text-slate-400 mt-0.5">Control queue routing, modes, and behavior dynamically</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode Settings */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Queue & Appointment Modes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Business Type</label>
              <select className="input mt-1 w-full" value={settings.businessType}
                onChange={(e) => setSettings({ ...settings, businessType: e.target.value })}>
                {['CLINIC', 'HOSPITAL', 'SALON', 'SPA', 'CAFE', 'RESTAURANT', 'BANK', 'GOVERNMENT', 'SERVICE_CENTER'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Queue Mode</label>
              <select className="input mt-1 w-full" value={settings.queueMode}
                onChange={(e) => setSettings({ ...settings, queueMode: e.target.value })}>
                <option value="LIVE_QUEUE">Live Queue (FIFO)</option>
                <option value="TIME_SLOT">Strict Time Slot</option>
                <option value="CAPACITY_TIME_SLOT">Capacity Time Slot (Multiple/slot)</option>
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Appointment Mode</label>
              <select className="input mt-1 w-full" value={settings.appointmentMode}
                onChange={(e) => setSettings({ ...settings, appointmentMode: e.target.value })}>
                <option value="WALKIN_ONLY">Walk-in Only</option>
                <option value="APPOINTMENT_ONLY">Appointment Only</option>
                <option value="HYBRID">Hybrid (Walk-in & Online)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Slot Config (Visible only in Time Slot modes) */}
        {(settings.queueMode === 'TIME_SLOT' || settings.queueMode === 'CAPACITY_TIME_SLOT') && (
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Time Slot Parameters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs font-semibold text-slate-500 uppercase">Appointment Interval (Minutes)</label>
                <input className="input mt-1 w-full" type="number" min={5} max={120} value={settings.appointmentInterval}
                  onChange={(e) => setSettings({ ...settings, appointmentInterval: parseInt(e.target.value) || 15 })} />
              </div>
              {settings.queueMode === 'CAPACITY_TIME_SLOT' && (
                <div>
                  <label className="label text-xs font-semibold text-slate-500 uppercase">Max Customers per Slot</label>
                  <input className="input mt-1 w-full" type="number" min={1} max={50} value={settings.maxCustomersPerSlot}
                    onChange={(e) => setSettings({ ...settings, maxCustomersPerSlot: parseInt(e.target.value) || 1 })} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Token Formatting */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Token Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Token Prefix</label>
              <input className="input mt-1 w-full" type="text" maxLength={6} value={settings.tokenPrefix}
                onChange={(e) => setSettings({ ...settings, tokenPrefix: e.target.value })} />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Number Format</label>
              <select className="input mt-1 w-full" value={settings.queueNumberFormat}
                onChange={(e) => setSettings({ ...settings, queueNumberFormat: e.target.value })}>
                <option value="NUMBER">Sequential Numbers (1, 2, 3…)</option>
                <option value="CODE">Alphanumeric Code (A-Z, 3 digits)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Queue Routing Rules */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Queue Entry Routing Heuristics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Walk-in Join Rule</label>
              <select className="input mt-1 w-full" value={settings.walkinJoinRule}
                onChange={(e) => setSettings({ ...settings, walkinJoinRule: e.target.value })}>
                <option value="END_OF_QUEUE">End of Queue</option>
                <option value="AFTER_N_CUSTOMERS">After N Customers</option>
                <option value="PRIORITY_QUEUE">Top Priority Queue</option>
              </select>
            </div>
            {settings.walkinJoinRule === 'AFTER_N_CUSTOMERS' && (
              <div>
                <label className="label text-xs font-semibold text-slate-500 uppercase">Insert after N Waiting Patients</label>
                <input className="input mt-1 w-full" type="number" min={0} max={20} value={settings.walkinJoinRuleParam}
                  onChange={(e) => setSettings({ ...settings, walkinJoinRuleParam: parseInt(e.target.value) || 0 })} />
              </div>
            )}
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Follow-up Join Rule</label>
              <select className="input mt-1 w-full" value={settings.followupJoinRule}
                onChange={(e) => setSettings({ ...settings, followupJoinRule: e.target.value })}>
                <option value="END_OF_QUEUE">End of Queue</option>
                <option value="AFTER_N_CUSTOMERS">After N Customers</option>
                <option value="IMMEDIATE">Immediate Next</option>
              </select>
            </div>
            {settings.followupJoinRule === 'AFTER_N_CUSTOMERS' && (
              <div>
                <label className="label text-xs font-semibold text-slate-500 uppercase">Insert after N Waiting Patients</label>
                <input className="input mt-1 w-full" type="number" min={0} max={20} value={settings.followupJoinRuleParam}
                  onChange={(e) => setSettings({ ...settings, followupJoinRuleParam: parseInt(e.target.value) || 0 })} />
              </div>
            )}
          </div>
        </div>

        {/* Timing parameters */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Timeout & Buffer Parameters</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Buffer Time (Minutes)</label>
              <input className="input mt-1 w-full" type="number" min={0} max={60} value={settings.bufferTime}
                onChange={(e) => setSettings({ ...settings, bufferTime: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">Rejoin Grace Period (Minutes)</label>
              <input className="input mt-1 w-full" type="number" min={1} max={60} value={settings.gracePeriod}
                onChange={(e) => setSettings({ ...settings, gracePeriod: parseInt(e.target.value) || 4 })} />
            </div>
            <div>
              <label className="label text-xs font-semibold text-slate-500 uppercase">No-show Auto-timeout (Minutes)</label>
              <input className="input mt-1 w-full" type="number" min={1} max={180} value={settings.noShowTimeout}
                onChange={(e) => setSettings({ ...settings, noShowTimeout: parseInt(e.target.value) || 15 })} />
            </div>
          </div>
        </div>

        {/* Safety toggles */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Tenant & Staff Fallback Settings</h3>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auto Queue Assignment</p>
              <p className="text-xs text-slate-400 mt-0.5">Automatically transfer queues to fallback staff if a professional goes on leave</p>
            </div>
            <input type="checkbox" className="w-5 h-5 accent-teal-600 rounded cursor-pointer" checked={settings.autoQueueAssignment}
              onChange={(e) => setSettings({ ...settings, autoQueueAssignment: e.target.checked })} />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition-colors disabled:opacity-50">
            {saving ? 'Saving changes…' : 'Save configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
