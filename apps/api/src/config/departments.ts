/**
 * Master list of hospital/clinic departments — alphabetical.
 *
 * Single source of truth for the seed and for any future seeding utilities.
 * Keep in sync with apps/web/lib/config.ts → HOSPITAL_DEPARTMENTS so the UI
 * and DB never drift.
 */
export const HOSPITAL_DEPARTMENTS: readonly string[] = [
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
