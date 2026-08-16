import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { Icon, TurnosIcon } from '@/components/Icons';
import { BRAND, FORMS } from '@/lib/config';

export const metadata = {
  title: 'Contact Us · Turnos Queue Management',
  description: 'Get in touch with the Turnos team. Reach us via WhatsApp, phone call, email, or submit an onboarding request for your clinic or hospital.',
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden">
      {/* Background ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-brand-500/10 dark:bg-brand-500/5 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-purple-600/10 dark:bg-purple-600/5 blur-[120px]" />
      </div>

      <LandingNav />

      <main id="main-content" className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16 space-y-12">
        
        {/* Page Header */}
        <section className="text-center space-y-3 max-w-xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide">
            <Icon.Phone className="h-3.5 w-3.5" />
            Support &amp; Onboarding
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
            Get in touch.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Have questions about integrations, multi-provider layouts, or setting up waiting room displays? Our support team is available {BRAND.contact.hours}.
          </p>
        </section>

        {/* Contact Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* Quick Channels (3 Cols) */}
          <div className="lg:col-span-3 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Communication Channels</h2>
            
            {/* WhatsApp */}
            <a
              href={`https://wa.me/${BRAND.contact.phoneWhatsapp}?text=Hi%2C%20I%20want%20to%20know%20more%20about%20Turnos`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/10 hover:border-emerald-500/50 hover:shadow-md transition-all group"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] group-hover:scale-105 transition-transform">
                <Icon.Whatsapp className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Message on WhatsApp</div>
                <div className="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                  {BRAND.contact.phone}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Response time: &lt; 15 minutes</div>
              </div>
            </a>

            {/* Direct Phone Call */}
            <a
              href={`tel:${BRAND.contact.phoneTel}`}
              className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/10 hover:border-brand-500/50 hover:shadow-md transition-all group"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <Icon.Phone className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Call Support Desk</div>
                <div className="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-emerald-400 transition-colors">
                  {BRAND.contact.phone}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Operating hours: {BRAND.contact.hours}</div>
              </div>
            </a>

            {/* Email Support */}
            <a
              href={`mailto:${BRAND.contact.legalEmail}`}
              className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/10 hover:border-purple-500/50 hover:shadow-md transition-all group"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                <Icon.Mail className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Email Address</div>
                <div className="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {BRAND.contact.legalEmail}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">For legal, data queries or invoicing: {BRAND.contact.email}</div>
              </div>
            </a>
          </div>

          {/* Integration & Form Info (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Business Registration</h2>
            
            <div className="card p-6 bg-slate-900/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Icon.Shield className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">Ready to deploy Turnos?</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                If you are a clinic administrator or business owner, you can request queue setup directly. Most clinics are active within 2 hours.
              </p>
              
              <div className="flex flex-col gap-2 pt-2">
                <a
                  href={FORMS.businessSignup.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-xs text-center justify-center !py-2.5 !px-4 !rounded-xl"
                >
                  Register Business Form
                  <Icon.ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href={BRAND.doctorSurveyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs text-center justify-center !py-2.5 !px-4 !rounded-xl"
                >
                  Submit Doctor Feedback
                </a>
              </div>
            </div>
          </div>
        </div>

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
            <Link href="/about" className="hover:text-slate-900 dark:hover:text-white transition-colors font-semibold text-brand-600 dark:text-emerald-400">About Us</Link>
            <span>·</span>
            <Link href="/faq" className="hover:text-slate-900 dark:hover:text-white transition-colors">FAQ</Link>
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
