export type BusinessType = 'CLINIC' | 'SALON' | 'BANK' | 'GOVT' | 'GENERAL';

export interface Labels {
  provider: string;       // Doctor / Stylist / Officer
  providerPlural: string; // Doctors / Stylists / Officers
  customer: string;       // Patient / Client / Customer / Citizen
  customerPlural: string; // Patients / Clients / Customers / Citizens
  service: string;        // Consultation / Session / Meeting / Service
  inService: string;      // In consultation / In session / In service
  organization: string;   // Clinic / Salon / Branch / Office
  staff: string;          // Receptionist / Counter Staff
  serviceRoom: string;    // consultation room / styling area / service counter
  receptionDesk: string;  // reception desk / front desk / help desk
  perCustomer: string;    // min/patient / min/client / min/customer / min/citizen
  department: string;     // Department / Specialty / Service Type / Division
}

const LABELS: Record<BusinessType, Labels> = {
  CLINIC: {
    provider: 'Doctor',
    providerPlural: 'Doctors',
    customer: 'Patient',
    customerPlural: 'Patients',
    service: 'Consultation',
    inService: 'In consultation',
    organization: 'Clinic',
    staff: 'Receptionist',
    serviceRoom: 'consultation room',
    receptionDesk: 'reception desk',
    perCustomer: 'min/patient',
    department: 'Department',
  },
  SALON: {
    provider: 'Stylist',
    providerPlural: 'Stylists',
    customer: 'Client',
    customerPlural: 'Clients',
    service: 'Session',
    inService: 'In session',
    organization: 'Salon',
    staff: 'Receptionist',
    serviceRoom: 'styling area',
    receptionDesk: 'front desk',
    perCustomer: 'min/client',
    department: 'Specialty',
  },
  BANK: {
    provider: 'Officer',
    providerPlural: 'Officers',
    customer: 'Customer',
    customerPlural: 'Customers',
    service: 'Meeting',
    inService: 'In service',
    organization: 'Branch',
    staff: 'Counter Staff',
    serviceRoom: 'service counter',
    receptionDesk: 'help desk',
    perCustomer: 'min/customer',
    department: 'Division',
  },
  GOVT: {
    provider: 'Officer',
    providerPlural: 'Officers',
    customer: 'Citizen',
    customerPlural: 'Citizens',
    service: 'Service',
    inService: 'In service',
    organization: 'Office',
    staff: 'Counter Staff',
    serviceRoom: 'service counter',
    receptionDesk: 'help desk',
    perCustomer: 'min/citizen',
    department: 'Service Type',
  },
  GENERAL: {
    provider: 'Staff',
    providerPlural: 'Staff Members',
    customer: 'Person',
    customerPlural: 'People',
    service: 'Session',
    inService: 'In session',
    organization: 'Business',
    staff: 'Front Desk',
    serviceRoom: 'service area',
    receptionDesk: 'front desk',
    perCustomer: 'min/person',
    department: 'Category',
  },
};

export function normalizeBusinessType(raw?: string | null): BusinessType {
  const v = (raw ?? 'CLINIC').toUpperCase();
  const map: Record<string, BusinessType> = {
    CLINIC: 'CLINIC',
    HOSPITAL: 'CLINIC',
    MEDICAL: 'CLINIC',
    SALON: 'SALON',
    SPA: 'SALON',
    BANK: 'BANK',
    FINANCE: 'BANK',
    GOVT: 'GOVT',
    GOVERNMENT: 'GOVT',
    GENERAL: 'GENERAL',
    CAFE: 'GENERAL',
    RESTAURANT: 'GENERAL',
    SERVICE_CENTER: 'GENERAL',
  };
  return map[v] ?? 'GENERAL';
}

export function getLabels(businessType?: string | null): Labels {
  const key = normalizeBusinessType(businessType);
  return LABELS[key] ?? LABELS.CLINIC;
}

export function departmentPresetsFor(businessType?: string | null): string[] {
  const key = normalizeBusinessType(businessType);
  if (key === 'CLINIC') return [];
  return DEPARTMENT_PRESETS[key] ?? DEPARTMENT_PRESETS.GENERAL;
}

export const DEPARTMENT_PRESETS: Record<BusinessType, string[]> = {
  CLINIC: [], // sourced from HOSPITAL_DEPARTMENTS in config.ts
  SALON: [
    'Hair Styling',
    'Nail Care',
    'Skin & Facial',
    'Waxing & Threading',
    'Makeup & Beauty',
    'Spa & Massage',
    'Bridal Services',
    'Hair Colouring',
    'Eyebrow & Lash',
  ],
  BANK: [
    'Personal Banking',
    'Business Banking',
    'Loans & Mortgages',
    'Investments & Wealth',
    'Cards & Payments',
    'Foreign Exchange',
    'Insurance',
    'NRI Services',
  ],
  GOVT: [
    'Passport Services',
    'Driving License',
    'Property Registration',
    'Tax Filing',
    'Birth Certificate',
    'Trade License',
    'Ration Card',
    'Aadhaar Services',
  ],
  GENERAL: [
    'General Enquiry',
    'Support',
    'Consultation',
    'Registration',
    'Document Processing',
    'Verification',
    'Complaint',
    'Other',
  ],
};

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string; description: string }[] = [
  { value: 'CLINIC',   label: 'Clinic / Hospital',   description: 'Doctors, patients, consultations' },
  { value: 'SALON',    label: 'Salon / Spa',           description: 'Stylists, clients, sessions' },
  { value: 'BANK',     label: 'Bank / Finance',        description: 'Officers, customers, meetings' },
  { value: 'GOVT',     label: 'Government Office',     description: 'Officers, citizens, services' },
  { value: 'GENERAL',  label: 'General / Other',       description: 'Any business with a queue' },
];
