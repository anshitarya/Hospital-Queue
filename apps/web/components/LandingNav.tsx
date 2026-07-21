'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon, TurnosIcon } from './Icons';

const SECTIONS: { id: string; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
];

/**
 * The landing page is intentionally generic — it's the same page for everyone,
 * authenticated or not. We do NOT read auth state here. Visitors always see
 * "Sign in" / "Get started" CTAs that open the auth flow in a new tab.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 12); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={
        'sticky top-0 z-40 transition-all duration-300 ' +
        (scrolled
          ? 'bg-white/90 dark:bg-[#0a0a0b]/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60 shadow-sm'
          : 'bg-transparent')
      }
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <TurnosIcon className="h-10 w-10 transition-transform group-hover:scale-105 duration-200" />
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">turnos</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-0.5">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 rounded-xl
                         hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/60
                         transition-colors font-medium"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA buttons */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100
                       px-3.5 py-2 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/get-started"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm !py-2 !px-4"
          >
            Get started
            <Icon.ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden btn-icon"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <Icon.X className="h-5 w-5" /> : <Icon.Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200/60 dark:border-slate-800/60 bg-white/95 dark:bg-[#0a0a0b]/95 backdrop-blur-sm animate-slide-up">
          <nav className="px-4 py-3 space-y-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300
                           rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
              >
                {s.label}
              </a>
            ))}
            <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
              <Link
                href="/login/choose"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="btn-secondary text-sm justify-center"
              >
                Sign in
              </Link>
              <Link
                href="/get-started"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="btn-primary text-sm justify-center"
              >
                For business owners
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
