'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function PrescriptionConfig() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Layout Toggles & Section Order
  const [showLogo, setShowLogo] = useState(true);
  const [showPatientAge, setShowPatientAge] = useState(true);
  const [showPatientMobile, setShowPatientMobile] = useState(true);
  const [showPatientAddress, setShowPatientAddress] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [showVitals, setShowVitals] = useState(true);
  const [showSymptoms, setShowSymptoms] = useState(true);
  const [showDiagnosis, setShowDiagnosis] = useState(true);
  const [showAdvice, setShowAdvice] = useState(true);
  const [showInvestigations, setShowInvestigations] = useState(true);
  const [headerEnabled, setHeaderEnabled] = useState(true);
  const [footerEnabled, setFooterEnabled] = useState(true);
  const [customHeaderText, setCustomHeaderText] = useState('');
  const [customFooterText, setCustomFooterText] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);

  // New Customization Settings
  const [templateStyle, setTemplateStyle] = useState('CLASSIC'); // CLASSIC, MODERN_GRID, CLEAN_MINIMAL, MANIPAL_HEALTH
  const [showMedicineTable, setShowMedicineTable] = useState(true);
  const [logoPosition, setLogoPosition] = useState('LEFT'); // LEFT, RIGHT, CENTER
  const [headerTextPosition, setHeaderTextPosition] = useState('RIGHT'); // LEFT, RIGHT, CENTER
  const [customClinicName, setCustomClinicName] = useState('');
  const [customDoctorName, setCustomDoctorName] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [specializationText, setSpecializationText] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [consultingHours, setConsultingHours] = useState('');
  const [emergencyWarning, setEmergencyWarning] = useState('');
  const [watermarkUrl, setWatermarkUrl] = useState('');

  // Additional settings
  const [website, setWebsite] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(true);
  const [clinicNameFontSize, setClinicNameFontSize] = useState(16);
  const [doctorNameFontSize, setDoctorNameFontSize] = useState(11);
  const [headerDetailsFontSize, setHeaderDetailsFontSize] = useState(8);
  const [clinicNameColor, setClinicNameColor] = useState('#1e293b');
  const [doctorNameColor, setDoctorNameColor] = useState('#b91c1c');
  const [headerDetailsColor, setHeaderDetailsColor] = useState('#475569');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api<any>('/prescriptions/config');
        if (data) {
          setConfig(data);
          setShowLogo(data.showLogo ?? true);
          setShowPatientAge(data.showPatientAge ?? true);
          setShowPatientMobile(data.showPatientMobile ?? true);
          setShowPatientAddress(data.showPatientAddress ?? false);
          setShowDate(data.showDate ?? true);
          setShowSignature(data.showSignature ?? true);
          setShowVitals(data.showVitals ?? true);
          setShowSymptoms(data.showSymptoms ?? true);
          setShowDiagnosis(data.showDiagnosis ?? true);
          setShowAdvice(data.showAdvice ?? true);
          setShowInvestigations(data.showInvestigations ?? true);
          setHeaderEnabled(data.headerEnabled ?? true);
          setFooterEnabled(data.footerEnabled ?? true);
          setCustomHeaderText(data.customHeaderText || '');
          setCustomFooterText(data.customFooterText || '');
          setSignatureUrl(data.signatureUrl || '');
          
          let order = data.sectionOrder || ['vitals', 'symptoms', 'diagnosis', 'medicines', 'advice'];
          if (!order.includes('followup')) {
            order = [...order, 'followup'];
          }
          setSectionOrder(order);
 
          // New settings
          setTemplateStyle(data.templateStyle || 'CLASSIC');
          setShowMedicineTable(data.showMedicineTable ?? true);
          setLogoPosition(data.logoPosition || 'LEFT');
          setHeaderTextPosition(data.headerTextPosition || 'RIGHT');
          setCustomClinicName(data.customClinicName || '');
          setCustomDoctorName(data.customDoctorName || '');
          setQualifications(data.qualifications || '');
          setSpecializationText(data.specializationText || '');
          setRegistrationNumber(data.registrationNumber || '');
          setContactNumber(data.contactNumber || '');
          setEmail(data.email || '');
          setAddressLine1(data.addressLine1 || '');
          setAddressLine2(data.addressLine2 || '');
          setConsultingHours(data.consultingHours || '');
          setEmergencyWarning(data.emergencyWarning || '');
          setWatermarkUrl(data.watermarkUrl || '');
          setWebsite(data.website || '');
          setShowFollowUp(data.showFollowUp ?? true);
          setClinicNameFontSize(data.clinicNameFontSize || 16);
          setDoctorNameFontSize(data.doctorNameFontSize || 11);
          setHeaderDetailsFontSize(data.headerDetailsFontSize || 8);
          setClinicNameColor(data.clinicNameColor || '#1e293b');
          setDoctorNameColor(data.doctorNameColor || '#b91c1c');
          setHeaderDetailsColor(data.headerDetailsColor || '#475569');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const moveSection = (idx: number, direction: 'up' | 'down') => {
    const newOrder = [...sectionOrder];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;

    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setSectionOrder(newOrder);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setSaving(true);
    setMsg('');
    setErrorMsg('');
    try {
      const data = await api<any>('/prescriptions/upload-logo', {
        method: 'POST',
        body: formData,
      });
      setConfig((prev: any) => ({
        ...prev,
        doctor: {
          ...prev.doctor,
          clinic: { ...prev.doctor.clinic, logoUrl: data.logoUrl },
        },
      }));
      setMsg('Clinic logo uploaded successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to upload clinic logo');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setSaving(true);
    setMsg('');
    setErrorMsg('');
    try {
      const data = await api<any>('/prescriptions/upload-signature', {
        method: 'POST',
        body: formData,
      });
      setSignatureUrl(data.signatureUrl);
      setMsg('Digital signature uploaded successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to upload signature');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    setErrorMsg('');
    try {
      await api<any>('/prescriptions/config', {
        method: 'POST',
        body: {
          sectionOrder,
          showLogo,
          showPatientAge,
          showPatientMobile,
          showPatientAddress,
          showDate,
          showSignature,
          showVitals,
          showSymptoms,
          showDiagnosis,
          showAdvice,
          showInvestigations,
          headerEnabled,
          footerEnabled,
          customHeaderText,
          customFooterText,
          signatureUrl,
          templateStyle,
          showMedicineTable,
          logoPosition,
          headerTextPosition,
          customClinicName,
          customDoctorName,
          qualifications,
          specializationText,
          registrationNumber,
          contactNumber,
          email,
          addressLine1,
          addressLine2,
          consultingHours,
          emergencyWarning,
          watermarkUrl,
          website,
          showFollowUp,
          clinicNameFontSize: Number(clinicNameFontSize),
          doctorNameFontSize: Number(doctorNameFontSize),
          headerDetailsFontSize: Number(headerDetailsFontSize),
          clinicNameColor,
          doctorNameColor,
          headerDetailsColor,
        },
      });
      setMsg('Prescription template configuration saved successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
        <p className="text-sm text-slate-500 font-medium">Loading layout configuration...</p>
      </div>
    );
  }

  const templates = [
    { id: 'CLASSIC', name: 'Classic Letterhead', desc: 'Standard professional medical template' },
    { id: 'MODERN_GRID', name: 'Modern Clean Grid', desc: 'Minimalist borders and compact grid layout' },
    { id: 'CLEAN_MINIMAL', name: 'Elegant Minimalist', desc: 'No heavy borders, centered layout structure' },
    { id: 'MANIPAL_HEALTH', name: 'Manipal Health style', desc: 'Official institutional style with full-width tables' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Left Side: Customize Forms */}
        <div className="flex-1 space-y-6 w-full">
          
          {/* Template Style Selector */}
          <div className="card p-5 space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">1. Choose Template Layout</h4>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplateStyle(t.id);
                    if (t.id === 'CLEAN_MINIMAL') {
                      setLogoPosition('CENTER');
                      setHeaderTextPosition('CENTER');
                    } else if (t.id === 'CLASSIC') {
                      setLogoPosition('LEFT');
                      setHeaderTextPosition('RIGHT');
                    } else if (t.id === 'MANIPAL_HEALTH') {
                      setLogoPosition('LEFT');
                      setHeaderTextPosition('LEFT');
                    }
                  }}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    templateStyle === t.id
                      ? 'border-teal-500 bg-teal-500/5 dark:bg-teal-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span className="block font-semibold text-xs text-slate-900 dark:text-white">{t.name}</span>
                  <span className="block text-[10px] text-slate-400 mt-1 leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Form */}
          <div className="card p-5 space-y-5">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">2. Letterhead & Doctor Details</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Clinic / Hospital Name</label>
                <input
                  type="text"
                  value={customClinicName}
                  onChange={(e) => setCustomClinicName(e.target.value)}
                  placeholder="e.g. Kota Heart Institute"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Doctor Display Name</label>
                <input
                  type="text"
                  value={customDoctorName}
                  onChange={(e) => setCustomDoctorName(e.target.value)}
                  placeholder="e.g. Dr. Sandeep Jain"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Qualifications</label>
                <input
                  type="text"
                  value={qualifications}
                  onChange={(e) => setQualifications(e.target.value)}
                  placeholder="e.g. MBBS, M.D. (Internal Medicine)"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Specialization Title</label>
                <input
                  type="text"
                  value={specializationText}
                  onChange={(e) => setSpecializationText(e.target.value)}
                  placeholder="e.g. Consultant Physician"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Registration / License Number</label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="e.g. Reg. No. 009734"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Contact Phone Number</label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. 9828889673"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Email Address</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. drsandeep@gmail.com"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Website URL</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="e.g. www.sandeepclinic.com"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Clinic Address (Line 1)</label>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="e.g. 6-C-2, Mahaveer Nagar III"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Clinic Address (Line 2)</label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="e.g. Kota (Rajasthan)"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Consulting / Timing Hours</label>
                <input
                  type="text"
                  value={consultingHours}
                  onChange={(e) => setConsultingHours(e.target.value)}
                  placeholder="e.g. Mon-Sat: 4:30 PM - 8:30 PM"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Watermark/Background Logo URL</label>
                <input
                  type="text"
                  value={watermarkUrl}
                  onChange={(e) => setWatermarkUrl(e.target.value)}
                  placeholder="e.g. https://storage.com/watermark.png"
                  className="input mt-1 w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Emergency Warning / Footer Disclaimer</label>
                <input
                  type="text"
                  value={emergencyWarning}
                  onChange={(e) => setEmergencyWarning(e.target.value)}
                  placeholder="e.g. In case of emergency, please contact the nearest hospital."
                  className="input mt-1 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Live visual mockup preview */}
        <div className="w-full lg:w-[420px] shrink-0 sticky top-6 self-start space-y-3 mt-8 lg:mt-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Prescription Live Design Preview</span>
          
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white shadow-lg overflow-hidden relative p-6 aspect-[1/1.41] flex flex-col justify-between text-slate-800" style={{ fontSize: '10px' }}>
            {/* Watermark Logo */}
            {watermarkUrl && (
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
                <span className="text-6xl font-black select-none">Rx</span>
              </div>
            )}

            {/* Letterhead Header */}
            <div>
              {headerEnabled && (
                <div className={`flex items-start justify-between pb-3 border-b border-slate-200 ${
                  logoPosition === 'CENTER' || headerTextPosition === 'CENTER' ? 'flex-col items-center text-center' : ''
                }`}>
                  
                  {/* Logo */}
                  {showLogo && (
                    <div className={`h-8 w-8 shrink-0 ${
                      logoPosition === 'RIGHT' ? 'order-last' : logoPosition === 'CENTER' ? 'mb-2' : 'mr-3'
                    }`}>
                      {config?.doctor?.clinic?.logoUrl ? (
                        <img src={config.doctor.clinic.logoUrl} alt="Logo" className="h-8 w-8 rounded-full object-contain bg-white" />
                      ) : (
                        <div className="h-8 w-8 rounded-full border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                          <span className="text-[7px] font-bold text-slate-400">Logo</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Header text content */}
                  <div className={`flex-1 leading-relaxed ${
                    headerTextPosition === 'RIGHT' ? 'text-right' : headerTextPosition === 'CENTER' ? 'text-center' : 'text-left'
                  }`}>
                    <span className="block font-black tracking-tight" style={{ fontSize: `${clinicNameFontSize}px`, color: clinicNameColor }}>{customClinicName || 'Clinic Name'}</span>
                    <span className="block font-extrabold" style={{ fontSize: `${doctorNameFontSize}px`, color: doctorNameColor }}>{customDoctorName || 'Dr. Doctor Name'}</span>
                    <span className="block font-semibold" style={{ fontSize: `${headerDetailsFontSize}px`, color: headerDetailsColor }}>{qualifications || 'Qualifications'}</span>
                    <span className="block" style={{ fontSize: `${headerDetailsFontSize}px`, color: headerDetailsColor }}>{specializationText || 'Specialization'}</span>
                    <span className="block" style={{ fontSize: `${headerDetailsFontSize}px`, color: headerDetailsColor }}>{registrationNumber || 'Registration Number'}</span>
                    <span className="block font-medium mt-1" style={{ fontSize: `${headerDetailsFontSize - 1}px`, color: headerDetailsColor }}>
                      {addressLine1 || 'Address Line 1'}, {addressLine2 || 'Address Line 2'}
                    </span>
                  </div>
                </div>
              )}

              {/* Patient details block */}
              <div className="mt-4">
                {templateStyle === 'MODERN_GRID' || templateStyle === 'MANIPAL_HEALTH' ? (
                  <div className="grid grid-cols-2 border border-slate-300 divide-x divide-slate-200">
                    <div className="p-2">
                      <span className="font-bold block text-[8px]">PATIENT DETAILS</span>
                      <span className="block font-medium">Name: Patient Name</span>
                      {showPatientAge && <span className="block">Age/Sex: 25 Y / M</span>}
                      {showPatientMobile && <span className="block">Mobile: 9876543210</span>}
                    </div>
                    <div className="p-2">
                      <span className="font-bold block text-[8px]">VISIT INFO</span>
                      <span className="block">Ref ID: #OQE12</span>
                      {showDate && <span className="block">Date: {new Date().toLocaleDateString()}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between border-b border-dashed border-slate-300 pb-2">
                    <div>
                      <span className="block font-semibold">Patient: Patient Name</span>
                      {showPatientAge && <span className="block text-slate-400">Age: 25 Y | Gender: Male</span>}
                      {showPatientMobile && <span className="block text-slate-400">Mobile: 9876543210</span>}
                    </div>
                    {showDate && <div className="text-right">Date: {new Date().toLocaleDateString()}</div>}
                  </div>
                )}
              </div>

              {/* Dynamic Content Sections */}
              <div className="mt-4 space-y-3">
                {sectionOrder.map((section) => {
                  if (section === 'vitals' && showVitals) {
                    return (
                      <div key={section} className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="font-bold block text-[8px] text-slate-600">Vitals & Body Metrics</span>
                        <span className="block text-slate-500 mt-0.5">Weight: 72kg | Height: 172cm | BP: 120/80 mmHg | Temp: 98.6°F</span>
                      </div>
                    );
                  }
                  if (section === 'symptoms' && showSymptoms) {
                    return (
                      <div key={section}>
                        <span className="font-bold text-[8px] text-slate-700 block uppercase">Symptoms / Chief Complaints</span>
                        <span className="text-slate-500 block">Mild fever, wet cough for 3 days</span>
                      </div>
                    );
                  }
                  if (section === 'diagnosis' && showDiagnosis) {
                    return (
                      <div key={section}>
                        <span className="font-bold text-[8px] text-slate-700 block uppercase">Diagnosis</span>
                        <span className="text-slate-500 block font-semibold text-rose-800/80">Upper Respiratory Tract Infection (URTI)</span>
                      </div>
                    );
                  }
                  if (section === 'medicines') {
                    return (
                      <div key={section} className="space-y-1.5">
                        <span className="font-bold text-[9px] text-rose-900 block flex items-center gap-1">Rx</span>
                        {showMedicineTable ? (
                          <div className="border border-slate-200 rounded overflow-hidden">
                            <table className="w-full text-left" style={{ fontSize: '8px' }}>
                              <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                                <tr>
                                  <th className="p-1 w-8">S.No</th>
                                  <th className="p-1">Medicine Name</th>
                                  <th className="p-1">Dosage</th>
                                  <th className="p-1">Frequency</th>
                                  <th className="p-1">Duration</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-600">
                                <tr>
                                  <td className="p-1">1</td>
                                  <td className="p-1 font-semibold text-slate-800">Azithromycin 500</td>
                                  <td className="p-1">500 mg</td>
                                  <td className="p-1">Once Daily (1-0-0)</td>
                                  <td className="p-1">3 Days</td>
                                </tr>
                                <tr>
                                  <td className="p-1">2</td>
                                  <td className="p-1 font-semibold text-slate-800">Paracetamol 650</td>
                                  <td className="p-1">650 mg</td>
                                  <td className="p-1">SOS</td>
                                  <td className="p-1">As needed</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <ul className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li><strong>Azithromycin 500</strong> - 500 mg - Once Daily (1-0-0) - 3 Days (Take in the morning)</li>
                            <li><strong>Paracetamol 650</strong> - 650 mg - SOS - As needed (Take for fever)</li>
                          </ul>
                        )}
                      </div>
                    );
                  }
                  if (section === 'investigations' && showInvestigations) {
                    return (
                      <div key={section} className="space-y-1">
                        <span className="font-bold text-[8px] text-slate-700 block uppercase tracking-wide">Investigations / Tests Ordered</span>
                        <div className="border border-blue-100 rounded overflow-hidden">
                          <table className="w-full text-left" style={{ fontSize: '7.5px' }}>
                            <thead className="bg-blue-50 border-b border-blue-100 font-bold text-blue-900">
                              <tr>
                                <th className="p-1 w-6">S.No</th>
                                <th className="p-1">Test Name</th>
                                <th className="p-1">Type</th>
                                <th className="p-1">Urgency</th>
                                <th className="p-1">Instructions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-50 text-slate-600">
                              <tr>
                                <td className="p-1">1</td>
                                <td className="p-1 font-semibold text-slate-800">Complete Blood Count (CBC)</td>
                                <td className="p-1">Blood Test</td>
                                <td className="p-1">Routine</td>
                                <td className="p-1">Fasting not required</td>
                              </tr>
                              <tr className="bg-blue-50/40">
                                <td className="p-1">2</td>
                                <td className="p-1 font-semibold text-slate-800">Chest X-Ray</td>
                                <td className="p-1">X-Ray</td>
                                <td className="p-1">Routine</td>
                                <td className="p-1">PA view</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }
                  if (section === 'advice' && showAdvice) {
                    return (
                      <div key={section}>
                        <span className="font-bold text-[8px] text-slate-700 block uppercase">Advice</span>
                        <span className="text-slate-500 block">Rest and drink plenty of fluids. Avoid cold food.</span>
                      </div>
                    );
                  }
                  if (section === 'followup' && showFollowUp) {
                    return (
                      <div key={section} className="p-2 border border-dashed border-teal-200 rounded-xl bg-teal-50/20">
                        <span className="font-bold text-[8px] text-slate-700 block uppercase">Follow Up</span>
                        <span className="text-slate-500 block">Date: {new Date(Date.now() + 5 * 86400000).toLocaleDateString()} | Notes: Review in 5 days (SOS if symptoms persist)</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Bottom Footer Section */}
            <div className="border-t border-slate-200 pt-3 flex flex-col justify-end mt-4">
              <div className="flex justify-between items-end">
                <div>
                  {consultingHours && (
                    <span className="block text-[7px] text-slate-400">Consulting Hours: {consultingHours}</span>
                  )}
                  {contactNumber && (
                    <span className="block text-[7px] text-slate-400">Contact: {contactNumber} {email ? `| Email: ${email}` : ''} {website ? `| Web: ${website}` : ''}</span>
                  )}
                </div>
                
                {/* Doctor Stamp/Signature space */}
                {showSignature && (
                  <div className="text-right flex flex-col items-end">
                    {signatureUrl ? (
                      <img src={signatureUrl} alt="Signature" className="h-6 w-16 object-contain" />
                    ) : (
                      <div className="h-6 w-16 border border-dashed border-slate-200 flex items-center justify-center text-[7px] text-slate-300">
                        Signature
                      </div>
                    )}
                    <span className="text-[7px] font-bold text-slate-700 mt-1">{customDoctorName || 'Dr. Doctor Name'}</span>
                  </div>
                )}
              </div>
              
              {footerEnabled && emergencyWarning && (
                <div className="text-center text-rose-700/70 border-t border-slate-100 pt-1 mt-1 font-semibold" style={{ fontSize: '7px' }}>
                  ⚠ {emergencyWarning}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Full Width bottom options */}
      <div className="space-y-6 w-full">
        
        {/* Card 3: Doctor Digital Signature (Full Width) */}
        <div className="card p-5 space-y-5">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm">3. Doctor Digital Signature</h4>
          
          <div className="space-y-2 max-w-2xl">
            <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold block">Doctor Digital Signature</label>
            <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              {signatureUrl ? (
                <div className="flex items-center gap-3">
                  <img src={signatureUrl} alt="Signature" className="h-12 w-20 object-contain border bg-white rounded" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">Signature Active</span>
                    <span className="block text-[9px] text-slate-400 truncate">{signatureUrl}</span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-medium">No signature uploaded yet.</div>
              )}
              <div className="flex gap-2 mt-2">
                <input
                  type="file"
                  accept="image/*"
                  id="signature-upload-input"
                  onChange={handleSignatureUpload}
                  className="hidden"
                />
                <label
                  htmlFor="signature-upload-input"
                  className="btn-ghost !py-1 !px-2.5 text-xs shrink-0 cursor-pointer text-teal-600 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/20 border border-teal-200"
                >
                  Upload File
                </label>
                <input
                  type="text"
                  placeholder="Or paste image/Google Drive URL"
                  value={signatureUrl}
                  onChange={(e) => setSignatureUrl(e.target.value)}
                  className="input !py-1 text-[10px] flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Alignment & Typography */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Alignment & Layout Options */}
          <div className="card p-5 space-y-4 h-full">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">4. Alignment & Layout Options</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Logo Position</label>
                <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)} className="input mt-1 w-full">
                  <option value="LEFT">Left Aligned</option>
                  <option value="CENTER">Centered</option>
                  <option value="RIGHT">Right Aligned</option>
                </select>
              </div>
              <div>
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold">Header Text Position</label>
                <select value={headerTextPosition} onChange={(e) => setHeaderTextPosition(e.target.value)} className="input mt-1 w-full">
                  <option value="LEFT">Left Aligned</option>
                  <option value="CENTER">Centered</option>
                  <option value="RIGHT">Right Aligned</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                <div>
                  <span className="block font-semibold text-xs text-slate-800 dark:text-slate-100">Format Medicines in Table</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">Use an organized grid layout instead of bullet points.</span>
                </div>
                <input
                  type="checkbox"
                  checked={showMedicineTable}
                  onChange={(e) => setShowMedicineTable(e.target.checked)}
                  className="w-5 h-5 accent-teal-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Font Sizes & Colors Customization */}
          <div className="card p-5 space-y-4 h-full">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">5. Typography, Sizes & Colors</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              
              {/* Clinic Name Size & Color */}
              <div className="space-y-2">
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold block">Clinic Name (Size & Color)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={10}
                    max={32}
                    value={clinicNameFontSize}
                    onChange={(e) => setClinicNameFontSize(Number(e.target.value))}
                    className="input w-full text-xs"
                    title="Font Size (px)"
                  />
                  <div className="relative shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 bg-slate-50 dark:bg-slate-900/60 w-12 h-10">
                    <input
                      type="color"
                      value={clinicNameColor}
                      onChange={(e) => setClinicNameColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="h-5 w-5 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: clinicNameColor }} />
                  </div>
                </div>
              </div>

              {/* Doctor Name Size & Color */}
              <div className="space-y-2">
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold block">Doctor Name (Size & Color)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={8}
                    max={24}
                    value={doctorNameFontSize}
                    onChange={(e) => setDoctorNameFontSize(Number(e.target.value))}
                    className="input w-full text-xs"
                    title="Font Size (px)"
                  />
                  <div className="relative shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 bg-slate-50 dark:bg-slate-900/60 w-12 h-10">
                    <input
                      type="color"
                      value={doctorNameColor}
                      onChange={(e) => setDoctorNameColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="h-5 w-5 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: doctorNameColor }} />
                  </div>
                </div>
              </div>

              {/* Header Details Size & Color */}
              <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                <label className="label text-xs uppercase tracking-wider text-slate-400 font-bold block">Header Details (Size & Color)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={6}
                    max={16}
                    value={headerDetailsFontSize}
                    onChange={(e) => setHeaderDetailsFontSize(Number(e.target.value))}
                    className="input w-full text-xs"
                    title="Font Size (px)"
                  />
                  <div className="relative shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 bg-slate-50 dark:bg-slate-900/60 w-12 h-10">
                    <input
                      type="color"
                      value={headerDetailsColor}
                      onChange={(e) => setHeaderDetailsColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="h-5 w-5 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: headerDetailsColor }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Row 2: Visibility & Section Order */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Visibility Switches */}
          <div className="card p-5 space-y-4 h-full">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">6. Elements Visibility</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Clinic Logo
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showPatientAge} onChange={(e) => setShowPatientAge(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Patient Age / Gender
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showPatientMobile} onChange={(e) => setShowPatientMobile(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Patient Mobile
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showPatientAddress} onChange={(e) => setShowPatientAddress(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Patient Address
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Prescription Date
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Doctor Signature
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showVitals} onChange={(e) => setShowVitals(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Vitals Box
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showSymptoms} onChange={(e) => setShowSymptoms(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Symptoms Block
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showDiagnosis} onChange={(e) => setShowDiagnosis(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Diagnosis Block
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showAdvice} onChange={(e) => setShowAdvice(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Advice Block
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showInvestigations} onChange={(e) => setShowInvestigations(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Investigations
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showFollowUp} onChange={(e) => setShowFollowUp(e.target.checked)} className="rounded text-teal-600 accent-teal-600" />
                Follow Up Block
              </label>
            </div>
          </div>

          {/* Section Ordering */}
          <div className="card p-5 space-y-4 h-full">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">7. Layout Section Order</h4>
            <p className="text-[10px] text-slate-400">Re-arrange layout blocks dynamically using up/down arrow buttons:</p>
            <div className="space-y-2">
              {sectionOrder.map((section, idx) => (
                <div key={section} className="flex items-center justify-between p-2.5 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">{section}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveSection(idx, 'up')} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px]">▲</button>
                    <button type="button" onClick={() => moveSection(idx, 'down')} disabled={idx === sectionOrder.length - 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px]">▼</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {msg && <div className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 rounded-xl font-medium">✅ {msg}</div>}
        {errorMsg && <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 rounded-xl font-medium">⚠️ {errorMsg}</div>}

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm transition disabled:opacity-50 text-xs"
          >
            {saving ? 'Saving changes...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
