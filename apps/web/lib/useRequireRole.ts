'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';
import type { Role } from './api';

/**
 * Gate a page to a set of allowed roles.
 *
 * - Returns `{ user, ready }` where `ready` is true only AFTER hydration completes.
 *   Pages should render a loading state until `ready === true` so the route guard
 *   never reacts to a half-hydrated `user: null` state.
 * - Redirects unauthenticated users to `/login` (or `/login/patient` if the page
 *   is patient-only).
 * - Redirects authenticated users with the wrong role to their home page.
 */
export function useRequireRole(allowed: Role[]) {
  const router = useRouter();
  const { user, loaded, hydrate } = useAuth();

  // Trigger hydration once on mount. Safe to call repeatedly — hydrate is a no-op
  // once loaded is true.
  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  useEffect(() => {
    if (!loaded) return;

    if (!user) {
      // Patient-only pages send to the patient login; everything else uses staff login.
      router.replace(allowed.length === 1 && allowed[0] === 'PATIENT' ? '/login/patient' : '/login');
      return;
    }

    if (!allowed.includes(user.role)) {
      // Redirect to the user's natural home.
      const home =
        user.role === 'PATIENT' ? '/patient' :
        user.role === 'DOCTOR' ? '/doctor' :
        user.role === 'ADMIN' ? '/admin' :
        user.role === 'MANAGER' ? '/reception' :
        user.role === 'CLINIC_ADMIN' ? '/reception' :
        user.role === 'RECEPTIONIST' ? '/reception' :
        '/reception';
      router.replace(home);
    }
  }, [loaded, user, router, allowed]);

  return {
    user,
    ready: loaded && !!user && allowed.includes(user.role),
  };
}
