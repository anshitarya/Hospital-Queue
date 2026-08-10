import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import { Inter } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

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
  manifest: '/manifest.json',
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head />
      <body className="relative min-h-screen antialiased overflow-x-hidden w-full max-w-[100vw]">
        <PwaRegister />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {/* Ambient glow mesh — only visible in dark mode */}
          <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden dark:block hidden">
            <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-brand-500/10 blur-[120px]" />
            <div className="absolute top-1/3 -right-40 h-[650px] w-[650px] rounded-full bg-purple-600/10 blur-[140px]" />
            <div className="absolute -bottom-40 left-1/3 h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-[130px]" />
          </div>
          <div className="relative z-10 w-full overflow-x-hidden">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

