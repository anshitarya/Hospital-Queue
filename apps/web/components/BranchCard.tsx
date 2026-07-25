'use client';

import { getDistance } from './BusinessCard';

interface BranchCardProps {
  branch: any;
  userLocation: { latitude: number; longitude: number } | null;
  onSelect: () => void;
}

export function BranchCard({ branch, userLocation, onSelect }: BranchCardProps) {
  let distanceStr = '— km';

  if (userLocation && branch.latitude !== null && branch.longitude !== null && branch.latitude !== undefined && branch.longitude !== undefined) {
    const dist = getDistance(
      userLocation.latitude,
      userLocation.longitude,
      branch.latitude,
      branch.longitude
    );
    distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)} km`;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md transition-all duration-300">
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 tracking-tight">
            {branch.name}
          </h4>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
            <span>•</span>
            <span>📍 {distanceStr} away</span>
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-xl">
          {branch.address}
        </p>

        <div className="flex flex-wrap gap-4 pt-1 text-[11px] font-semibold text-slate-455 dark:text-slate-500">
          <span className="flex items-center gap-1">
            👥 Professionals: <strong className="text-slate-700 dark:text-slate-300">{branch.doctors?.length || 0}</strong>
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="w-full sm:w-auto btn-primary !py-2 !px-5 text-xs font-bold shadow-sm"
      >
        Select Branch
      </button>
    </div>
  );
}
