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
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-medium ring-1 ring-brand-200">
                  {solution.kicker}
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                  {solution.heroTitle}
                </h1>

                <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
                  {solution.heroSubtitle}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/get-started"
                    className="btn-primary !px-5 !py-3 text-base shadow-md hover:shadow-lg"
                  >
                    {solution.ctaText}
                    <Icon.ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Interactive Demo mockup */}
              <div className="relative animate-fade-in bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl ring-1 ring-slate-200/60 dark:ring-slate-800/80">
                <div className="absolute -top-3 right-4 bg-brand-600 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded shadow-sm z-20">
                  Interactive Live Demo
                </div>
                <DemoComponent />
              </div>
            </div>
          </div>
        </section>

        {/* BENEFITS SECTION */}
        <section className="py-16 sm:py-24 bg-slate-50/60 dark:bg-slate-800/30 border-y border-slate-200/60 dark:border-slate-700/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Why providers trust Turnos</h2>
              <p className="mt-3 text-slate-600">Simpler client wait times. Better provider efficiency. Fully automated.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {solution.benefits.map((b, i) => {
                const SelectedIcon = Icon[b.iconName] || Icon.Check;
                return (
                  <div key={i} className="card p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm mb-4">
                      <SelectedIcon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{b.desc}</p>
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
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Frequently Asked Questions</h2>
              <p className="mt-3 text-slate-600">Got questions? We have answers.</p>
            </div>

            <div className="space-y-4">
              {solution.faqs.map((faq, i) => (
                <div key={i} className="card p-6">
                  <h4 className="font-semibold text-base text-slate-900">{faq.q}</h4>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm text-slate-500">
            <Link href="/" className="relative inline-flex items-center shrink-0 rounded-2xl overflow-hidden h-7 w-7">
              <img src="/logo-light.png" alt="Turnos Logo" width={28} height={28} className="h-full w-auto object-contain dark:hidden rounded-2xl" />
              <img src="/logo-dark.png" alt="Turnos Logo" width={28} height={28} className="h-full w-auto object-contain hidden dark:block rounded-2xl" />
            </Link>
            <span>Turnos · Built with care in India.</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link href="/login/choose" className="hover:text-slate-900">Sign in</Link>
            <span className="text-slate-300">|</span>
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/faq" className="hover:text-slate-900 font-semibold text-brand-700 dark:text-emerald-400">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
