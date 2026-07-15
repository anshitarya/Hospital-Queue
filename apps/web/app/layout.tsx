import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Turnos — Live queue management',
    template: '%s · Turnos',
  },
  description:
    'Give every customer a live token with minute-accurate ETA on their phone. Staff get focused dashboards. Multi-business ready.',
  keywords: ['queue management', 'token system', 'customer ETA', 'turnos'],
  authors: [{ name: 'Turnos' }],
  openGraph: {
    title: 'Turnos — Skip the wait',
    description: 'Live tokens with minute-accurate ETA. No app to install.',
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
