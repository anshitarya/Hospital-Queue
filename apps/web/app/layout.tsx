import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Hospital Queue — Live queue management for clinics',
    template: '%s · Hospital Queue',
  },
  description:
    'Give every patient a live token with minute-accurate ETA on their phone. Doctors and reception get focused dashboards. Multi-clinic ready.',
  keywords: ['hospital queue', 'clinic queue', 'token system', 'patient ETA', 'OPD queue'],
  authors: [{ name: 'Hospital Queue' }],
  openGraph: {
    title: 'Hospital Queue — Skip the waiting room',
    description: 'Live tokens with minute-accurate ETA. No app for patients to install.',
    type: 'website',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
