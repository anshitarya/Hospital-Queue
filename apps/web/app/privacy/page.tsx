import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Hospital Queue collects, uses, and protects your data.',
};

/**
 * Privacy Policy — required by Google Play Store for all apps.
 * URL to add in Play Console: https://yourdomain.com/privacy
 *
 * Replace YOUR_CONTACT_EMAIL with your actual support email before going live.
 */
const CONTACT_EMAIL = 'support@hospitalqueue.in'; // ← change this

export default function PrivacyPage() {
  const updated = new Date('2025-01-01').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Minimal nav */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-xs shadow-sm">
              HQ
            </span>
            <span className="text-sm font-semibold text-slate-700">Hospital Queue</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-500">Privacy Policy</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
        </div>

        <Section title="Who we are">
          <p>
            Hospital Queue (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the service&rdquo;) is a
            real-time patient queue management platform for clinics in India. The service is
            accessible at{' '}
            <a href="https://hospitalqueue.in" className="text-brand-600 hover:underline">
              hospitalqueue.in
            </a>{' '}
            and as a mobile app on Google Play.
          </p>
        </Section>

        <Section title="Data we collect">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Phone number</strong> (patients) — collected when you sign in with an OTP.
              Used solely to authenticate your session and associate you with your queue position.
            </li>
            <li>
              <strong>Name and contact details</strong> (clinic staff — doctors, receptionists,
              admins) — provided during account creation. Used to identify you within your clinic.
            </li>
            <li>
              <strong>Queue activity</strong> — token number, timestamps, doctor assignment, queue
              status. Retained for your visit history and clinic reporting.
            </li>
            <li>
              <strong>Device and session data</strong> — IP address, browser / app version, and
              access timestamps. Collected automatically for security and debugging.
            </li>
          </ul>
          <p className="mt-3">
            We do <strong>not</strong> collect medical records, diagnosis, prescriptions, or any
            clinical information.
          </p>
        </Section>

        <Section title="How we use your data">
          <ul className="list-disc pl-5 space-y-2">
            <li>To manage patient queues in real time and send live position updates.</li>
            <li>To send OTP messages for authentication via SMS.</li>
            <li>To show clinic admins aggregated usage statistics (number of patients, doctors, etc.).</li>
            <li>To debug errors and maintain service reliability.</li>
          </ul>
          <p className="mt-3">
            We do <strong>not</strong> sell, rent, or share your personal data with third parties
            for advertising or commercial purposes.
          </p>
        </Section>

        <Section title="Third-party services">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>MSG91</strong> — SMS gateway used to send OTP codes to patients. Only your
              phone number is shared, strictly for OTP delivery. MSG91&apos;s privacy policy is
              available at{' '}
              <a href="https://msg91.com/privacy" className="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">
                msg91.com/privacy
              </a>.
            </li>
          </ul>
        </Section>

        <Section title="Data storage and security">
          <p>
            All data is stored on servers located in <strong>Bangalore, India</strong> (DigitalOcean
            BLR1 data centre). Passwords are hashed with Argon2; plaintext passwords are never
            stored. Data in transit is encrypted via HTTPS (TLS 1.2+).
          </p>
        </Section>

        <Section title="Data retention">
          <ul className="list-disc pl-5 space-y-2">
            <li>Queue activity records are retained for 12 months and then deleted.</li>
            <li>
              Staff accounts are retained until the clinic admin removes them or the clinic account
              is closed.
            </li>
            <li>Patient accounts are retained until you request deletion (see below).</li>
          </ul>
        </Section>

        <Section title="Your rights and data deletion">
          <p>
            You may request deletion of your account and all associated personal data at any time by
            emailing{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
            . We will process the request within 30 days.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            Hospital Queue is not directed at children under 13. We do not knowingly collect
            personal data from anyone under 13. If you believe a minor has provided us with personal
            data, contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. The &ldquo;Last updated&rdquo; date at the
            top of this page indicates when the most recent change was made. Continued use of the
            service after an update constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or requests relating to your personal data:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </main>

      <footer className="border-t border-slate-200 mt-8 py-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Hospital Queue. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
