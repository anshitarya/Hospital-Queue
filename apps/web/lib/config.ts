/**
 * Central config for static content on the public site.
 *
 * Anything you might want to tweak without touching components — phone number,
 * demo data, FAQs, feature list, video links — lives here. Components import
 * from this file; designers and product folks can change copy in one place.
 *
 * Rule of thumb:
 *   - Copy / text → here
 *   - Numbers shown to users (durations, counts) → here
 *   - Lists of options (departments, roles, FAQs) → here
 *   - Anything truly dynamic (data fetched from API) → NOT here
 */

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Brand / contact                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

export const BRAND = {
  name: 'Hospital Queue',
  shortName: 'HQ',
  tagline: 'Skip the waiting room. Arrive when it’s your turn.',
  contact: {
    phone: '+91 93521 33655',
    phoneTel: '+919352133655',          // for tel: links
    phoneWhatsapp: '919352133655',      // for wa.me links
    email: 'anshit.arya@flipkart.com',
    hours: '9 AM–8 PM IST',
  },
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Demo / animation pacing                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const DEMO_TIMING = {
  // Per-step duration for each demo animation. Higher = slower / more readable.
  patientStepMs: 2800,
  receptionStepMs: 2600,
  doctorStepMs: 2600,

  // How long the "tap" ripple stays visible before the action fires.
  tapRippleMs: 700,

  // How long the typing animation takes per character (in PatientDemo).
  typeIntervalMs: 110,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Demo data (used by the animated landing-page mockups)                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export const DEMO_DATA = {
  patient: {
    phone: '98765 43210',
    otpDigits: ['4', '8', '2', '1', '9', '3'],
    doctorName: 'Dr. Anjali Sharma',
    doctorSpecialty: 'General Medicine',
    yourToken: 14,
    nowServingStart: 11,         // ETA starts here and ticks up to your token
    initialAhead: 3,
    initialEtaMinutes: 18,
  },
  reception: {
    newPatientName: 'Priya Nair',
    newTokenNumber: 14,
    initialQueue: [
      { n: 11, name: 'Rahul K.' },
      { n: 12, name: 'Simran T.' },
      { n: 13, name: 'Arjun M.' },
    ],
  },
  doctor: {
    initialQueue: [
      { n: 11, name: 'Rahul K.' },
      { n: 12, name: 'Simran T.' },
      { n: 13, name: 'Arjun M.' },
      { n: 14, name: 'Priya N.' },
    ],
    avgConsultMinutes: 8,
  },
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Landing page — features                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface FeatureItem {
  iconName: keyof typeof import('@/components/Icons').Icon;
  title: string;
  body: string;
  span?: string;
}

export const FEATURES: FeatureItem[] = [
  {
    iconName: 'Clock',
    title: 'Live ETA — not guesses',
    body: 'Each token shows minutes until your turn, recomputed every time the doctor finishes a patient.',
    span: 'sm:col-span-2',
  },
  {
    iconName: 'Zap',
    title: 'Instant socket updates',
    body: 'Patient phones and TV displays update the moment reception or the doctor acts.',
  },
  {
    iconName: 'Smartphone',
    title: 'Works on any phone',
    body: 'No app to install. Patients sign in with a phone number and OTP.',
  },
  {
    iconName: 'Users',
    title: 'Roles done right',
    body: 'Patient, receptionist, doctor and admin — each gets a focused dashboard with the right controls.',
    span: 'sm:col-span-2',
  },
  {
    iconName: 'Building',
    title: 'Multi-clinic ready',
    body: 'One deployment serves many clinics. Admin invites receptionists; each clinic stays isolated.',
  },
  {
    iconName: 'Shield',
    title: 'Built for production',
    body: 'JWT auth, rate limits, audit log, idempotent reception forms, daily backups baked in.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Landing page — FAQs                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do patients sign in?',
    a: 'Patients open the link, enter their mobile number, and receive a 6-digit OTP. After verifying, they see a live card with their token number, current serving token, people ahead, and an estimated wait time — all updating in real time without refreshing.',
  },
  {
    q: 'Do patients need to install an app?',
    a: 'No. Hospital Queue runs entirely in the browser. Patients just open the link the clinic shares — works on any phone, tablet or computer.',
  },
  {
    q: 'How do clinics get started?',
    a: 'The admin creates a clinic and generates an invite code. Share the code (or the registration link) with your receptionist via WhatsApp or SMS — they sign up with their phone number, password, and the code. They can then add doctors and start managing the queue immediately.',
  },
  {
    q: 'Can one system serve multiple clinics?',
    a: 'Yes. Each clinic has its own receptionists, doctors and queue — fully isolated. The admin can manage many clinics from one dashboard, generating invite codes for each.',
  },
  {
    q: 'How accurate is the ETA?',
    a: 'ETA = remaining time for the current consultation + (people ahead × the doctor’s average consult time) + any delay the doctor declares. The doctor’s average is updated automatically from real consultation durations, so it adapts to how each doctor actually works.',
  },
  {
    q: 'What happens if the doctor runs late or takes a break?',
    a: 'The doctor can pause the queue or set a delay — both update every patient’s ETA instantly so no one is misled. Patients see the new wait time on their phone within a second.',
  },
  {
    q: 'Can I show a waiting-room TV display?',
    a: 'Yes — every doctor has a public display URL at /display/<doctorId>. Open it on any browser plugged into the waiting-room TV. It shows the current token in huge type plus the next five up.',
  },
  {
    q: 'Is patient data secure?',
    a: 'Yes. All traffic runs over HTTPS, passwords are hashed with Argon2, JWT sessions expire after 7 days, and each clinic’s data is scoped so receptionists from one clinic can never see another’s queue. Daily database backups are taken automatically.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Hero stats strip                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

export const HERO_STATS = [
  { v: '< 1s', l: 'Update latency' },
  { v: '0 apps', l: 'For patients to install' },
  { v: '∞', l: 'Clinics per deployment' },
  { v: '24/7', l: 'Live queue sync' },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Hospital departments (alphabetical)                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Standard list of hospital/clinic departments — kept in alphabetical order.
 * Used to seed the database and as a fallback for any department picker.
 *
 * To add or remove a department, edit this list and re-run `prisma db seed`.
 */
export const HOSPITAL_DEPARTMENTS: string[] = [
  'Allergy & Immunology',
  'Anesthesiology',
  'Ayurveda',
  'Cardiology',
  'Cardiothoracic Surgery',
  'Dental & Maxillofacial',
  'Dermatology',
  'Diabetology & Endocrinology',
  'Emergency Medicine',
  'ENT (Otolaryngology)',
  'Family Medicine',
  'Gastroenterology',
  'General Medicine',
  'General Surgery',
  'Geriatrics',
  'Gynecology & Obstetrics',
  'Hematology',
  'Hepatology',
  'Homeopathy',
  'Infectious Diseases',
  'Internal Medicine',
  'Nephrology',
  'Neurology',
  'Neurosurgery',
  'Nutrition & Dietetics',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Pain Management',
  'Pathology',
  'Pediatrics',
  'Physiotherapy & Rehabilitation',
  'Plastic & Reconstructive Surgery',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
  'Rheumatology',
  'Sports Medicine',
  'Urology',
  'Vascular Surgery',
];
