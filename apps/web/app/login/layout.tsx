import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff Login · Turnos',
  description: 'Sign in to your Turnos staff portal to manage live queues and prescriptions.',
  alternates: {
    canonical: '/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
