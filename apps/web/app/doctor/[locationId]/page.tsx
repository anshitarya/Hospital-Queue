'use client';

import { DoctorDashboard } from '../doctor-dashboard';

export default function LocationDoctorPage({ params }: { params: { locationId: string } }) {
  return <DoctorDashboard locationIdFromParams={params.locationId} />;
}
