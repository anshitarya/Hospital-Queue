import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { Icon, TurnosIcon } from '@/components/Icons';
import { BRAND } from '@/lib/config';

export const metadata = {
  title: 'About Us · Turnos Queue Management',
  description: 'Learn about Turnos virtual token queue management system, our core engineering mission, technology stack, and compliance standards.',
  alternates: {
    canonical: '/about',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden">
      {/* Background ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-brand-500/10 dark:bg-brand-500/5 blur-[100px]" />
        <div className="absolute top-1/3 right-0 h-[600px] w-[600px] rounded-full bg-purple-600/10 dark:bg-purple-600/5 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 blur-[110px]" />
      </div>

      <LandingNav />

      <main id="main-content" className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16 space-y-16">
        
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide">
            <Icon.Sparkles className="h-3.5 w-3.5" />
            Our Vision
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
            Skip the physical wait.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
            Turnos was born out of a simple insight: waiting rooms are an outdated, stressful experience. We are building the real-time virtual queue infrastructure of India to return valuable hours back to customers and doctors.
          </p>
        </section>

        {/* Core Mission (BLUF Answer-Shaped structure) */}
        <section className="card p-6 sm:p-8 backdrop-blur-xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/10 rounded-3xl shadow-sm space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Icon.Check className="h-4.5 w-4.5" />
            </span>
            What is Turnos?
          </h2>
          <div className="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
            <p className="font-semibold text-slate-900 dark:text-white">
              Turnos is a live virtual token queue management system that eliminates waiting room crowding by giving customers live-updating queue positions and minute-accurate ETAs on their mobile phone.
            </p>
            <p>
              Unlike traditional pager and physical token machines that restrict customers to a physical lobby, Turnos runs entirely in the mobile browser. It requires **zero app downloads** from the customer. By scanning a QR code or logging in via a secure OTP link, customers can track their token progress while waiting in their cars, visiting nearby shops, or resting at home.
            </p>
          </div>
        </section>

        {/* Expertise & Leadership (EEAT) */}
        <section className="space-y-6">
          <div className="text-center sm:text-left max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Expertise &amp; Integrity</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Turnos is built by engineering professionals committed to security, performance, and transparency.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6 bg-white/40 dark:bg-slate-900/20 border border-slate-200/40 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Icon.User className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Senior Engineering Roots</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Our technology architecture is built and scaled by senior software engineers (including Anshit Arya, Software Engineer at Flipkart), bringing enterprise-grade standards of uptime, performance, and caching to clinic wait lists.
              </p>
            </div>

            <div className="card p-6 bg-white/40 dark:bg-slate-900/20 border border-slate-200/40 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-emerald-400 flex items-center justify-center">
                  <Icon.Stethoscope className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Clinical and Diagnostic Focus</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                By cooperating closely with healthcare providers, Turnos addresses specific clinical pain points—such as multi-doctor schedules, urgent case priority, and delayed/no-show re-routing—without cluttering the interface.
              </p>
            </div>
          </div>
        </section>

        {/* Technical Architecture & Trustworthiness */}
        <section className="space-y-6">
          <div className="text-center sm:text-left max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Security &amp; Architecture</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              A transparent view of how Turnos safely runs virtual queues.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">WebSockets &amp; Speed</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">Socket.IO &amp; Redis</div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Real-time queue changes and calls are broadcasted in milliseconds via WebSockets backed by Redis caching, ensuring instant screen refreshes.
              </p>
            </div>

            <div className="card p-5 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2">Data Integrity</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">PostgreSQL on Neon</div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                All persistent customer transactions, appointments, settings, and staff credentials reside in a highly-available, secure PostgreSQL cluster.
              </p>
            </div>

            <div className="card p-5 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">Cloud Infrastructure</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">Fly.io &amp; SSL/TLS</div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                The Turnos application is deployed close to users on Fly.io edge servers. Every byte of network traffic is encrypted via TLS/HTTPS protocols.
              </p>
            </div>
          </div>
        </section>

        {/* Trust & DPDP Compliance */}
        <section className="card p-6 sm:p-8 bg-slate-900/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Icon.Shield className="h-4.5 w-4.5" />
            </span>
            DPDPA Compliance &amp; Patient Privacy
          </h2>
          <div className="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
            <p>
              In accordance with India&apos;s **Digital Personal Data Protection (DPDP) Act, 2023**, Turnos acts strictly as a data processor for queue management. We prioritize privacy by design:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>
                <strong>Data Minimization:</strong> We only collect customer names and phone numbers. We do **not** request, store, or process any medical records, prescriptions, or diagnostics.
              </li>
              <li>
                <strong>Anonymization:</strong> Active queue logs are automatically archived, and identifiers are protected post-consultation.
              </li>
              <li>
                <strong>User Control:</strong> Patients retain full rights to request information correction or complete deletion of their visit records under Section 7 of the Act.
              </li>
            </ul>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-white/10 py-12 bg-slate-100/50 dark:bg-slate-950/80">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
            <TurnosIcon className="h-7 w-7" />
            <span>© {new Date().getFullYear()} Turnos · Built with care in India.</span>
          </div>
          <div className="flex gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <Link href="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">Home</Link>
            <span>·</span>
            <Link href="/faq" className="hover:text-slate-900 dark:hover:text-white transition-colors">FAQ</Link>
            <span>·</span>
            <Link href="/contact" className="hover:text-slate-900 dark:hover:text-white transition-colors font-semibold text-brand-600 dark:text-emerald-400">Contact Us</Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white transition-colors">Terms</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
