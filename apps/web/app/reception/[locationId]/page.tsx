'use client';

import { ReceptionDashboard } from '../reception-dashboard';

export default function LocationReceptionPage({ params }: { params: { locationId: string } }) {
  return <ReceptionDashboard locationIdFromParams={params.locationId} />;
}
