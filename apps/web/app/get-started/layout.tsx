import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started · Turnos',
  description: 'Create your clinic account on Turnos and start managing your virtual queue in minutes.',
  alternates: {
    canonical: '/get-started',
  },
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
