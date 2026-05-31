import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { FAQ } from '@/components/FAQ';
import { Icon } from '@/components/Icons';
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
    <div className="relative">
      {/* Background mesh */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-purple-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <LandingNav />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO                                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur ring-1 ring-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                <span className="live-dot" />
                Live ETA · No app needed · Multi-clinic
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                Skip the waiting room.{' '}
                <span className="bg-gradient-to-r from-brand-600 to-purple-600 bg-clip-text text-transparent">
                  Arrive when it&apos;s your turn.
                </span>
              </h1>

              <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
                Hospital Queue gives every patient a live token with minute-accurate ETA on
                their phone. Doctors and reception get a focused dashboard. One deployment
                serves many clinics.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/login/choose"
                  className="btn-primary !px-5 !py-3 text-base shadow-md hover:shadow-lg"
                >
                  Get started
                  <Icon.ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login/choose"
                  className="btn-secondary !px-5 !py-3 text-base"
                >
                  Sign in
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-slate-500 pt-2">
                <div className="flex items-center gap-1.5">
                  <Icon.Check className="h-4 w-4 text-emerald-600" /> Free for patients
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon.Check className="h-4 w-4 text-emerald-600" /> Setup in minutes
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
              <div key={s.l} className="card p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-brand-600 to-purple-600 bg-clip-text text-transparent">
                  {s.v}
                </div>
                <div className="text-xs text-slate-500 mt-1">{s.l}</div>
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
            kicker="Features"
            title="Everything a queue needs. Nothing it doesn't."
            sub="No bloat. No medical-records baggage. Just the parts that fix waiting-room chaos."
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
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="how" className="py-16 sm:py-24 bg-slate-50/60 border-y border-slate-200/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            kicker="How it works"
            title="Two flows. Both take under a minute."
            sub="Whether you're a patient or running a clinic, you'll be using it within minutes of signing up."
          />

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FlowCard
              tone="brand"
              title="For patients"
              steps={[
                { n: 1, t: 'Sign in with your phone', d: 'Get a 6-digit OTP. No app to install.' },
                { n: 2, t: 'See your live token', d: 'Big number, current serving, people ahead, ETA in minutes.' },
                { n: 3, t: 'Arrive when it’s your turn', d: 'Card pulses when you’re next. No more sitting around waiting.' },
              ]}
            />
            <FlowCard
              tone="purple"
              title="For clinics"
              steps={[
                { n: 1, t: 'Admin creates the clinic', d: 'One click; copy the invite code.' },
                { n: 2, t: 'Receptionist registers', d: 'Uses the invite code, adds doctors and patients.' },
                { n: 3, t: 'Doctor opens their panel', d: 'Calls next, marks complete — every screen updates live.' },
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
            kicker="Built for everyone in the clinic"
            title="A focused panel for every role"
            sub="No one sees controls they don't need. Each screen does one job, well."
          />

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <RoleCard
              icon={<Icon.User className="h-5 w-5" />}
              tone="emerald"
              title="Patient"
              points={['Token + ETA', 'Live updates', 'Visit history']}
            />
            <RoleCard
              icon={<Icon.Users className="h-5 w-5" />}
              tone="brand"
              title="Receptionist"
              points={['Add patients', 'Manage doctors', 'Mark emergencies']}
            />
            <RoleCard
              icon={<Icon.Stethoscope className="h-5 w-5" />}
              tone="sky"
              title="Doctor"
              points={['Call next', 'Mark complete', 'Pause queue']}
            />
            <RoleCard
              icon={<Icon.Settings className="h-5 w-5" />}
              tone="purple"
              title="Admin"
              points={['Create clinics', 'Invite codes', 'Cross-clinic view']}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FAQ                                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-16 sm:py-24 bg-slate-50/60 border-y border-slate-200/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading
            kicker="FAQ"
            title="Questions, answered"
            sub="If your question isn't here, the contact details are right below."
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
                  Sign in to get started, or reach out to set up your clinic — we&apos;ll help you
                  configure invite codes, doctors and the patient flow.
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
                    href="/login/choose"
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/30 px-5 py-3 text-sm font-semibold transition-colors"
                  >
                    Get started
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/20 p-6 space-y-4 text-white">
                  <div className="text-sm font-semibold uppercase tracking-wider text-white/80">
                    Talk to the maker
                  </div>
                  <a
                    href={`tel:${BRAND.contact.phoneTel}`}
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity group"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 group-hover:bg-white/25 transition-colors">
                      <Icon.Phone className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-xs text-white/70">Call / WhatsApp</div>
                      <div className="font-semibold text-lg tracking-wide">{BRAND.contact.phone}</div>
                    </div>
                  </a>
                  <div className="text-xs text-white/70 leading-relaxed pt-2 border-t border-white/10">
                    Available {BRAND.contact.hours} · Reach out for setup help, custom features, or
                    on-premise deployment.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FOOTER                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-200 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm text-slate-500">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-xs">
              HQ
            </span>
            <span>Hospital Queue · Built with care in India.</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <a href={`tel:${BRAND.contact.phoneTel}`} className="hover:text-slate-900 inline-flex items-center gap-1.5">
              <Icon.Phone className="h-4 w-4" /> {BRAND.contact.phone}
            </a>
            <Link href="/login/choose" className="hover:text-slate-900">Sign in</Link>
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
      <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-medium ring-1 ring-brand-200">
        {kicker}
      </div>
      <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-slate-600">{sub}</p>
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
            <div className={`shrink-0 h-8 w-8 rounded-full bg-white ring-2 ${ring} flex items-center justify-center font-semibold text-sm text-slate-700 group-hover:scale-110 transition-transform`}>
              {s.n}
            </div>
            <div className="pt-0.5">
              <div className="font-semibold text-slate-900">{s.t}</div>
              <div className="text-sm text-slate-600 mt-0.5">{s.d}</div>
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
          <li key={p} className="text-sm text-slate-600 flex items-center gap-2">
            <Icon.Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
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
      <div className="absolute -top-4 left-4 z-20 inline-flex items-center gap-2 rounded-full bg-emerald-500 text-white px-3 py-1 text-xs font-semibold shadow-lg">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
        Live · It&apos;s your turn
      </div>

      {/* Main patient card */}
      <div className="relative card p-6 shadow-xl ring-2 ring-brand-200/60 z-10 rotate-[-1deg]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-slate-900">Dr. Anjali Sharma</div>
            <div className="text-xs text-slate-500">General Medicine</div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <span className="live-dot" /> Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-50 ring-1 ring-brand-200 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Your token</div>
            <div className="text-4xl font-bold text-brand-700 mt-1">#12</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Now serving</div>
            <div className="text-4xl font-bold mt-1">#12</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-sm text-center font-medium animate-pulse-slow">
          It&apos;s your turn — head to the consultation room
        </div>
      </div>

      {/* Secondary card peeking behind */}
      <div className="absolute -bottom-6 -right-2 lg:-right-6 w-64 card p-4 shadow-lg rotate-[3deg] z-0 hidden sm:block">
        <div className="text-xs font-semibold text-slate-700 mb-2">Reception · Live queue</div>
        <div className="space-y-2">
          {[
            { n: 12, name: 'You', highlight: true },
            { n: 13, name: 'Riya M.', tag: 'next' },
            { n: 14, name: 'Arjun P.' },
          ].map((r) => (
            <div
              key={r.n}
              className={
                'flex items-center justify-between text-xs rounded-md px-2 py-1.5 ' +
                (r.highlight ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-slate-50')
              }
            >
              <span>#{r.n} · {r.name}</span>
              {r.tag && <span className="text-[10px] text-brand-600 font-semibold">{r.tag}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
