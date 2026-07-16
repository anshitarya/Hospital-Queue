'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
}

/** A single skeleton loading block */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Skeleton for a queue row */
export function QueueRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-1/4 rounded-md" />
      </div>
      <div className="space-y-2 text-right">
        <Skeleton className="h-3 w-16 rounded-md ml-auto" />
        <Skeleton className="h-3 w-12 rounded-md ml-auto" />
      </div>
    </div>
  );
}

/** Skeleton for a stat card */
export function StatCardSkeleton() {
  return (
    <div className="card p-5 space-y-2">
      <Skeleton className="h-3 w-16 rounded-md" />
      <Skeleton className="h-8 w-12 rounded-md" />
    </div>
  );
}

/** Skeleton for a doctor card */
export function DoctorCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/3 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
