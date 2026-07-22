'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '@/lib/useRequireRole';
import { api } from '@/lib/api';
import { ReceptionPageSkeleton } from '@/components/Skeleton';

const LOCATION_STORAGE_KEY = 'turnos_reception_location';

export default function ReceptionRedirect() {
  const { ready, user } = useRequireRole(['RECEPTIONIST', 'CLINIC_ADMIN', 'MANAGER', 'ADMIN']);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;

    // Use the correct locations endpoint
    api<{ id: string; name: string }[]>('/clinics/my/locations')
      .then((locs) => {
        if (!locs || locs.length === 0) {
          setError('No locations found for your clinic. Please contact your administrator.');
          return;
        }
        const saved = user.clinicId ? localStorage.getItem(`${LOCATION_STORAGE_KEY}:${user.clinicId}`) : null;
        const valid = saved && locs.some((l) => l.id === saved) ? saved : locs[0].id;
        router.replace(`/reception/${valid}`);
      })
      .catch((err) => {
        setError('Failed to load clinic locations. Please refresh the page.');
        console.error('Location fetch failed:', err);
      });
  }, [ready, user, router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-slate-600 dark:text-slate-400 text-sm">{error}</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return <ReceptionPageSkeleton />;
}
