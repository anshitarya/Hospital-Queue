import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { type ToastMessage } from './Toast';
import { StatsGridSkeleton, TableSkeleton } from './Skeleton';

interface AnalyticsData {
  todayStats: { completed: number; waiting: number; cancelled: number; missed: number };
  averages: { avgWaitTime: number; avgServiceTime: number; maxWaitTime: number; maxServiceTime: number };
  currentQueueLength: number;
  peakHour: string;
  busyHours: string[];
  avgCustomersPerHour: number;
  avgCustomersPerProfessional: number;
  returningCustomers: number;
  newCustomers: number;
  noShowPercentage: number;
}

export function AnalyticsTab({ setToast, locationId }: { setToast: (t: ToastMessage | null) => void; locationId?: string | null }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const url = locationId ? `/analytics/dashboard?locationId=${locationId}` : '/analytics/dashboard';
        const res = await api<AnalyticsData>(url);
        setData(res);
      } catch {
        setToast({ type: 'err', msg: 'Failed to load analytics dashboard' });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [setToast, locationId]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <StatsGridSkeleton count={4} />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-rose-500 text-sm">No data loaded.</div>;
  }

  const {
    todayStats: stats,
    averages,
    peakHour,
    busyHours,
    avgCustomersPerHour,
    avgCustomersPerProfessional,
    returningCustomers,
    newCustomers,
    noShowPercentage,
  } = data;

  return (
    <div className="p-5 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Real-time Business Intelligence Console</h2>
        <p className="text-xs text-slate-400 mt-0.5 font-medium">Evaluate operations efficiency, wait times, and peak periods · All times in IST</p>
      </div>

      {/* Row 1: Operations Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricBox title="Avg Wait Time" value={`${averages.avgWaitTime} min`} subtitle={`Max Wait: ${averages.maxWaitTime} min · completed today`} color="teal" />
        <MetricBox title="Avg Service Time" value={`${averages.avgServiceTime} min`} subtitle={`Max Service: ${averages.maxServiceTime} min`} color="blue" />
        <MetricBox title="No-Show Rate" value={`${noShowPercentage}%`} subtitle={`${stats.missed} total no-shows`} color="amber" />
      </div>

      {/* Row 2: Charts and Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="card p-5 space-y-4 md:col-span-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Traffic Analysis</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Peak Traffic Hour</span>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{peakHour}</p>
              <span className="text-[10px] text-slate-500 mt-1 block">Hour with highest visitor join rate (IST)</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Busy Hours Window</span>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {busyHours.length > 0 ? (
                  busyHours.map((h, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 text-xs font-semibold">
                      {h}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-xs font-semibold">No data today</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase">Customers per Hour (Average)</span>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">{avgCustomersPerHour}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase">Customers per Professional (Average)</span>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">{avgCustomersPerProfessional}</p>
            </div>
          </div>
        </div>

        {/* New vs Returning Pie/Info */}
        <div className="card p-5 space-y-4 md:col-span-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Customer Retention</h3>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">New Customers</p>
                <p className="text-xs text-slate-400">First-time visitors today</p>
              </div>
              <span className="text-xl font-bold text-emerald-500">{newCustomers}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Returning Customers</p>
                <p className="text-xs text-slate-400">Repeated business</p>
              </div>
              <span className="text-xl font-bold text-blue-500">{returningCustomers}</span>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-center">
              <span className="text-xs text-slate-400">
                Retention Rate:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {returningCustomers + newCustomers > 0
                    ? Math.round((returningCustomers / (returningCustomers + newCustomers)) * 100)
                    : 0}
                  %
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  const styles: Record<string, { text: string; bg: string; icon: string }> = {
    teal: { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500', icon: 'border-teal-500' },
    blue: { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500', icon: 'border-blue-500' },
    amber: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', icon: 'border-amber-500' },
    green: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', icon: 'border-emerald-500' },
  };
  const s = styles[color] || styles.teal;
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${s.bg} opacity-70`} />
      <span className="text-xs text-slate-400 font-semibold uppercase">{title}</span>
      <p className={`text-2xl font-bold mt-1.5 ${s.text}`}>{value}</p>
      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">{subtitle}</span>
    </div>
  );
}
