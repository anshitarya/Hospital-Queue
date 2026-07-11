'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { TurnosIcon, Icon } from '@/components/Icons';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { FORMS, BRAND } from '@/lib/config';
import { submitGoogleForm } from '@/lib/googleForms';

export default function GetStartedPage() {
  const businessNameId = useId();
  const contactNameId = useId();
  const emailId = useId();

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!businessName.trim() || businessName.trim().length < 2) {
      setError('Please enter your business name.');
      return;
    }
    if (!contactName.trim() || contactName.trim().length < 2) {
      setError('Please enter the contact person\'s name.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!phoneResult.ok || !phoneResult.e164) {
      setError(phoneResult.error ?? 'Please enter a valid mobile number.');
      return;
    }

    setBusy(true);

    const { actionUrl, viewUrl, fields } = FORMS.businessSignup;
    const payload: Record<string, string> = {};
    if (fields.businessName) payload[fields.businessName] = businessName.trim();
    if (fields.contactName) payload[fields.contactName] = contactName.trim();
    if (fields.email) payload[fields.email] = email.trim();
    if (fields.mobile) payload[fields.mobile] = phoneResult.e164;

    if (actionUrl && Object.keys(payload).length > 0) {
      submitGoogleForm(actionUrl, payload);
      setSubmitted(true);
      setBusy(false);
      return;
    }

    const hasPrefill = Object.values(fields).some(Boolean);
    if (hasPrefill) {
      const prefill = new URL(viewUrl);
      if (fields.businessName) prefill.searchParams.set(fields.businessName, businessName.trim());
      if (fields.contactName) prefill.searchParams.set(fields.contactName, contactName.trim());
      if (fields.email) prefill.searchParams.set(fields.email, email.trim());
      if (fields.mobile) prefill.searchParams.set(fields.mobile, phoneResult.e164);
      window.open(prefill.toString(), '_blank', 'noopener,noreferrer');
    } else {
      const body = encodeURIComponent(
        `Business name: ${businessName.trim()}\nContact name: ${contactName.trim()}\nEmail: ${email.trim()}\nMobile: ${phoneResult.e164}`,
      );
      window.location.href = `mailto:${BRAND.contact.email}?subject=${encodeURIComponent('Turnos business registration')}&body=${body}`;
    }
    setSubmitted(true);
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[400px] w-[400px] rounded-full bg-brand-200/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full bg-purple-200/30 blur-3xl" />
      </div>

      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <TurnosIcon className="h-11 w-11 shadow-md group-hover:shadow-lg transition-shadow" />
            <span className="text-xl font-semibold tracking-tight">Turnos</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Get started with Turnos
          </h1>
          <p className="mt-2 text-slate-500 text-base max-w-xl mx-auto">
            For business owners — register your business and we&apos;ll set up your queue.
            Customers can sign in separately with their mobile number.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <div className="card p-6 h-full flex flex-col gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl shadow-md">
                👤
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">I&apos;m a customer</h2>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Check your queue position with your mobile number. No password or business setup needed.
                </p>
              </div>
              <Link
                href="/login/patient"
                className="btn-primary w-full mt-auto"
              >
                Customer sign in
                <Icon.ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-3">
            {submitted ? (
              <div className="card p-8 text-center space-y-4">
                <div className="text-4xl">✅</div>
                <h2 className="text-xl font-semibold text-slate-900">Thank you!</h2>
                <p className="text-sm text-slate-600">
                  We&apos;ve received your details. Our team will reach out shortly to onboard your business.
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <Link href="/login/choose" className="btn-secondary">
                    Staff sign in
                  </Link>
                  <Link href="/" className="btn-ghost">
                    Back to home
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="card p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Register your business</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    First-time business owners — tell us about your business and we&apos;ll get you set up.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={businessNameId} className="text-sm font-medium">Business name</label>
                  <input
                    id={businessNameId}
                    className="input"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. City Care Clinic"
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={contactNameId} className="text-sm font-medium">Your name</label>
                  <input
                    id={contactNameId}
                    className="input"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Person in charge"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={emailId} className="text-sm font-medium">Email</label>
                  <input
                    id={emailId}
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <PhoneInput
                  value={phone}
                  onChange={(raw, result) => {
                    setPhone(raw);
                    setPhoneResult(result);
                  }}
                  required
                />

                {error && (
                  <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit registration'}
                </button>

                <p className="text-xs text-center text-slate-400">
                  Already have staff access?{' '}
                  <Link href="/login/choose" className="text-brand-600 hover:text-brand-700 font-medium">
                    Sign in →
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          <Link href="/" className="hover:text-slate-600 underline underline-offset-2">
            ← Back to homepage
          </Link>
        </p>
      </div>
    </main>
  );
}
