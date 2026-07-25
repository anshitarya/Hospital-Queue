import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { Icon } from '@/components/Icons';
import { PatientDemo, ReceptionDemo, DoctorDemo } from '@/components/DemoAnimations';
import { SOLUTIONS } from '@/lib/solutions';

interface PageProps {
  params: {
    slug: string;
  };
}

export function generateStaticParams() {
  return Object.keys(SOLUTIONS).map((slug) => ({
    slug,
  }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const solution = SOLUTIONS[params.slug];
  if (!solution) return {};

  return {
    title: solution.metaTitle,
    description: solution.metaDescription,
    keywords: solution.keywords,
    alternates: {
      canonical: `/solutions/${solution.slug}`,
    },
    openGraph: {
      title: solution.metaTitle,
      description: solution.metaDescription,
      url: `https://turnos.in/solutions/${solution.slug}`,
      siteName: 'Turnos',
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
      title: solution.metaTitle,
      description: solution.metaDescription,
      images: ['/logo-icon.png'],
    },
  };
}

const DEMO_COMPONENTS = {
  patient: PatientDemo,
  reception: ReceptionDemo,
  doctor: DoctorDemo,
};

export default function SolutionPage({ params }: PageProps) {
  const solution = SOLUTIONS[params.slug];
  if (!solution) {
    notFound();
  }

  const DemoComponent = DEMO_COMPONENTS[solution.demoType];

  return (
    <div className="relative">
      {/* Background mesh */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-purple-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <LandingNav />

      <main id="main-content">
        {/* HERO SECTION */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
              <div className="space-y-6 animate-fade-in">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-emerald-300 px-3.5 py-1.5 text-xs font-medium backdrop-blur-xl border border-white/15 shadow-glass">
                  {solution.kicker}
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                  {solution.heroTitle}
                </h1>

                <p className="text-lg text-slate-300 max-w-xl leading-relaxed">
                  {solution.heroSubtitle}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/get-started"
                    className="btn-primary !px-6 !py-3.5 text-base shadow-glow hover:shadow-xl !rounded-2xl"
                  >
                    {solution.ctaText}
                    <Icon.ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Interactive Demo mockup */}
              <div className="relative animate-fade-in bg-slate-950/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-modal border border-white/15">
                <div className="absolute -top-3 right-4 bg-gradient-to-r from-emerald-500 to-brand-600 text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full shadow-glow z-20">
                  Interactive Live Demo
                </div>
                <DemoComponent />
              </div>
            </div>
          </div>
        </section>

        {/* BENEFITS SECTION */}
        <section className="py-16 sm:py-24 bg-white/5 backdrop-blur-xl border-y border-white/10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Why providers trust Turnos</h2>
              <p className="mt-3 text-slate-300">Simpler client wait times. Better provider efficiency. Fully automated.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {solution.benefits.map((b, i) => {
                const SelectedIcon = Icon[b.iconName] || Icon.Check;
                return (
                  <div key={i} className="card p-6 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl hover:border-white/20 transition-all duration-300">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-600 text-white shadow-glow mb-4">
                      <SelectedIcon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg text-white">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQS SECTION */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Frequently Asked Questions</h2>
              <p className="mt-3 text-slate-300">Got questions? We have answers.</p>
            </div>

            <div className="space-y-4">
              {solution.faqs.map((faq, i) => (
                <div key={i} className="card p-6 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl">
                  <h4 className="font-semibold text-base text-white">{faq.q}</h4>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-10 backdrop-blur-xl bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm text-slate-400">
            <Link href="/" className="relative inline-flex items-center shrink-0 rounded-2xl overflow-hidden h-7 w-7">
              <img src="/logo-dark.png" alt="Turnos Logo" width={28} height={28} className="h-full w-auto object-contain rounded-2xl" />
            </Link>
            <span>Turnos · Built with care in India.</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <Link href="/login/choose" className="hover:text-white transition-colors">Sign in</Link>
            <span className="text-slate-700">|</span>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/faq" className="hover:text-white font-semibold text-emerald-400 transition-colors">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
