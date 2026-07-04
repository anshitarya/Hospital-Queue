import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Clinic Queue — Live queue management for clinics',
    template: '%s · Clinic Queue',
  },
  description:
    'Give every patient a live token with minute-accurate ETA on their phone. Doctors and reception get focused dashboards. Multi-clinic ready.',
  keywords: ['hospital queue', 'clinic queue', 'token system', 'patient ETA', 'OPD queue'],
  authors: [{ name: 'Clinic Queue' }],
  openGraph: {
    title: 'Clinic Queue — Skip the waiting room',
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
