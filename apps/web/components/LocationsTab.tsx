'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Toast, type ToastMessage } from '@/components/Toast';
import { TableSkeleton } from '@/components/Skeleton';
import dynamic from 'next/dynamic';
import { Icon } from './Icons';

const LocationPickerModal = dynamic(() => import('./LocationPickerModal'), { ssr: false });

interface LocationItem {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  contactNumber: string;
  bookingContactNumber?: string | null;
  email: string | null;
  googleReviewUrl?: string | null;
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
  const [bookingContactNumber, setBookingContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
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
    setBookingContactNumber('');
    setEmail('');
    setGoogleReviewUrl('');
    setStatus('ACTIVE');
    setLatitude(null);
    setLongitude(null);
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
    setBookingContactNumber(loc.bookingContactNumber ?? '');
    setEmail(loc.email ?? '');
    setGoogleReviewUrl(loc.googleReviewUrl ?? '');
    setStatus(loc.status);
    setLatitude(loc.latitude ?? null);
    setLongitude(loc.longitude ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (latitude === null || longitude === null) {
      setToast({ type: 'err', msg: 'Please select a valid map location for this branch.' });
      return;
    }
    setSubmitting(true);
    const body = { name, address, city, state, country, postalCode, contactNumber, bookingContactNumber, email, googleReviewUrl, status, latitude, longitude };
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
      <div className="p-5 sm:p-6 max-w-5xl mx-auto space-y-6">
        <TableSkeleton rows={4} cols={4} />
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
            <div>
              <button
                type="button"
                onClick={() => setIsMapOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/80 font-bold text-xs transition-colors border border-slate-200 dark:border-slate-700"
              >
                📍 Pick Location on Map
              </button>
              {latitude !== null && longitude !== null && (
                <div className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <span>✓ Map Coordinates:</span>
                  <span className="font-mono">{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
                </div>
              )}
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
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Booking Contact Number (Optional)</label>
              <input type="text" className="input mt-1 w-full py-1.5 text-xs" value={bookingContactNumber} onChange={(e) => setBookingContactNumber(e.target.value)} placeholder="e.g. +91 9876543210 (For patient appointments)" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Email Address</label>
              <input type="email" className="input mt-1 w-full py-1.5 text-xs" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="branch@clinic.local" required />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Google Review Link (Optional)</label>
              <input type="url" className="input mt-1 w-full py-1.5 text-xs" value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} placeholder="https://share.google/unmrc0wZcKNlLQLOj" />
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
                    {loc.googleReviewUrl && (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span>⭐ Google Review:</span>
                        <a href={loc.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[220px]">
                          {loc.googleReviewUrl}
                        </a>
                      </div>
                    )}
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

      <LocationPickerModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        initialLat={latitude}
        initialLng={longitude}
        onConfirm={(details) => {
          setAddress(details.address);
          setCity(details.city);
          setState(details.state);
          setCountry(details.country);
          setPostalCode(details.postalCode);
          setLatitude(details.latitude);
          setLongitude(details.longitude);
        }}
      />
    </div>
  );
}
