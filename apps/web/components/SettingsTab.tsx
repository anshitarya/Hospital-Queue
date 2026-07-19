import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { BUSINESS_TYPE_OPTIONS } from '@/lib/labels';
import { type ToastMessage } from './Toast';
import { QRCodePanel } from './QRCodePanel';
import { Spinner } from './PageLoader';

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
  maxSelfBookingNoShowsPerMonth: number;
  walkinJoinRule: string;
  walkinJoinRuleParam: number;
  followupJoinRule: string;
  followupJoinRuleParam: number;
  emergencyJoinRule: string;
  vipJoinRule: string;
  autoQueueAssignment: boolean;
  allowOnlineBooking: boolean;
}

/** Fields allowed by PATCH /business-settings/my (UpdateSettingsDto). */
const EDITABLE_FIELDS = [
  'businessType',
  'queueMode',
  'appointmentMode',
  'tokenPrefix',
  'queueNumberFormat',
  'appointmentInterval',
  'maxCustomersPerSlot',
  'bufferTime',
  'gracePeriod',
  'noShowTimeout',
  'maxSelfBookingNoShowsPerMonth',
  'walkinJoinRule',
  'walkinJoinRuleParam',
  'followupJoinRule',
  'followupJoinRuleParam',
  'emergencyJoinRule',
  'vipJoinRule',
  'autoQueueAssignment',
  'allowOnlineBooking',
] as const;

function parseSettings(raw: Record<string, unknown>): SettingsData {
  return {
    businessType: String(raw.businessType ?? 'CLINIC'),
    queueMode: String(raw.queueMode ?? 'LIVE_QUEUE'),
    appointmentMode: String(raw.appointmentMode ?? 'HYBRID'),
    tokenPrefix: String(raw.tokenPrefix ?? 'TK'),
    queueNumberFormat: String(raw.queueNumberFormat ?? 'NUMBER'),
    appointmentInterval: Number(raw.appointmentInterval ?? 15),
    maxCustomersPerSlot: Number(raw.maxCustomersPerSlot ?? 1),
    bufferTime: Number(raw.bufferTime ?? 0),
    gracePeriod: Number(raw.gracePeriod ?? 4),
    noShowTimeout: Number(raw.noShowTimeout ?? 15),
    maxSelfBookingNoShowsPerMonth: Number(raw.maxSelfBookingNoShowsPerMonth ?? 3),
    walkinJoinRule: String(raw.walkinJoinRule ?? 'END_OF_QUEUE'),
    walkinJoinRuleParam: Number(raw.walkinJoinRuleParam ?? 0),
    followupJoinRule: String(raw.followupJoinRule ?? 'END_OF_QUEUE'),
    followupJoinRuleParam: Number(raw.followupJoinRuleParam ?? 0),
    emergencyJoinRule: String(raw.emergencyJoinRule ?? 'PRIORITY_QUEUE'),
    vipJoinRule: String(raw.vipJoinRule ?? 'PRIORITY_QUEUE'),
    autoQueueAssignment: Boolean(raw.autoQueueAssignment ?? false),
    allowOnlineBooking: Boolean(raw.allowOnlineBooking ?? false),
  };
}

function settingsPayload(settings: SettingsData): Record<string, unknown> {
  return Object.fromEntries(EDITABLE_FIELDS.map((key) => [key, settings[key]]));
}

export function SettingsTab({
  setToast,
  locationId,
  onSettingsSaved,
}: {
  setToast: (t: ToastMessage | null) => void;
  locationId?: string | null;
  onSettingsSaved?: () => void;
}) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState<Array<{ id: string; user: { name: string }; specialization: string | null; clinic: { name: string } | null }>>([]);
  const [qrDoctor, setQrDoctor] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const qs = locationId ? `?locationId=${locationId}` : '';
        const docQs = locationId ? `?locationId=${locationId}` : '';
        const [data, docs] = await Promise.all([
          api<Record<string, unknown>>(`/business-settings/my${qs}`),
          api<Array<{ id: string; user: { name: string }; specialization: string | null; clinic: { name: string } | null }>>(`/clinics/my/doctors${docQs}`).catch(() => []),
        ]);
        setSettings(parseSettings(data));
        setDoctors(docs);
        if (docs.length > 0) {
          setQrDoctor(docs[0].id);
          setClinicName(docs[0].clinic?.name ?? '');
        }
      } catch {
        setToast({ type: 'err', msg: 'Failed to load business settings' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [setToast, locationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      await api(`/business-settings/my${qs}`, {
        method: 'PATCH',
        body: settingsPayload(settings),
      });
      setToast({ type: 'ok', msg: 'Settings updated successfully' });
      onSettingsSaved?.();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to update settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-slate-400">
        <Spinner className="h-8 w-8" />
        <span className="text-xs font-medium">Loading settings…</span>
      </div>
    );
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
                {BUSINESS_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
                <input className="input mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={5} max={120} value={settings.appointmentInterval}
                  onChange={(e) => setSettings({ ...settings, appointmentInterval: parseInt(e.target.value) || 15 })} />
              </div>
              {settings.queueMode === 'CAPACITY_TIME_SLOT' && (
                <div>
                  <label className="label text-xs font-semibold text-slate-500 uppercase">Max Customers per Slot</label>
                  <input className="input mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={1} max={50} value={settings.maxCustomersPerSlot}
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
                <input className="input mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} max={20} value={settings.walkinJoinRuleParam}
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
                <input className="input mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} max={20} value={settings.followupJoinRuleParam}
                  onChange={(e) => setSettings({ ...settings, followupJoinRuleParam: parseInt(e.target.value) || 0 })} />
              </div>
            )}
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

        {/* ── Self-Booking & QR Code ── */}
        <div className="card p-5 space-y-5 border-2 border-brand-100 dark:border-brand-900/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                🔗 Self-Booking &amp; QR Code
                <span className="pill-sm bg-brand-100 text-brand-700 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800 px-2 py-0.5">New</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-lg">
                When enabled, patients can discover your business in the customer portal and join queues directly. Applies to the selected branch. Generate a QR code for each professional to print or share.
              </p>
            </div>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 accent-teal-600 rounded cursor-pointer"
                checked={settings.allowOnlineBooking}
                onChange={(e) => setSettings({ ...settings, allowOnlineBooking: e.target.checked })}
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {settings.allowOnlineBooking ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          {settings.allowOnlineBooking && doctors.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">No-show limit (self-booking)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    After this many self-booking no-shows in a calendar month, the patient cannot book that professional again until next month. Set 0 for unlimited.
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={99}
                  className="input w-20 !py-1.5 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={settings.maxSelfBookingNoShowsPerMonth}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxSelfBookingNoShowsPerMonth: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
              {/* Doctor selector */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">QR for</label>
                <select
                  className="input flex-1 !py-1.5 text-xs"
                  value={qrDoctor ?? ''}
                  onChange={(e) => {
                    const doc = doctors.find((d) => d.id === e.target.value);
                    setQrDoctor(e.target.value);
                    setClinicName(doc?.clinic?.name ?? '');
                  }}
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.user.name}{d.specialization ? ` (${d.specialization})` : ''}</option>
                  ))}
                </select>
              </div>
              {qrDoctor && (
                <QRCodePanel
                  doctorId={qrDoctor}
                  doctorName={doctors.find((d) => d.id === qrDoctor)?.user.name ?? ''}
                  clinicName={clinicName}
                />
              )}
            </div>
          )}

          {settings.allowOnlineBooking && doctors.length === 0 && (
            <p className="text-xs text-slate-400 italic">Add professionals to your clinic to generate QR codes.</p>
          )}
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
