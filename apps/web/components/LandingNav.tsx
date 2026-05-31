'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './Icons';

const SECTIONS: { id: string; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
];

/**
 * The landing page is intentionally generic — it's the same page for everyone,
 * authenticated or not. We do NOT read auth state here. Visitors always see
 * "Sign in" / "Get started" CTAs that open the auth flow in a new tab. Any
 * logged-in session lives only on the dashboard tabs.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={
        'sticky top-0 z-40 transition-all duration-200 ' +
        (scrolled
          ? 'bg-white/85 backdrop-blur border-b border-slate-200 shadow-sm'
          : 'bg-transparent')
      }
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm shadow-md group-hover:shadow-lg transition-shadow">
            HQ
          </span>
          <span className="text-base font-semibold tracking-tight">Hospital Queue</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1.5 text-sm text-slate-600 rounded-md hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Right side: generic auth CTAs — both go to the role-choice portal */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login/choose"
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5"
          >
            Sign in
          </Link>
          <Link
            href="/login/choose"
            className="btn-primary text-sm !py-1.5 !px-3.5"
          >
            Get started
            <Icon.ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden p-2 rounded-lg hover:bg-slate-100"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <Icon.X className="h-5 w-5" /> : <Icon.Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white animate-slide-up">
          <nav className="px-4 py-3 space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100"
              >
                {s.label}
              </a>
            ))}
            <div className="pt-2 mt-2 border-t border-slate-100">
              <div className="flex gap-2">
                <Link
                  href="/login/choose"
                  onClick={() => setMobileOpen(false)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Sign in
                </Link>
                <Link
                  href="/login/choose"
                  onClick={() => setMobileOpen(false)}
                  className="btn-primary flex-1 text-sm"
                >
                  Get started
                </Link>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
