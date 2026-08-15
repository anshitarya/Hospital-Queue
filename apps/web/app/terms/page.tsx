import Link from 'next/link';
import { BRAND } from '@/lib/config';

export const metadata = {
  title: 'Terms & Conditions · Turnos',
  alternates: {
    canonical: '/terms',
  },
};

const EFFECTIVE_DATE = '7 July 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-black text-white text-center px-4 py-16">
        <span className="inline-block rounded-full border border-red-500 text-red-400 text-xs font-semibold uppercase tracking-widest px-3 py-1 mb-6">
          Legal
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">Terms &amp; Conditions</h1>
        <p className="text-sm text-slate-400">Effective Date: {EFFECTIVE_DATE}</p>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">← Back to Home</Link>
          <span>|</span>
          <Link href="/privacy" className="hover:text-white transition-colors uppercase tracking-wide">
            Privacy Policy
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-14">

        <Section title="1. Who These Terms Apply To">
          <p>
            These Terms &amp; Conditions govern your use of Turnos (&quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;),
            a digital queue management service for businesses in India. By creating an account or
            using any part of the platform — whether as a business owner, staff member, service provider,
            or customer — you agree to these Terms.
          </p>
          <p>
            If you are registering a business on behalf of an organisation, you confirm that you have the
            authority to bind that organisation to these Terms.
          </p>
        </Section>

        <Section title="2. What Turnos Does">
          <p>
            Turnos replaces paper token systems with a live, browser-based queue. Here is what
            the platform actually does:
          </p>
          <ul>
            <li>
              <strong>Customers</strong> log in with their phone number (OTP-based) and can see their live
              queue position, estimated wait time, and get notified via SMS or WhatsApp when their turn
              is near — without installing an app.
            </li>
            <li>
              <strong>Front-desk staff</strong> register customers into a provider&apos;s queue, manage walk-ins,
              and get a live dashboard showing the full queue state.
            </li>
            <li>
              <strong>Service providers</strong> can call the next customer, skip, mark as missed, pause their queue,
              and view their own service history.
            </li>
            <li>
              <strong>Business admins</strong> get an analytics dashboard — booking trends, provider-wise
              completion rates, and visit history with filters.
            </li>
          </ul>
          <p>
            Turnos is a queue coordination tool only. We do not store prescriptions, diagnoses,
            financial transaction records, or any other sensitive business records beyond what is
            needed to run the queue.
          </p>
        </Section>

        <Section title="3. Accounts &amp; Access">
          <p>
            Business staff accounts are created by invitation. Business admins invite providers and staff;
            customers create their own accounts using their phone number. You are responsible for:
          </p>
          <ul>
            <li>Keeping your login credentials confidential</li>
            <li>All activity that happens under your account</li>
            <li>Notifying us immediately if you suspect unauthorized access</li>
          </ul>
          <p>
            We may suspend or terminate accounts that are used fraudulently, abusively, or in violation
            of these Terms — without prior notice if the situation warrants it.
          </p>
        </Section>

        <Section title="4. Business Access &amp; Fees">
          <p>
            Turnos is free for customers. Businesses pay to use the platform. Pricing, plan limits,
            and billing terms are agreed when your business is onboarded — contact us to get started.
          </p>
          <p>
            Unless otherwise agreed in writing, access continues for the period you have paid for.
            You may request cancellation at any time; we will confirm the effective end date.
            Refunds, if any, are handled per your onboarding agreement.
          </p>
        </Section>

        <Section title="5. Fair Use">
          <p>You agree not to misuse the platform. Specifically, you must not:</p>
          <ul>
            <li>Use Turnos for anything other than legitimate business queue management</li>
            <li>Add fake customers or generate fraudulent queue entries to manipulate analytics</li>
            <li>Attempt to access another business&apos;s data, queues, or admin panel</li>
            <li>Scrape, reverse-engineer, or copy any part of the platform</li>
            <li>Overload the system with automated requests</li>
          </ul>
        </Section>

        <Section title="6. Customer Data Responsibility">
          <p>
            When your business uses Turnos, you collect customer names and phone numbers to register
            them in the queue. As the business owner, you are the data fiduciary for that data under the
            Digital Personal Data Protection Act, 2023. You are responsible for:
          </p>
          <ul>
            <li>Informing customers that their name and phone number will be used for queue management</li>
            <li>Obtaining any consent required under applicable law</li>
            <li>Not using Turnos to collect more customer information than is necessary for queue management</li>
          </ul>
        </Section>

        <Section title="7. Uptime &amp; Reliability">
          <p>
            We host Turnos on Fly.io with a PostgreSQL database (Neon) and Redis for real-time
            queue state. We aim for high availability but do not guarantee 100% uptime. Scheduled
            maintenance will be communicated in advance where possible.
          </p>
          <p>
            Real-time features (live position updates, automatic call-next notifications) depend on a
            persistent WebSocket connection. These may be unavailable on very poor network connections.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>
            Turnos is a queue coordination tool. We are not liable for service outcomes, missed
            customers due to connectivity issues, or disputes between business staff and customers. Our
            total liability for any claim is capped at the fees you paid us in the 3 months preceding
            the claim.
          </p>
        </Section>

        <Section title="9. Intellectual Property">
          <p>
            Everything on the Turnos platform — the software, design, branding, and dashboards —
            belongs to us. You may not copy, resell, white-label, or build derivative products from it
            without written permission.
          </p>
          <p>
            Your business&apos;s data (customer queue entries, visit history, analytics) belongs to you. We process
            it on your behalf.
          </p>
        </Section>

        <Section title="10. Changes to These Terms">
          <p>
            We may update these Terms as the product evolves. For significant changes, we will email
            registered business admins at least 7 days in advance. Continued use after that date
            constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms are governed by the laws of India. Any disputes shall be resolved under the
            jurisdiction of competent courts in India.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>Questions about these Terms?</p>
          <ul>
            <li>
              Email:{' '}
              <a href={`mailto:${BRAND.contact.legalEmail}`} className="text-brand-600 hover:underline">
                {BRAND.contact.legalEmail}
              </a>
            </li>
            <li>
              WhatsApp:{' '}
              <a
                href={`https://wa.me/${BRAND.contact.phoneWhatsapp}`}
                className="text-brand-600 hover:underline"
              >
                {BRAND.contact.phone}
              </a>
            </li>
          </ul>
        </Section>

      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 py-8 text-center text-xs text-slate-400 space-x-4">
        <Link href="/privacy" className="hover:text-slate-700 transition-colors">Privacy Policy</Link>
        <span>·</span>
        <Link href="/" className="hover:text-slate-700 transition-colors">← Back to Home</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">{title}</h2>
      <div className="space-y-3 text-slate-600 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-slate-800">
        {children}
      </div>
    </section>
  );
}
