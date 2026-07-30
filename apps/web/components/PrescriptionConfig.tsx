'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function PrescriptionConfig() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Local state copies
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

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api<any>('/prescriptions/config');
        if (data) {
          setConfig(data);
          setShowLogo(data.showLogo);
          setShowPatientAge(data.showPatientAge);
          setShowPatientMobile(data.showPatientMobile);
          setShowPatientAddress(data.showPatientAddress);
          setShowDate(data.showDate);
          setShowSignature(data.showSignature);
          setShowVitals(data.showVitals);
          setShowSymptoms(data.showSymptoms);
          setShowDiagnosis(data.showDiagnosis);
          setShowAdvice(data.showAdvice);
          setShowInvestigations(data.showInvestigations);
          setHeaderEnabled(data.headerEnabled);
          setFooterEnabled(data.footerEnabled);
          setCustomHeaderText(data.customHeaderText || '');
          setCustomFooterText(data.customFooterText || '');
          setSignatureUrl(data.signatureUrl || '');
          setSectionOrder(data.sectionOrder || ['vitals', 'symptoms', 'diagnosis', 'medicines', 'advice']);
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

    // Swap elements
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setSectionOrder(newOrder);
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        <p className="text-sm text-slate-500 font-medium">Loading layout configuration...</p>
      </div>
    );
  }

  return (
    <div className="card p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl space-y-6">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Prescription Template Settings</h3>
        <p className="text-xs text-slate-400">Configure what details are visible on your prescription PDF and control the order of sections.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Side: Layout Toggles */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Layout Options</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="rounded text-indigo-500" />
              Show Clinic Logo
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showPatientAge} onChange={(e) => setShowPatientAge(e.target.checked)} className="rounded text-indigo-500" />
              Show Patient Age
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showPatientMobile} onChange={(e) => setShowPatientMobile(e.target.checked)} className="rounded text-indigo-500" />
              Show Patient Mobile
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showPatientAddress} onChange={(e) => setShowPatientAddress(e.target.checked)} className="rounded text-indigo-500" />
              Show Patient Address
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="rounded text-indigo-500" />
              Show Prescription Date
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} className="rounded text-indigo-500" />
              Show Doctor Signature
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showVitals} onChange={(e) => setShowVitals(e.target.checked)} className="rounded text-indigo-500" />
              Show Vitals Section
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showSymptoms} onChange={(e) => setShowSymptoms(e.target.checked)} className="rounded text-indigo-500" />
              Show Symptoms Section
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showDiagnosis} onChange={(e) => setShowDiagnosis(e.target.checked)} className="rounded text-indigo-500" />
              Show Diagnosis Section
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showAdvice} onChange={(e) => setShowAdvice(e.target.checked)} className="rounded text-indigo-500" />
              Show Advice Section
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showInvestigations} onChange={(e) => setShowInvestigations(e.target.checked)} className="rounded text-indigo-500" />
              Show Investigations Section
            </label>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Letterhead & Footer</h4>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={headerEnabled} onChange={(e) => setHeaderEnabled(e.target.checked)} className="rounded text-indigo-500" />
                Enable Digital Header
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={footerEnabled} onChange={(e) => setFooterEnabled(e.target.checked)} className="rounded text-indigo-500" />
                Enable Digital Footer
              </label>
            </div>
            
            {headerEnabled && (
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase">Custom Header Tagline</label>
                <input
                  type="text"
                  value={customHeaderText}
                  onChange={(e) => setCustomHeaderText(e.target.value)}
                  placeholder="e.g. Specialists in Cardiology"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            )}

            {footerEnabled && (
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase">Custom Footer Text / Disclaimer</label>
                <input
                  type="text"
                  value={customFooterText}
                  onChange={(e) => setCustomFooterText(e.target.value)}
                  placeholder="e.g. Please consult a doctor immediately in case of emergency."
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 font-bold uppercase">Signature Image URL</label>
              <input
                type="text"
                value={signatureUrl}
                onChange={(e) => setSignatureUrl(e.target.value)}
                placeholder="e.g. https://storage.local/signature.png"
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Right Side: Section Ordering */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Section Order (Drag & Drop replacement)</h4>
          <p className="text-xs text-slate-400">Use the Up and Down buttons to arrange how sections appear on the generated PDF.</p>
          
          <div className="space-y-2">
            {sectionOrder.map((section, idx) => (
              <div
                key={section}
                className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30"
              >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{section}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs font-bold"
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(idx, 'down')}
                    disabled={idx === sectionOrder.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs font-bold"
                    title="Move Down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 rounded-xl font-medium">
          ✅ {msg}
        </div>
      )}
      {errorMsg && (
        <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 rounded-xl font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium shadow-sm transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}
