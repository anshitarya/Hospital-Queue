import Link from 'next/link';
import { BRAND } from '@/lib/config';

export const metadata = { title: 'Privacy Policy · ClinicQueue' };

const EFFECTIVE_DATE = '7 July 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-black text-white text-center px-4 py-16">
        <span className="inline-block rounded-full border border-red-500 text-red-400 text-xs font-semibold uppercase tracking-widest px-3 py-1 mb-6">
          Legal
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-sm text-slate-400">Effective Date: {EFFECTIVE_DATE}</p>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">← Back to Home</Link>
          <span>|</span>
          <Link href="/terms" className="hover:text-white transition-colors uppercase tracking-wide">
            Terms &amp; Conditions
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-14">

        <Section title="1. The Short Version">
          <p>
            ClinicQueue is a queue management tool for clinics. We collect the minimum information
            needed to make queues work — patient names and phone numbers for receptionists to add
            someone to a queue, and your phone number when you log in as a patient. We do not sell
            your data. We do not store medical records.
          </p>
          <p>
            This policy is intended to comply with the{' '}
            <strong>Digital Personal Data Protection Act, 2023 (DPDPA)</strong> of India.
          </p>
        </Section>

        <Section title="2. What We Collect and Why">

          <SubSection title="2.1 When a patient logs in">
            <p>
              Patients log in using their phone number and a one-time password (OTP). We store the
              phone number and a name (optionally provided) to identify the patient across visits and
              to show them their own queue history. We do not store the OTP after it is used.
            </p>
          </SubSection>

          <SubSection title="2.2 When reception adds a patient to the queue">
            <p>
              Receptionists enter a patient&apos;s name and phone number to register them in a doctor&apos;s
              queue. This creates a queue entry with a token number, a timestamp, and the assigned
              doctor. The phone number is used to send SMS or WhatsApp notifications about queue
              status (e.g., "2 people ahead of you", "it&apos;s your turn").
            </p>
          </SubSection>

          <SubSection title="2.3 Clinic staff and admin accounts">
            <p>
              When a clinic owner registers, we collect their name, email address, and phone number.
              Doctors and staff are added by invitation — we store their name, email, and role within
              the clinic. Passwords are hashed using bcrypt and never stored in plain text.
            </p>
          </SubSection>

          <SubSection title="2.4 Queue and visit data">
            <p>
              We record each queue entry: the token number, which doctor it was for, when the patient
              joined, their position transitions (waiting → in consultation → completed/missed/skipped),
              and the final outcome. This data powers the analytics dashboard for clinic admins and
              the visit history shown to patients.
            </p>
            <p>
              <strong>We do not record consultations.</strong> No prescription, diagnosis, clinical note,
              or medical record passes through ClinicQueue.
            </p>
          </SubSection>

          <SubSection title="2.5 Notifications">
            <p>
              SMS and WhatsApp notifications are sent via MSG91 and Meta&apos;s WhatsApp Business API.
              When we send a message, the patient&apos;s phone number is passed to these providers. Their
              own privacy policies govern how they handle that data.
            </p>
          </SubSection>

          <SubSection title="2.6 Technical data">
            <p>
              Like any web application, our servers log IP addresses, browser type, and request
              timestamps. We use this only for debugging and security monitoring — not for profiling
              or advertising.
            </p>
          </SubSection>
        </Section>

        <Section title="3. Real-Time Features">
          <p>
            ClinicQueue uses WebSockets (Socket.IO) to push live queue updates to all connected
            devices — patients see their position update in real time, and reception sees the full
            queue state live. The current queue state is held in Redis (an in-memory store) for
            speed; it is also persisted to our PostgreSQL database (hosted on Neon) for history and
            analytics.
          </p>
          <p>
            These connections are encrypted over TLS. No data is held in Redis beyond what is
            needed to serve the live queue.
          </p>
        </Section>

        <Section title="4. Who Can See What">
          <ul>
            <li>
              <strong>Patients</strong> can see only their own queue entries and visit history — not
              anyone else&apos;s.
            </li>
            <li>
              <strong>Doctors</strong> can see the queue for their own sessions and their own
              consultation history.
            </li>
            <li>
              <strong>Receptionists / Staff</strong> can see the full active queue and add or manage
              patients within their clinic.
            </li>
            <li>
              <strong>Clinic Admins</strong> can see analytics, full visit history, and manage staff
              within their clinic only. They cannot see data from other clinics.
            </li>
            <li>
              <strong>ClinicQueue team</strong> can access data only for debugging or support
              purposes, and only with a legitimate reason.
            </li>
          </ul>
        </Section>

        <Section title="5. Third-Party Services We Use">
          <ul>
            <li>
              <strong>Neon</strong> — PostgreSQL database hosting. All persistent data lives here.
            </li>
            <li>
              <strong>Fly.io</strong> — Infrastructure hosting for the API and web app.
            </li>
            <li>
              <strong>Redis (Upstash or self-hosted)</strong> — In-memory store for live queue state.
            </li>
            <li>
              <strong>MSG91</strong> — SMS and WhatsApp notifications sent to patients.
            </li>
            <li>
              <strong>Meta WhatsApp Business API</strong> — WhatsApp message delivery.
            </li>
          </ul>
          <p>
            We do not use Google Analytics, Facebook Pixel, or any advertising or tracking SDKs.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <ul>
            <li>
              <strong>Queue / visit history</strong> — retained indefinitely to power the analytics
              dashboard. You may request deletion at any time.
            </li>
            <li>
              <strong>Patient accounts</strong> — retained until you request deletion.
            </li>
            <li>
              <strong>Clinic accounts</strong> — retained for 30 days after subscription cancellation,
              then permanently deleted.
            </li>
            <li>
              <strong>Server logs</strong> — retained for 30 days, then purged.
            </li>
          </ul>
        </Section>

        <Section title="7. Your Rights">
          <p>Under the DPDPA 2023, you have the right to:</p>
          <ul>
            <li>Know what personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Withdraw consent for notification messages</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{' '}
            <a href={`mailto:${BRAND.contact.legalEmail}`} className="text-brand-600 hover:underline">
              {BRAND.contact.legalEmail}
            </a>{' '}
            or message us on WhatsApp. We will respond within 30 days.
          </p>
          <p>
            To stop receiving SMS or WhatsApp notifications, you can reply STOP to any message or
            contact the clinic reception who added you.
          </p>
        </Section>

        <Section title="8. Security">
          <p>
            All traffic is encrypted over HTTPS/TLS. Passwords are bcrypt-hashed. Database access
            is restricted to the application and is not publicly reachable. We review dependencies
            regularly for known vulnerabilities.
          </p>
          <p>
            If we ever discover a breach affecting your data, we will notify affected users promptly
            and take immediate steps to contain it.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            If we make material changes to how we handle your data, we will notify clinic admins by
            email before the changes take effect. The effective date at the top of this page will
            always reflect the current version.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>Questions or requests related to your privacy?</p>
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
        <Link href="/terms" className="hover:text-slate-700 transition-colors">Terms &amp; Conditions</Link>
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}
