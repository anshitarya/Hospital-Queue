import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { FAQ } from '@/components/FAQ';
import { Icon, TurnosIcon } from '@/components/Icons';
import { VideoSection } from '@/components/VideoSection';
import { BRAND, FEATURES, FAQS, HERO_STATS } from '@/lib/config';

// FEATURES and FAQS are sourced from lib/config.ts — edit content there.
// Map the config's iconName → actual Icon component here.
const FEATURE_CARDS = FEATURES.map((f) => ({
  ...f,
  icon: (() => {
    const C = Icon[f.iconName];
    return <C className="h-6 w-6" />;
  })(),
}));

export default function HomePage() {
  return (
    <div className="relative w-full overflow-x-hidden">
      {/* Background mesh */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-purple-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <LandingNav />

      <main id="main-content">
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HERO                                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-white/10 backdrop-blur-xl border border-slate-200 dark:border-white/15 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm">
                <span className="live-dot" />
                Live ETA · No app needed
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.05]">
                Stop waiting blindly.{' '}
                <span className="bg-gradient-to-r from-emerald-600 via-brand-600 to-purple-600 dark:from-emerald-400 dark:via-brand-400 dark:to-purple-400 bg-clip-text text-transparent">
                  Know exactly when it&apos;s your turn.
                </span>
              </h1>

              <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed font-normal">
                Turnos lets customers see their live position and wait time on their
                phone — without downloading any app. Providers call the next customer in one tap.
                Staff manages everything from a single screen.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/get-started"
                  className="btn-primary !px-6 !py-3.5 text-base shadow-glow hover:shadow-xl !rounded-2xl"
                >
                  Business owners — get started
                  <Icon.ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login/choose"
                  className="btn-secondary !px-6 !py-3.5 text-base !rounded-2xl"
                >
                  Sign in
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400 pt-2 font-medium">
                <div className="flex items-center gap-1.5">
                  <Icon.Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Free for customers
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon.Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> No app to install
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon.Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Ready in minutes
                </div>
              </div>
            </div>

            {/* Hero mockup */}
            <div className="relative animate-fade-in">
              <HeroMock />
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {HERO_STATS.map((s) => (
              <div key={s.l} className="card p-5 text-center shadow-sm">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-emerald-600 to-brand-600 dark:from-emerald-400 dark:to-brand-300 bg-clip-text text-transparent">
                  {s.v}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FEATURES                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            kicker="What you get"
            title="Everything that makes waiting rooms better"
            sub="Simple for customers. Powerful for any business with a queue."
          />

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURE_CARDS.map((f, i) => (
              <div
                key={i}
                className={
                  'card p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ' +
                  (f.span ?? '')
                }
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm mb-4">
                  {f.icon}
                </div>
                <div className="font-semibold text-lg">{f.title}</div>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="how" className="py-16 sm:py-24 bg-slate-50/60 dark:bg-slate-800/30 border-y border-slate-200/60 dark:border-slate-700/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            kicker="How it works"
            title="Simple for everyone involved"
            sub="Customers, providers, and staff each have a screen built exactly for them — no confusion, no clutter."
          />

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FlowCard
              tone="brand"
              title="For customers"
              steps={[
                { n: 1, t: 'Open the link — no app needed', d: 'Enter your phone number and verify with a one-time code. Takes under a minute.' },
                { n: 2, t: 'See your live position and wait time', d: 'Your token, how many people are ahead, and how many minutes until your turn — all updating automatically.' },
                { n: 3, t: 'Get notified when you\'re close', d: 'Your screen alerts you when it\'s almost your turn so you can stay nearby instead of sitting in a crowded room.' },
              ]}
            />
            <FlowCard
              tone="purple"
              title="For businesses"
              steps={[
                { n: 1, t: 'Staff registers the customer', d: 'Adds name and phone number — done in seconds. Urgent cases jump to the front with one tap.' },
                { n: 2, t: 'Provider calls next when ready', d: 'One tap on "Call next" — the customer\'s phone updates instantly and the waiting area display refreshes.' },
                { n: 3, t: 'Mark complete and move on', d: 'Provider or staff marks the session done. The queue moves forward and every customer\'s wait time is recalculated.' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIDEOS                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <VideoSection />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ROLES                                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            kicker="Who uses it"
            title="A dedicated screen for every person"
            sub="Each role sees only what they need — customers see their token, providers see the queue, staff manages everything."
          />

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <RoleCard
              icon={<Icon.User className="h-5 w-5" />}
              tone="emerald"
              title="Customer"
              points={['Live token & wait time', 'Alert when you\'re next', 'Past visit history']}
            />
            <RoleCard
              icon={<Icon.Users className="h-5 w-5" />}
              tone="brand"
              title="Front-desk Staff"
              points={['Register customers instantly', 'Mark urgent cases', 'Manage walk-ins & missed']}
            />
            <RoleCard
              icon={<Icon.Stethoscope className="h-5 w-5" />}
              tone="sky"
              title="Service Provider"
              points={['Call next with one tap', 'Take a break anytime', 'Clear or pause the queue']}
            />
            <RoleCard
              icon={<Icon.Settings className="h-5 w-5" />}
              tone="purple"
              title="Admin / Owner"
              points={['Set up your business', 'Add providers & staff', 'See all queues together']}
            />
          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FAQ                                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-16 sm:py-24 bg-slate-50/60 dark:bg-slate-800/30 border-y border-slate-200/60 dark:border-slate-700/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading
            kicker="Common questions"
            title="Got questions? We have answers."
            sub="If something isn't covered here, reach out on WhatsApp — details at the bottom of the page."
          />
          <div className="mt-10">
            <FAQ items={FAQS} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CONTACT + CTA                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="contact" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 p-8 sm:p-12 shadow-xl">
            {/* decorative shapes */}
            <div aria-hidden className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-purple-400/20 blur-3xl" />

            <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
              <div className="lg:col-span-3 text-white space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                  <Icon.Sparkles className="h-3.5 w-3.5" /> Ready to deploy
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Ready to turn your waiting room into a thing of the past?
                </h2>
                <p className="text-white/85 max-w-2xl">
                  Sign in if you already have access, or register your business — we&apos;ll
                  help you set up providers and your customer flow.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    href="/login/choose"
                    className="inline-flex items-center gap-2 rounded-lg bg-white text-brand-700 px-5 py-3 text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    Sign in
                    <Icon.ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/get-started"
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/30 px-5 py-3 text-sm font-semibold transition-colors"
                  >
                    Business owners — get started
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/20 p-6 space-y-3 text-white">
                  <div className="text-sm font-semibold uppercase tracking-wider text-white/80">
                    Talk to us
                  </div>

                  {/* Call */}
                  {/* Call */}
                  <a
                    href={`tel:${BRAND.contact.phoneTel}`}
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity group"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 group-hover:bg-white/25 transition-colors shrink-0">
                      <Icon.Phone className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-xs text-white/70">Call us</div>
                      <div className="font-semibold text-base sm:text-lg tracking-wide whitespace-nowrap">{BRAND.contact.phone}</div>
                    </div>
                  </a>

                  {/* WhatsApp */}
                  <a
                    href={`https://wa.me/${BRAND.contact.phoneWhatsapp}?text=Hi%2C%20I%20want%20to%20know%20more%20about%20Turnos`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity group"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/30 group-hover:bg-[#25D366]/50 transition-colors shrink-0">
                      <Icon.Whatsapp className="h-5 w-5 text-[#25D366]" />
                    </span>
                    <div>
                      <div className="text-xs text-white/70">WhatsApp us</div>
                      <div className="font-semibold text-base sm:text-lg tracking-wide whitespace-nowrap">{BRAND.contact.phone}</div>
                    </div>
                  </a>

                  <div className="text-xs text-white/70 leading-relaxed pt-2 border-t border-white/10">
                    Available {BRAND.contact.hours} · Message us to set up your business or ask anything.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      </main>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FOOTER                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-200 dark:border-white/10 py-12 bg-slate-50/60 dark:bg-slate-950/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-8">
          {/* Main Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand Col */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <TurnosIcon className="h-8 w-8 text-slate-900 dark:text-white" />
                <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">turnos</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
                Live queue management and virtual token system. Built with care in India.
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                Quick Links
              </div>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <Link href="/login/choose" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="hover:text-slate-900 dark:hover:text-white font-semibold text-brand-600 dark:text-emerald-400 transition-colors">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact Col */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                Contact Us
              </div>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <a href={`tel:${BRAND.contact.phoneTel}`} className="hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap">
                    <Icon.Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{BRAND.contact.phone}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`https://wa.me/${BRAND.contact.phoneWhatsapp}?text=Hi%2C%20I%20want%20to%20know%20more%20about%20Turnos`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#25D366] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Icon.Whatsapp className="h-4 w-4 text-[#25D366] shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-6 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-500">
            <div>© {new Date().getFullYear()} Turnos. All rights reserved.</div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:underline">Terms</Link>
              <Link href="/privacy" className="hover:underline">Privacy</Link>
              <Link href="/faq" className="hover:underline">FAQ</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

function SectionHeading({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-3 py-1 text-xs font-medium ring-1 ring-brand-200 dark:ring-brand-700">
        {kicker}
      </div>
      <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-slate-600 dark:text-slate-300">{sub}</p>
    </div>
  );
}

function FlowCard({
  title,
  steps,
  tone,
}: {
  title: string;
  steps: { n: number; t: string; d: string }[];
  tone: 'brand' | 'purple';
}) {
  const gradient = tone === 'brand'
    ? 'from-brand-500 to-brand-700'
    : 'from-purple-500 to-purple-700';
  const ring = tone === 'brand' ? 'ring-brand-200' : 'ring-purple-200';

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm`}>
          {tone === 'brand' ? <Icon.User className="h-5 w-5" /> : <Icon.Building className="h-5 w-5" />}
        </div>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>

      <ol className="mt-6 space-y-4">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4 group">
            <div className={`shrink-0 h-8 w-8 rounded-full bg-white dark:bg-slate-700 ring-2 ${ring} flex items-center justify-center font-semibold text-sm text-slate-700 dark:text-white group-hover:scale-110 transition-transform`}>
              {s.n}
            </div>
            <div className="pt-0.5">
              <div className="font-semibold text-slate-900 dark:text-white">{s.t}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  points,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  points: string[];
  tone: 'emerald' | 'brand' | 'sky' | 'purple';
}) {
  const tones = {
    emerald: 'from-emerald-500 to-emerald-700 text-emerald-700 bg-emerald-50 ring-emerald-200',
    brand: 'from-brand-500 to-brand-700 text-brand-700 bg-brand-50 ring-brand-200',
    sky: 'from-sky-500 to-sky-700 text-sky-700 bg-sky-50 ring-sky-200',
    purple: 'from-purple-500 to-purple-700 text-purple-700 bg-purple-50 ring-purple-200',
  } as const;
  const t = tones[tone].split(' ');

  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${t[0]} ${t[1]} text-white shadow-sm`}>
        {icon}
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <ul className="mt-2 space-y-1">
        {points.map((p) => (
          <li key={p} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Icon.Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Hero mock — stylised patient + reception cards                            */
/* ─────────────────────────────────────────────────────────────────────────── */
function HeroMock() {
  return (
    <div className="relative max-w-md mx-auto lg:ml-auto lg:mr-0">
      {/* Floating "in consultation" badge */}
      <div className="absolute -top-4 left-4 z-20 inline-flex items-center gap-2 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/40 text-emerald-800 dark:text-emerald-300 px-3.5 py-1 text-xs font-bold shadow-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
        Live · It&apos;s your turn
      </div>

      {/* Main patient card */}
      <div className="relative card p-6 shadow-xl z-10 rotate-[-1deg]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-base">Anjali Sharma</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Serving now</div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            <span className="live-dot" /> Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 dark:bg-brand-500/10 border border-emerald-200 dark:border-brand-400/20 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Your token</div>
            <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">#12</div>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Now serving</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-white mt-1">#12</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-400/30 px-3.5 py-2.5 text-emerald-800 dark:text-emerald-300 text-sm text-center font-medium animate-pulse-slow shadow-sm">
          It&apos;s your turn — head to the service area
        </div>
      </div>

      {/* Secondary card peeking behind */}
      <div className="absolute -bottom-6 -right-2 lg:-right-6 w-64 rounded-3xl bg-slate-900/60 backdrop-blur-xl p-4 border border-white/10 shadow-modal rotate-[3deg] z-0 hidden sm:block">
        <div className="text-xs font-semibold text-slate-300 mb-2">Reception · Live queue</div>
        <div className="space-y-2">
          {[
            { n: 12, name: 'You', highlight: true },
            { n: 13, name: 'Riya M.', tag: 'next' },
            { n: 14, name: 'Arjun P.' },
          ].map((r) => (
            <div
              key={r.n}
              className={
                'flex items-center justify-between text-xs rounded-xl px-3 py-2 transition-all ' +
                (r.highlight ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold' : 'bg-white/5 text-slate-300 border border-white/5')
              }
            >
              <span>#{r.n} · {r.name}</span>
              {r.tag && <span className="text-[10px] text-brand-300 font-semibold uppercase tracking-wider">{r.tag}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
