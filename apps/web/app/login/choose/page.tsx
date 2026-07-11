'use client';

import Link from 'next/link';
import { TurnosIcon } from '@/components/Icons';

interface Choice {
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  accent: string;
  badge?: string;
}

const CHOICES: Choice[] = [
  {
    emoji: '🏥',
    title: 'Customer',
    subtitle: 'Mobile + PIN',
    description:
      'Sign in with your mobile number and permanent 4-digit Customer PIN. Ask reception for your PIN on your first visit.',
    href: '/login/patient',
    accent: 'from-emerald-500 to-teal-600',
    badge: 'PIN login',
  },
  {
    emoji: '🩺',
    title: 'Staff',
    subtitle: 'Business staff',
    description:
      'Use your registered email or mobile and password to access the reception or doctor dashboard.',
    href: '/login',
    accent: 'from-brand-500 to-brand-700',
  },
];

export default function LoginChoosePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[400px] w-[400px] rounded-full bg-brand-200/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full bg-purple-200/30 blur-3xl" />
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <TurnosIcon className="h-11 w-11 shadow-md" />
            <span className="text-xl font-semibold tracking-tight">Turnos</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Who are you signing in as?
          </h1>
          <p className="mt-2 text-slate-500 text-base">
            Choose your role to continue to the right sign-in page.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
          {CHOICES.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group card p-6 flex flex-col gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${c.accent} shadow-md text-2xl group-hover:shadow-lg transition-shadow`}
              >
                {c.emoji}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold text-slate-900">{c.title}</span>
                  {c.badge && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium px-2 py-0.5">
                      {c.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{c.subtitle}</p>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed flex-1">{c.description}</p>

              <div className="flex items-center gap-1.5 text-sm font-medium text-brand-600 group-hover:gap-2.5 transition-all">
                Sign in
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 mt-8">
          New business?{' '}
          <Link href="/get-started" className="text-brand-600 hover:text-brand-700 font-medium">
            Register your business →
          </Link>
        </p>

        <p className="text-center text-xs text-slate-400 mt-4">
          <Link href="/" className="hover:text-slate-600 underline underline-offset-2">
            ← Back to homepage
          </Link>
        </p>
      </div>
    </main>
  );
}
