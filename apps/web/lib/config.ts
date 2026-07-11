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
  name: 'Turnos',
  shortName: 'T',
  tagline: 'Skip the wait. Arrive when it\'s your turn.',
  contact: {
    phone: '+91 94147 71828',
    phoneTel: '+919414771828',          // for tel: links
    phoneWhatsapp: '919414771828',      // for wa.me links
    email: 'anshit.arya@flipkart.com',
    legalEmail: 'hello@turnos.fly.dev', // shown on legal pages — update when domain is live
    hours: '9 AM–8 PM IST',
  },
  // Replace with your Google Form short link for user reviews
  doctorSurveyUrl: 'https://forms.gle/dy6eZe8yaz7XbtAP8',
};

export const FORMS = {
  reviewUrl:
    process.env.NEXT_PUBLIC_REVIEW_FORM_URL ??
    process.env.NEXT_PUBLIC_GOOGLE_REVIEW_FORM_URL ??
    BRAND.doctorSurveyUrl,
  businessSignup: {
    actionUrl: process.env.NEXT_PUBLIC_BUSINESS_SIGNUP_FORM_ACTION ?? '',
    viewUrl:
      process.env.NEXT_PUBLIC_BUSINESS_SIGNUP_FORM_URL ??
      'https://forms.gle/dy6eZe8yaz7XbtAP8',
    fields: {
      businessName: process.env.NEXT_PUBLIC_BUSINESS_FORM_ENTRY_BUSINESS ?? '',
      contactName: process.env.NEXT_PUBLIC_BUSINESS_FORM_ENTRY_NAME ?? '',
      email: process.env.NEXT_PUBLIC_BUSINESS_FORM_ENTRY_EMAIL ?? '',
      mobile: process.env.NEXT_PUBLIC_BUSINESS_FORM_ENTRY_MOBILE ?? '',
    },
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
    title: 'Know exactly when it\'s your turn',
    body: 'Customers see a live countdown — "~12 minutes" — that updates every time the provider finishes. No more guessing or asking the front desk.',
    span: 'sm:col-span-2',
  },
  {
    iconName: 'Smartphone',
    title: 'No app to download',
    body: 'Customers just open a link on their phone and log in with an OTP. Works on any Android or iPhone, any browser.',
  },
  {
    iconName: 'Zap',
    title: 'Every screen updates live',
    body: 'The moment a provider calls the next customer, all phones and displays update instantly — no refresh needed.',
  },
  {
    iconName: 'Bell',
    title: 'Get notified before your turn',
    body: 'The customer\'s screen flashes and they get an alert when they are 2–3 spots away. They can wait outside or nearby instead of crowding the room.',
    span: 'sm:col-span-2',
  },
  {
    iconName: 'Shield',
    title: 'Urgent cases go first — always',
    body: 'Staff can mark any entry as urgent with one tap. They jump straight to the front of the queue.',
  },
  {
    iconName: 'Heart',
    title: 'Missed your call? Rejoin easily',
    body: 'If a customer steps out and misses their turn, staff can add them back near the front — no need to restart from the end.',
  },
  {
    iconName: 'Activity',
    title: 'Provider can pause or take a break',
    body: 'Going on lunch? The provider sets a break time and all customers instantly see the updated wait. Queue resumes the moment they\'re back.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Landing page — FAQs                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'How does a customer check their queue position?',
    a: 'Staff registers the customer and gives them a token link, or they log in with their phone number using an OTP. They\'ll see their token, how many people are ahead, and an estimated time — all live on their phone screen without needing to refresh.',
  },
  {
    q: 'Do customers need to install any app?',
    a: 'No — nothing to download. Customers just open the link in any browser on their phone. It works on any Android or iPhone.',
  },
  {
    q: 'How does a business get set up?',
    a: 'Register your business on the Get Started page — we\'ll reach out to onboard you. Your staff can sign in once your account is ready.',
  },
  {
    q: 'What does the front-desk staff do?',
    a: 'Staff adds customers to the queue (name + phone number), can mark urgent cases that jump the queue, manage walk-ins, and see a live view of everything happening across all providers.',
  },
  {
    q: 'What does the service provider see?',
    a: 'The provider sees who is currently being served, who is next, and the full waiting list with estimated times. They tap "Call next" when ready, mark the session complete when done, and can pause the queue or take a break at any time.',
  },
  {
    q: 'How accurate is the wait time shown to customers?',
    a: 'The app learns from each provider\'s actual service times and updates the estimate automatically. If a session takes longer than usual, all customers\' wait times adjust within seconds.',
  },
  {
    q: 'Can I use a TV screen in the waiting area?',
    a: 'Yes — open the display link on any browser connected to a TV. It shows "Now Serving" in large text and the next few tokens. No login needed for the display.',
  },
  {
    q: 'Is this free for customers?',
    a: 'Yes, completely free for customers. They sign in with their phone number and use it at no cost.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Hero stats strip                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

export const HERO_STATS = [
  { v: '0', l: 'Apps to install' },
  { v: '< 1 min', l: 'Customer sign-in time' },
  { v: 'Live', l: 'Queue updates' },
  { v: 'Free', l: 'For Users' },
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
