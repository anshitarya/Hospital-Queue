'use client';

/**
 * Login-choice portal — the first stop for every new sign-in flow.
 *
 * "Sign in" and "Get started" in the landing nav both point here.
 * The user picks their role and is forwarded to the correct auth page.
 *
 * Three choices:
 *   Patient          → /login/patient  (OTP via mobile)
 *   Reception / Doctor → /login        (password)
 *   Admin            → /login          (password)
 */

import Link from 'next/link';

interface Choice {
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  accent: string;       // Tailwind gradient classes for the icon ring
  badge?: string;       // Optional pill label
}

const CHOICES: Choice[] = [
  {
    emoji: '🏥',
    title: 'Patient',
    subtitle: 'No password needed',
    description:
      "Sign in with your mobile number. We'll send a one-time code — no account setup required.",
    href: '/login/patient',
    accent: 'from-emerald-500 to-teal-600',
    badge: 'OTP login',
  },
  {
    emoji: '🩺',
    title: 'Doctor / Receptionist',
    subtitle: 'Clinic staff',
    description:
      'Use your registered email or mobile and password to access the reception or doctor dashboard.',
    href: '/login',
    accent: 'from-brand-500 to-brand-700',
  },
  {
    emoji: '⚙️',
    title: 'Admin',
    subtitle: 'Administrator',
    description:
      'Not for patients, doctors or receptionists only for ADMINISTRATOR',
    href: '/login',
    accent: 'from-violet-500 to-purple-700',
  },
];

export default function LoginChoosePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Background decoration */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[400px] w-[400px] rounded-full bg-brand-200/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full bg-purple-200/30 blur-3xl" />
      </div>

      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          {/* Logo — non-interactive in this flow; brand only */}
          <div className="inline-flex items-center gap-2.5 mb-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-md">
              CQ
            </span>
            <span className="text-xl font-semibold tracking-tight">Clinic Queue</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Who are you signing in as?
          </h1>
          <p className="mt-2 text-slate-500 text-base">
            Choose your role to continue to the right sign-in page.
          </p>
        </div>

        {/* Choice cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CHOICES.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group card p-6 flex flex-col gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer"
            >
              {/* Icon */}
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${c.accent} shadow-md text-2xl group-hover:shadow-lg transition-shadow`}
              >
                {c.emoji}
              </div>

              {/* Title + badge */}
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

              {/* Description */}
              <p className="text-sm text-slate-600 leading-relaxed flex-1">{c.description}</p>

              {/* CTA arrow */}
              <div className="flex items-center gap-1.5 text-sm font-medium text-brand-600 group-hover:gap-2.5 transition-all">
                Sign in
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer help */}
        <p className="text-center text-sm text-slate-500 mt-8">
          New receptionist?{' '}
          <Link href="/register" className="text-brand-600 hover:text-brand-700 font-medium">
            Register with an invite code →
          </Link>
        </p>

        {/* Back to home */}
        <p className="text-center text-xs text-slate-400 mt-4">
          <Link href="/" className="hover:text-slate-600 underline underline-offset-2">
            ← Back to homepage
          </Link>
        </p>
      </div>
    </main>
  );
}
