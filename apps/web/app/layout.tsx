import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://turnos.in'),
  title: {
    default: 'Turnos — Live Queue Management & Virtual Token System',
    template: '%s · Turnos',
  },
  description:
    'Give every customer a live token with a minute-accurate ETA on their phone. Staff get focused dashboards. Multi-business ready. Zero app download required.',
  keywords: ['queue management', 'token system', 'customer ETA', 'turnos', 'waiting room queue', 'live queue management system'],
  authors: [{ name: 'Turnos' }],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Turnos — Live Queue Management & Virtual Token System',
    description:
      'Give every customer a live token with a minute-accurate ETA on their phone. Staff get focused dashboards. Multi-business ready.',
    url: 'https://turnos.in',
    siteName: 'Turnos',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/logo-icon.png',
        width: 512,
        height: 512,
        alt: 'Turnos Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Turnos — Live Queue Management & Virtual Token System',
    description:
      'Give every customer a live token with a minute-accurate ETA on their phone. Staff get focused dashboards.',
    images: ['/logo-icon.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/logo-icon.png',
    apple: '/logo-icon.png',
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
