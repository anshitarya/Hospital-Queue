'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FAQ, FAQItem } from '@/components/FAQ';
import { Icon } from '@/components/Icons';

type FAQCategory = 'patient' | 'staff' | 'settings';

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<FAQCategory>('patient');
  const [searchQuery, setSearchQuery] = useState('');

  const patientFAQs: FAQItem[] = [
    {
      q: 'How do I join the queue?',
      a: (
        <div className="space-y-2">
          <p>You can join the queue in two ways:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              <strong>Self-Booking:</strong> Scan the clinic's QR code or visit the clinic booking page, enter your mobile number and name, verify with OTP, choose a doctor, and select <strong>Join Queue</strong>.
            </li>
            <li>
              <strong>Reception Walk-in:</strong> Request the clinic receptionist to add you. They will enter your details, and you will receive a confirmation SMS.
            </li>
          </ol>
        </div>
      ),
    },
    {
      q: 'What is the 3-letter token code (e.g. #PVM, #FOF)?',
      a: (
        <p>
          Sequential numbers (like 1, 2, 3...) feel clinical and can cause anxiety. To make your visit feel premium and friendly, Turnos automatically shuffles your ticket number into an easy-to-read <strong>3-letter code</strong> (like <strong>#PVM</strong>). This is your unique ticket for the day. You will see it on the live queue display and in your SMS updates.
        </p>
      ),
    },
    {
      q: 'How do I track my position and ETA live?',
      a: (
        <p>
          Once you join, you will receive an SMS containing a live tracking link. You can also view it directly on the patient portal dashboard. The dashboard shows your exact position in the queue, the number of patients ahead of you, and a dynamically updating Estimated Time of Arrival (ETA).
        </p>
      ),
    },
    {
      q: 'How do I enable Push Notifications?',
      a: (
        <p>
          On the patient portal tracking page, click the <strong>"Enable Live Notifications"</strong> bell icon. Accept the browser permission prompt. Turnos will notify you in real-time when it is almost your turn, even if your phone screen is locked or you have closed the browser tab.
        </p>
      ),
    },
    {
      q: 'What if I miss my turn or get delayed?',
      a: (
        <p>
          If you are not present when called, the doctor or receptionist will mark you as <strong>"Missed"</strong>. You won't lose your booking! Turnos places you in a temporary holding queue and will re-insert you automatically after a short gap (based on the clinic's configured Missed Gap setting, usually 3–4 patients) once you notify the receptionist that you have arrived.
        </p>
      ),
    },
  ];

  const staffFAQs: FAQItem[] = [
    {
      q: 'How do I start a consultation with the next patient?',
      a: (
        <p>
          On the Reception or Doctor Dashboard, select your doctor from the top panel. Locate the patient at the top of the **Live Queue** list, and click the green <strong>Call Patient</strong> or <strong>Start Consultation</strong> button. This updates the patient's status to "In Consultation" and triggers the display screen announcement.
        </p>
      ),
    },
    {
      q: 'What is the difference between Walk-in, Follow-up, and Appointment priorities?',
      a: (
        <div className="space-y-2">
          <p>Turnos supports multiple patient flow classes to handle real-world clinical queues:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Walk-in:</strong> Regular walk-in patients. They are inserted based on the clinic's walk-in heuristic settings (usually at the end of the queue or inserted after N patients).</li>
            <li><strong>Follow-up:</strong> Returning patients checking reports or having quick consultations. They can be prioritized in settings to get served faster.</li>
            <li><strong>Appointment:</strong> Scheduled bookings. They have high priority and are placed near the front based on their time slot.</li>
          </ul>
        </div>
      ),
    },
    {
      q: 'How do I manage missed patients who have returned?',
      a: (
        <p>
          When a missed patient arrives, locate their name in the <strong>Missed Patients</strong> tab at the bottom of your dashboard, and click <strong>Rejoin Queue</strong>. Turnos will automatically re-schedule them into the active queue with a fair insertion gap.
        </p>
      ),
    },
    {
      q: 'How do I take a break or go offline?',
      a: (
        <p>
          If you need to leave your desk or take a break, click the status button next to your name at the top left of the dashboard and change your status to <strong>On Break</strong>. You can enter a break duration and note. The system will adjust patient ETAs and display a friendly notice to waiting patients.
        </p>
      ),
    },
  ];

  const settingsFAQs: FAQItem[] = [
    {
      q: 'What is the "Walk-in Insertion Gap" setting?',
      a: (
        <p>
          This setting defines how self-booked walk-in patients are mixed with scheduled appointments. For example, if set to <strong>4</strong>, a walk-in patient will be placed at least 4 spots behind the currently serving patient, leaving space for pre-booked appointments while preventing walk-in starvation.
        </p>
      ),
    },
    {
      q: 'How do I configure weekly working hours and schedules?',
      a: (
        <p>
          Go to the **Schedule** tab on the Clinic settings page. Select a doctor and location, and add shift blocks (e.g., Monday 09:00 - 13:00 and 14:00 - 18:00). You can also set custom daily capacity limits per shift to prevent overloading your staff.
        </p>
      ),
    },
    {
      q: 'How do I add a new Doctor or Receptionist?',
      a: (
        <div className="space-y-2">
          <p>As a Clinic Admin or Manager:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Go to the **Staff Management** page.</li>
            <li>Click <strong>Add Staff</strong> and select the role (Doctor or Receptionist).</li>
            <li>Enter their name and specialization. Emails and phone numbers are optional.</li>
            <li>The system will generate a unique <strong>Login ID</strong> (e.g., `DOC-5012`) and a temporary 6-digit passcode. Copy these credentials and share them with the new staff member.</li>
          </ol>
        </div>
      ),
    },
    {
      q: 'How do I configure multiple branches/locations?',
      a: (
        <p>
          Go to **Clinic Settings** &rarr; **Locations**. Click <strong>Add Location</strong> to create a new branch. You can then assign specific receptionists to that branch, assign doctors to work shifts at that location, and view distinct, isolated queue lists for each branch.
        </p>
      ),
    },
  ];

  const allItems = {
    patient: patientFAQs,
    staff: staffFAQs,
    settings: settingsFAQs,
  };

  const getFilteredItems = (category: FAQCategory) => {
    const items = allItems[category];
    if (!searchQuery) return items;
    return items.filter(
      (item) =>
        item.q.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredPatient = getFilteredItems('patient');
  const filteredStaff = getFilteredItems('staff');
  const filteredSettings = getFilteredItems('settings');

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': 'How do I join the queue?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'You can join the queue in two ways: 1. Self-Booking (scan clinic QR code or visit booking page, verify via mobile OTP and select Join Queue) or 2. Reception Walk-in (ask the receptionist to add you).'
        }
      },
      {
        '@type': 'Question',
        'name': 'What is the 3-letter token code (e.g. #PVM, #FOF)?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Sequential numbers feel clinical and cause anxiety. Turnos shuffles your ticket into a friendly 3-letter code (like #PVM) which is shown on the live display and sent via SMS.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I track my position and ETA live?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Once you join, you receive an SMS with a live tracking link. You can view your exact queue position, patients ahead of you, and dynamic Estimated Time of Arrival (ETA) on the patient dashboard.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I enable Push Notifications?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Click the "Enable Live Notifications" bell icon on the patient portal and accept browser permissions. Turnos will notify you in real-time when it is almost your turn, even if your phone screen is locked.'
        }
      },
      {
        '@type': 'Question',
        'name': 'What if I miss my turn or get delayed?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'If you miss your call, staff mark you as "Missed". Turnos holds your booking and re-inserts you automatically after a short gap (e.g. 3-4 patients) once you notify the front desk of your arrival.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I start a consultation with the next patient?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'On the Reception or Doctor Dashboard, select your doctor, locate the top patient in the live queue list, and click green "Call Patient" or "Start Consultation" button.'
        }
      },
      {
        '@type': 'Question',
        'name': 'What is the difference between Walk-in, Follow-up, and Appointment priorities?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Turnos supports three patient flows: Walk-in (added dynamically based on insertion gap configurations), Follow-up (returning patients checking quick reports, prioritized to get served faster), and Appointment (scheduled time slots placed near the front).'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I manage missed patients who have returned?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'When a missed patient returns, click "Rejoin Queue" on the dashboard Missed Patients tab to place them back into the active queue with a fair gap.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I take a break or go offline?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Click your status next to your name at the top left of the dashboard and select "On Break". You can enter a break duration and note, adjusting waiting patient ETAs instantly.'
        }
      },
      {
        '@type': 'Question',
        'name': 'What is the "Walk-in Insertion Gap" setting?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'This defines how self-booked walk-ins mix with pre-booked appointments. A gap of 4 means a walk-in is placed at least 4 spots behind the current serving patient, ensuring appointments are prioritized.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I configure weekly working hours and schedules?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Go to the Schedule tab on the Clinic settings page, select a doctor, and add shift blocks (e.g. 09:00 - 13:00). You can also set daily capacity limits.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I add a new Doctor or Receptionist?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'As Clinic Admin, go to Staff Management, click Add Staff, choose role, input details, and Turnos will generate a unique Login ID (e.g., DOC-5012) and passcode.'
        }
      },
      {
        '@type': 'Question',
        'name': 'How do I configure multiple branches/locations?',
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': 'Go to Clinic Settings -> Locations, click Add Location, and assign receptionists, doctors, and shifts to that branch.'
        }
      }
    ]
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
            <Icon.Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Support Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            How can we help you?
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
            Detailed guides, steps, and feature walkthroughs for patients, clinic staff, and administrators.
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-lg mx-auto">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon.Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search FAQs (e.g. token, gap, push)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/60 rounded-2xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-lg backdrop-blur-md"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
            >
              <Icon.X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveCategory('patient')}
            className={`flex-1 pb-4 text-sm font-semibold border-b-2 text-center transition-all ${
              activeCategory === 'patient'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Patients Portal
          </button>
          <button
            onClick={() => setActiveCategory('staff')}
            className={`flex-1 pb-4 text-sm font-semibold border-b-2 text-center transition-all ${
              activeCategory === 'staff'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Clinic Staff Portal
          </button>
          <button
            onClick={() => setActiveCategory('settings')}
            className={`flex-1 pb-4 text-sm font-semibold border-b-2 text-center transition-all ${
              activeCategory === 'settings'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Clinic settings
          </button>
        </div>

        {/* FAQ Accordions */}
        <div className="space-y-6">
          {activeCategory === 'patient' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon.User className="h-5 w-5 text-emerald-400" />
                Patient Portal FAQs
              </h2>
              {filteredPatient.length > 0 ? (
                <FAQ items={filteredPatient} />
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm card bg-slate-800/20">No matching FAQs found.</div>
              )}
            </div>
          )}

          {activeCategory === 'staff' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon.Users className="h-5 w-5 text-emerald-400" />
                Clinic Staff FAQs
              </h2>
              {filteredStaff.length > 0 ? (
                <FAQ items={filteredStaff} />
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm card bg-slate-800/20">No matching FAQs found.</div>
              )}
            </div>
          )}

          {activeCategory === 'settings' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon.Settings className="h-5 w-5 text-emerald-400" />
                Admin & Settings FAQs
              </h2>
              {filteredSettings.length > 0 ? (
                <FAQ items={filteredSettings} />
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm card bg-slate-800/20">No matching FAQs found.</div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-800 text-xs sm:text-sm text-slate-400">
          <Link href="/" className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors">
            <Icon.ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-emerald-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-emerald-400 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
