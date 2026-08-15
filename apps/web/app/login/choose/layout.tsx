import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Choose Portal · Turnos',
  description: 'Select your Turnos portal: patient login or receptionist/doctor staff dashboard.',
  alternates: {
    canonical: '/login/choose',
  },
};

export default function LoginChooseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
