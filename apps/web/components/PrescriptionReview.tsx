'use client';

import React, { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface MedicineLine {
  id?: string;
  medicine: string;
  genericName?: string;
  form?: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string;
}

interface PrescriptionReviewProps {
  prescription: any;
  onCompleted: (wasWhatsAppSent?: boolean) => void;
  onCompleteVisit?: () => void;
}

export function PrescriptionReview({ prescription, onCompleted, onCompleteVisit }: PrescriptionReviewProps) {
  const [symptoms, setSymptoms] = useState(prescription.symptoms || '');
  const [diagnosis, setDiagnosis] = useState(prescription.diagnosis || '');
  const [advice, setAdvice] = useState(prescription.advice || '');
  const [allergies, setAllergies] = useState(prescription.allergies || '');
  
  // Vitals
  const [weight, setWeight] = useState(prescription.weight || '');
  const [height, setHeight] = useState(prescription.height || '');
  const [bp, setBp] = useState(prescription.bloodPressure || '');
  const [temp, setTemp] = useState(prescription.temperature || '');
  const [pulse, setPulse] = useState(prescription.pulse || '');
  const [spo2, setSpo2] = useState(prescription.spo2 || '');

  // Medicines
  const [medicines, setMedicines] = useState<MedicineLine[]>(prescription.medicines || []);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [pdfUrl, setPdfUrl] = useState(prescription.pdfUrl || '');
  const [isCompleted, setIsCompleted] = useState(
    prescription.status === 'GENERATING_PDF' || prescription.status === 'COMPLETED'
  );
  const [polling, setPolling] = useState(false);
  const [pollingPdf, setPollingPdf] = useState(prescription.status === 'GENERATING_PDF');
  const [sendWhatsAppLocal, setSendWhatsAppLocal] = useState(true);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (prescription.status === 'GENERATING_PDF') {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await api<any>(`/prescriptions/visit/${prescription.visitId}`);
          if (res && res.status === 'COMPLETED' && res.pdfUrl) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPdfUrl(res.pdfUrl);
            setPollingPdf(false);
          } else if (res && res.status === 'FAILED') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPollingPdf(false);
            setErrorMsg('PDF generation failed. Please check S3 credentials and try again.');
          }
        } catch {
          // ignore
        }
      }, 2000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [prescription.status, prescription.visitId]);

  const handlePrint = () => {
    if (!pdfUrl) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.src = pdfUrl;
    iframe.onload = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }
    };
    document.body.appendChild(iframe);
  };

  const addMedicine = () => {
    setMedicines([
      ...medicines,
      { medicine: '', dosage: '', frequency: 'Once Daily', duration: '3 Days', notes: '' },
    ]);
  };

  const removeMedicine = (idx: number) => {
    setMedicines(medicines.filter((_, i) => i !== idx));
  };

  const handleMedChange = (idx: number, field: keyof MedicineLine, val: string) => {
    const updated = [...medicines];
    updated[idx] = { ...updated[idx], [field]: val };
    setMedicines(updated);
  };

  const handleSave = async (sendWhatsApp: boolean = true) => {
    setSaving(true);
    setErrorMsg('');
    setSendWhatsAppLocal(sendWhatsApp);
    try {
      await api('/prescriptions/finalize', {
        method: 'POST',
        body: {
          visitId: prescription.visitId,
          symptoms,
          diagnosis,
          advice,
          allergies,
          weight,
          height,
          bloodPressure: bp,
          temperature: temp,
          pulse,
          spo2,
          sendWhatsApp,
          medicines: medicines.map((m) => {
            const { id, prescriptionId, ...rest } = m as any;
            return rest;
          }),
        },
      });

      setIsCompleted(true);
      setSaving(false);
      setPollingPdf(true);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await api<any>(`/prescriptions/visit/${prescription.visitId}`);
          if (res && res.status === 'COMPLETED' && res.pdfUrl) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPdfUrl(res.pdfUrl);
            setPollingPdf(false);
          } else if (res && res.status === 'FAILED') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPollingPdf(false);
            setErrorMsg('PDF generation failed. Please check S3 credentials and try again.');
          }
        } catch {
          // ignore transient poll failures
        }
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save and send prescription');
      setSaving(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="card p-6 space-y-6 bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-950/60 shadow-sm rounded-2xl animate-fade-in">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 mb-3 text-xl">
            ✓
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Prescription Saved Successfully</h3>
          <p className="text-xs text-slate-400 mt-1">
            {sendWhatsAppLocal
              ? 'The prescription details have been saved and queued for WhatsApp delivery.'
              : 'The prescription details have been saved successfully.'
            }
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {pollingPdf ? (
            <div className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-sm font-semibold rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60 min-h-[44px]">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400" />
              <span>Compiling PDF...</span>
            </div>
          ) : (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition"
              >
                📥 Download PDF
              </a>
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition shadow-sm"
              >
                🖨️ Print Prescription
              </button>
            </>
          )}

          {onCompleteVisit && (
            <button
              type="button"
              onClick={() => {
                onCompleteVisit();
                onCompleted(sendWhatsAppLocal);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-sm font-bold"
            >
              ✓ Mark Visit Complete
            </button>
          )}
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => onCompleted(sendWhatsAppLocal)}
            className="px-6 py-2 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Close Panel
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="card p-6 space-y-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Review Prescription</h3>
        <p className="text-xs text-slate-400">Edit the parsed consultation details below before generating the final PDF.</p>
      </div>

      {/* Vitals Grid */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Vitals</h4>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">Weight</label>
            <input
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 70 kg"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">Height</label>
            <input
              type="text"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 170 cm"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">BP</label>
            <input
              type="text"
              value={bp}
              onChange={(e) => setBp(e.target.value)}
              placeholder="120/80"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">Temp</label>
            <input
              type="text"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="98.6 F"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">Pulse</label>
            <input
              type="text"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
              placeholder="72 bpm"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase">SpO2</label>
            <input
              type="text"
              value={spo2}
              onChange={(e) => setSpo2(e.target.value)}
              placeholder="98%"
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Allergies & Symptoms */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Symptoms</label>
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            rows={2}
            className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            placeholder="e.g. Fever, Dry Cough"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Drug Allergies</label>
          <textarea
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            rows={2}
            className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            placeholder="e.g. None or Penicillin"
          />
        </div>
      </div>

      {/* Diagnosis & Advice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Diagnosis</label>
          <textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            rows={2}
            className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            placeholder="e.g. Acute Bronchitis"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">General Advice / Instructions</label>
          <textarea
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            rows={2}
            className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            placeholder="e.g. Drink warm fluids, Avoid cold food."
          />
        </div>
      </div>

      {/* Medicines Table */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rx</h4>
          <button
            type="button"
            onClick={addMedicine}
            className="px-3 py-1.5 text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 hover:bg-indigo-100 rounded-xl transition font-semibold"
          >
            ➕ Add Medicine
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold text-xs uppercase">
                <th className="py-2 pr-2">Medicine Name</th>
                <th className="py-2 pr-2 w-28">Dosage</th>
                <th className="py-2 pr-2 w-36">Frequency</th>
                <th className="py-2 pr-2 w-28">Duration</th>
                <th className="py-2 pr-2">Instructions</th>
                <th className="py-2 w-10 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((med, idx) => (
                <tr key={idx} className="border-b border-slate-50 dark:border-slate-800/40">
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={med.medicine}
                      onChange={(e) => handleMedChange(idx, 'medicine', e.target.value)}
                      placeholder="e.g. Azithromycin 500"
                      className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={med.dosage}
                      onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                      placeholder="e.g. 500mg"
                      className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={med.frequency}
                      onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
                    >
                      <option>Once Daily</option>
                      <option>Twice Daily</option>
                      <option>Thrice Daily</option>
                      <option>Four Times Daily</option>
                      <option>SOS (As Needed)</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={med.duration}
                      onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                      placeholder="e.g. 3 Days"
                      className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={med.notes || ''}
                      onChange={(e) => handleMedChange(idx, 'notes', e.target.value)}
                      placeholder="e.g. After food"
                      className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
                    />
                  </td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeMedicine(idx)}
                      className="text-rose-500 hover:text-rose-600 transition text-sm font-semibold"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {medicines.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-xs text-slate-400">
                    No medicines added. Click Add Medicine above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {errorMsg && (
        <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 rounded-xl font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : '📄 Save Only (Print / Download)'}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium shadow-sm transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : '💾 Save & Send via WhatsApp'}
        </button>
      </div>
    </div>
  );
}
