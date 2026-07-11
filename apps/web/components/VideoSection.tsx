'use client';

import type { ReactNode } from 'react';
import { PatientDemo, ReceptionDemo, DoctorDemo } from './DemoAnimations';

interface DemoCard {
  id: string;
  badge: string;
  badgeColor: string;
  accentBar: string;
  title: string;
  subtitle: string;
  demo: ReactNode;
}

const DEMOS: DemoCard[] = [
  {
    id: 'patient',
    badge: 'Customers',
    badgeColor: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    accentBar: 'from-emerald-400 to-teal-500',
    title: 'Sign in · Get your token · Go home',
    subtitle:
      'Customer enters their phone number, gets an OTP, then sees a live token card with real-time ETA that ticks down automatically.',
    demo: <PatientDemo />,
  },
  {
    id: 'reception',
    badge: 'Receptionist',
    badgeColor: 'bg-brand-50 text-brand-700 ring-brand-200',
    accentBar: 'from-brand-400 to-indigo-500',
    title: 'Add customer · Queue updates instantly',
    subtitle:
      'Type a name, assign a provider, hit Add — the customer gets their token in under a second and the live queue list updates for everyone.',
    demo: <ReceptionDemo />,
  },
  {
    id: 'doctor',
    badge: 'Provider',
    badgeColor: 'bg-purple-50 text-purple-700 ring-purple-200',
    accentBar: 'from-purple-400 to-pink-500',
    title: 'Call next · Serve · Complete · Repeat',
    subtitle:
      'Provider calls the next customer, a service timer starts, and the moment they mark complete every customer\'s ETA recalculates live.',
    demo: <DoctorDemo />,
  },
];

export function VideoSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Heading */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-medium ring-1 ring-brand-200">
            Live demos
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
            Watch it work — right here
          </h2>
          <p className="mt-3 text-slate-600">
            These aren&apos;t screenshots. Every demo below is the real app flow, animated live in your browser.
          </p>
        </div>

        {/* Demo cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {DEMOS.map((d) => (
            <div key={d.id} className="card overflow-hidden flex flex-col">
              {/* Gradient accent top bar */}
              <div className={`h-1 w-full bg-gradient-to-r ${d.accentBar}`} />

              {/* Header */}
              <div className="p-5 pb-4 border-b border-slate-100">
                <span
                  className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ring-1 ${d.badgeColor} mb-2`}
                >
                  {d.badge}
                </span>
                <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                  {d.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {d.subtitle}
                </p>
              </div>

              {/* Animated demo */}
              <div className="flex-1 p-5 bg-slate-50/60 min-h-[340px] flex flex-col justify-center">
                {d.demo}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Animations loop automatically · No videos to load · No app to install
        </p>
      </div>
    </section>
  );
}
