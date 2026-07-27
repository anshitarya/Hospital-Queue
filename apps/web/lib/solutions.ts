export interface SolutionData {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  kicker: string;
  heroTitle: string;
  heroSubtitle: string;
  demoType: 'patient' | 'reception' | 'doctor';
  benefits: { title: string; desc: string; iconName: 'Clock' | 'Users' | 'Building' | 'User' | 'Check' | 'ArrowRight' | 'ArrowLeft' | 'ClipboardList' }[];
  ctaText: string;
  faqs: { q: string; a: string }[];
}

export const SOLUTIONS: Record<string, SolutionData> = {
  'clinic-queue-management-software': {
    slug: 'clinic-queue-management-software',
    title: 'Clinic Queue Management Software',
    metaTitle: 'Clinic Queue Management Software · Turnos',
    metaDescription: 'Eliminate clinic waiting room crowding with Turnos. Patients get real-time token tracking & ETAs on their phone. Multi-doctor ready.',
    keywords: ['clinic queue management', 'waiting room software', 'clinic token system', 'turnos'],
    kicker: 'For Clinics & Outpatient Centers',
    heroTitle: 'Smooth, patient-first clinic queue management software.',
    heroSubtitle: 'Keep your waiting room calm. Patients track their token position and live ETAs on their phone while doctors call the next patient in one tap.',
    demoType: 'reception',
    benefits: [
      { title: 'Calmer Waiting Rooms', desc: 'Patients wait in their car or nearby cafes instead of crowding your clinic entrance.', iconName: 'Users' },
      { title: 'Multi-Doctor Dashboards', desc: 'Manage independent queues for multiple doctors from a single receptionist screen.', iconName: 'Building' },
      { title: 'Accurate Live ETAs', desc: 'Our smart algorithm calculates wait times based on actual consultation durations.', iconName: 'Clock' }
    ],
    ctaText: 'Start optimizing your clinic queue',
    faqs: [
      { q: 'Do patients need to download an app?', a: 'No. Patients just scan a QR code or click a link to view their live token status on their browser.' },
      { q: 'Can it handle multiple doctors?', a: 'Yes. Turnos is designed for multi-provider clinics. The receptionist panel controls token assignment across all doctors.' }
    ]
  },
  'patient-queue-management-system': {
    slug: 'patient-queue-management-system',
    title: 'Patient Queue Management System',
    metaTitle: 'Patient Queue Management System · Turnos',
    metaDescription: 'Keep patients informed with our live virtual queue system. Show real-time ETAs, queue positions, and status updates on mobile.',
    keywords: ['patient queue system', 'hospital token display', 'virtual patient queue'],
    kicker: 'Patient-First Waiting Experience',
    heroTitle: 'The patient queue management system that builds trust.',
    heroSubtitle: 'No more patient anxiety. Give every patient a live virtual token on their phone showing exactly how many people are ahead of them.',
    demoType: 'patient',
    benefits: [
      { title: 'Real-Time Transparency', desc: 'Show patients their live position, reducing inquiry load on your front desk.', iconName: 'Check' },
      { title: 'Zero App Installs', desc: 'Works instantly on any mobile browser through a secure token web link.', iconName: 'User' },
      { title: 'Automatic Alerts', desc: 'Notify patients when it is their turn via live browser updates or messaging.', iconName: 'ArrowRight' }
    ],
    ctaText: 'Get started for free',
    faqs: [
      { q: 'How do patients join the queue?', a: 'Staff can add patients manually at the reception, or patients can scan a QR code at the entrance to self-register.' },
      { q: 'Is patient data secure?', a: 'Yes. Turnos follows data privacy best practices and only requires minimal info (like name/phone) to issue a token.' }
    ]
  },
  'doctor-waiting-list-software': {
    slug: 'doctor-waiting-list-software',
    title: 'Doctor Waiting List Software',
    metaTitle: 'Doctor Waiting List Software · Turnos',
    metaDescription: 'Manage doctor patient waiting lists in real-time. tap next from your phone or tablet to call patients. Zero delay.',
    keywords: ['doctor waiting list', 'doctor call system', 'clinic walk-in management'],
    kicker: 'For Private Practitioners',
    heroTitle: 'Efficient doctor waiting list software to streamline your day.',
    heroSubtitle: 'Focus on patients, not queue coordination. Call the next patient directly from your doctor dashboard in a single tap.',
    demoType: 'doctor',
    benefits: [
      { title: 'One-Tap Calling', desc: 'Doctors call next patients from any phone, tablet, or PC without raising their voice.', iconName: 'Users' },
      { title: 'Smart Delay Tracking', desc: 'Automatically adjusts patient ETAs if a consultation runs longer than expected.', iconName: 'Clock' },
      { title: 'No Hardware Needed', desc: 'Works entirely in the cloud. No expensive token display screens or pagers required.', iconName: 'Building' }
    ],
    ctaText: 'Streamline your practice',
    faqs: [
      { q: 'Can I use it on my phone during consultations?', a: 'Yes, the doctor dashboard is fully optimized for mobile devices and tablets, allowing one-tap flow.' },
      { q: 'What happens if a patient is late?', a: 'You can easily mark them as "Delayed" or "No Show" from the doctor screen, letting you serve the next patient immediately.' }
    ]
  },
  'hospital-token-management-system': {
    slug: 'hospital-token-management-system',
    title: 'Hospital Token Management System',
    metaTitle: 'Hospital Token Management System · Turnos',
    metaDescription: 'Enterprise token management system for hospitals and diagnostic centers. Support waiting room TVs, SMS notifications, and multi-department routing.',
    keywords: ['hospital token system', 'departmental queue system', 'diagnostic center token management'],
    kicker: 'Enterprise Token Routing',
    heroTitle: 'Scalable hospital token management system.',
    heroSubtitle: 'Coordinate waiting flows across multiple departments, lab counters, and pharmacies. Integrated TV display support for waiting areas.',
    demoType: 'reception',
    benefits: [
      { title: 'TV Display Boards', desc: 'Cast your live token board to any smart TV in the waiting room for patient visibility.', iconName: 'Users' },
      { title: 'Department Routing', desc: 'Seamlessly transfer patients from consultation rooms to diagnostic labs or pharmacy queues.', iconName: 'ArrowLeft' },
      { title: 'Comprehensive Analytics', desc: 'Track waiting times, staff serving speeds, and patient volume across all counters.', iconName: 'ClipboardList' }
    ],
    ctaText: 'Talk to sales',
    faqs: [
      { q: 'Can we display the queue on a TV?', a: 'Yes. Turnos has a dedicated `/display/{doctorId}` URL that is optimized for smart TVs and display monitors.', }
    ]
  }
};
