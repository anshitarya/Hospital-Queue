import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Login · Turnos',
  description: 'Sign in with your mobile number to view your live queue position and token status.',
  alternates: {
    canonical: '/login/patient',
  },
};

export default function LoginPatientLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
