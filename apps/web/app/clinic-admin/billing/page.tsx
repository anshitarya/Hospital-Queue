import { redirect } from 'next/navigation';

export default function ClinicAdminBillingPage() {
  redirect('/reception?tab=billing');
}
