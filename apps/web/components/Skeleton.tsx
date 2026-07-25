'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** A single skeleton loading block */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** Skeleton for a queue row or list item */
export function QueueRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/60">
      <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton className="h-4 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-1/4 rounded-md" />
      </div>
      <div className="space-y-1.5 text-right shrink-0">
        <Skeleton className="h-3 w-16 rounded-md ml-auto" />
        <Skeleton className="h-4 w-12 rounded-full ml-auto" />
      </div>
    </div>
  );
}

export function QueueListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
      {Array.from({ length: rows }).map((_, i) => (
        <QueueRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a summary/stats card */
export function StatCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16 rounded-lg" />
      <Skeleton className="h-2.5 w-3/4 rounded-md" />
    </div>
  );
}

export function StatsGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-${count} gap-3 md:gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a doctor directory card */
export function DoctorCardSkeleton() {
  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <Skeleton className="h-4 w-1/2 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
      </div>
    </div>
  );
}

export function DoctorGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <DoctorCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for table views (e.g., reception patients, appointments) */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      {/* Table Header */}
      <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-1/5 rounded-md" />
        ))}
      </div>
      {/* Table Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-5 py-4 flex items-center justify-between gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-1/4' : 'w-1/6'} rounded-md`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for settings/configuration forms */
export function FormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card p-6 space-y-6">
      <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-4">
        <Skeleton className="h-5 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-1/4 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
        <Skeleton className="h-9 w-20 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for modal dialogs */
export function ModalSkeleton() {
  return (
    <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-scale-up">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-1/2 rounded-md" />
          <Skeleton className="h-3 w-3/4 rounded-md" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
      <div className="pt-2 flex justify-end gap-3">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

/** ── Page-Level Layout-Matched Skeletons ─────────────────────────────────────── */

export function PatientPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6 animate-fade-in">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
        <Skeleton className="h-4 w-44 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-xl" />
        </div>
      </div>

      {/* ── Summary Stats Grid (3 cards) ── */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="card p-3 md:p-4 space-y-2">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-8 w-12 rounded-lg" />
        </div>
        <div className="card p-3 md:p-4 space-y-2">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-8 w-12 rounded-lg" />
        </div>
        <div className="card p-3 md:p-4 space-y-2">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-8 w-12 rounded-lg" />
        </div>
      </div>

      {/* ── Nearest Upcoming Highlight Card Skeleton ── */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48 rounded-md" />
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1 text-right">
                <Skeleton className="h-3.5 w-20 rounded-md ml-auto" />
                <Skeleton className="h-3 w-14 rounded-md ml-auto" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs & Search Bar Skeletons ── */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row justify-between gap-3">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-auto">
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full md:w-60 rounded-xl" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      {/* ── Business Doctor Cards List Skeleton ── */}
      <DoctorGridSkeleton count={4} />
    </div>
  );
}

export function ReceptionPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <StatsGridSkeleton count={4} />
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}

export function DoctorPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44 rounded-md" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <StatCardSkeleton />
          <TableSkeleton rows={4} cols={4} />
        </div>
        <div className="space-y-4">
          <FormSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <Skeleton className="h-7 w-52 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <StatsGridSkeleton count={4} />
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6 animate-fade-in">
      <div className="card p-6 flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-1/3 rounded-md" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
        </div>
      </div>
      <FormSkeleton rows={4} />
    </div>
  );
}

export function JoinPageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        <DoctorCardSkeleton />
        <FormSkeleton rows={3} />
      </div>
    </div>
  );
}
