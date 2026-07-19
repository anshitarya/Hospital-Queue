'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Toast, type ToastMessage } from '@/components/Toast';
import { Spinner } from '@/components/PageLoader';

interface LocationItem {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  contactNumber: string;
  email: string | null;
  timeZone?: string;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
}

export function LocationsTab({ setToast }: { setToast: (t: ToastMessage | null) => void }) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLoc, setEditingLoc] = useState<LocationItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [postalCode, setPostalCode] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [submitting, setSubmitting] = useState(false);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<LocationItem[]>('/clinics/my/locations');
      setLocations(data || []);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load locations' });
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setCity('');
    setState('');
    setCountry('India');
    setPostalCode('');
    setContactNumber('');
    setEmail('');
    setStatus('ACTIVE');
    setEditingLoc(null);
  };

  const handleEdit = (loc: LocationItem) => {
    setEditingLoc(loc);
    setName(loc.name);
    setAddress(loc.address);
    setCity(loc.city);
    setState(loc.state);
    setCountry(loc.country);
    setPostalCode(loc.postalCode);
    setContactNumber(loc.contactNumber);
    setEmail(loc.email ?? '');
    setStatus(loc.status);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const body = { name, address, city, state, country, postalCode, contactNumber, email, status };
    try {
      if (editingLoc) {
        await api(`/clinics/my/locations/${editingLoc.id}`, {
          method: 'PUT',
          body,
        });
        setToast({ type: 'ok', msg: 'Branch location updated successfully' });
      } else {
        await api('/clinics/my/locations', {
          method: 'POST',
          body,
        });
        setToast({ type: 'ok', msg: 'New branch location added successfully' });
      }
      resetForm();
      void loadLocations();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to save location' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this branch location?')) return;
    try {
      await api(`/clinics/my/locations/${id}`, { method: 'DELETE' });
      setToast({ type: 'ok', msg: 'Location branch deleted' });
      void loadLocations();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to delete location' });
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center gap-4 text-slate-400">
        <Spinner className="h-8 w-8" />
        <span className="text-xs font-medium">Loading branch locations…</span>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Branch & Locations Management</h2>
        <p className="text-xs text-slate-400 mt-0.5 font-medium">
          Create and manage multiple branches under your business/clinic identity.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form container */}
        <div className="card p-5 lg:col-span-1 h-fit space-y-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {editingLoc ? 'Edit Branch' : 'Add New Branch'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Branch Name</label>
              <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indiranagar Branch" required />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Street Address</label>
              <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 100 Feet Rd" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">City</label>
                <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">State</label>
                <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={state} onChange={(e) => setState(e.target.value)} placeholder="Karnataka" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">Country</label>
                <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">Postal Code</label>
                <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="560038" required />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Contact Number</label>
              <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="+91 9999988888" required />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Email Address</label>
              <input type="email" className="input mt-1 w-full py-1.5 text-xs" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="branch@clinic.local" required />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Status</label>
              <select className="input mt-1 w-full py-1.5 text-xs cursor-pointer" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              {editingLoc && (
                <button type="button" onClick={resetForm} className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex-1 py-1.5 text-xs font-semibold">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={submitting} className="btn bg-brand-500 hover:bg-brand-600 text-white flex-1 py-1.5 text-xs font-semibold">
                {submitting ? 'Saving…' : editingLoc ? 'Update Branch' : 'Add Branch'}
              </button>
            </div>
          </form>
        </div>

        {/* List of locations */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Active Branches ({locations.length})</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {locations.map((loc) => (
                <div key={loc.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition-colors">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{loc.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 font-bold rounded-full uppercase ${loc.status === 'ACTIVE' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600'}`}>
                        {loc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{loc.address}, {loc.city}, {loc.state}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span>📞 {loc.contactNumber}</span>
                      <span>✉️ {loc.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleEdit(loc)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
                      Edit
                    </button>
                    {locations.length > 1 && (
                      <button type="button" onClick={() => handleDelete(loc.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {locations.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">No branch locations configured.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
