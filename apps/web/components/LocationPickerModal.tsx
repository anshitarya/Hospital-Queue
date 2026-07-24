'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from './Icons';

// Dynamically import LeafletMap component to prevent SSR "window is not defined" error
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[350px] sm:h-[400px] rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse flex flex-col items-center justify-center text-slate-400 gap-2 border border-slate-200 dark:border-slate-800">
      <Icon.Activity className="h-6 w-6 animate-spin text-slate-400" />
      <span className="text-xs font-semibold">Initializing interactive map...</span>
    </div>
  ),
});

interface LocationDetails {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLng?: number | null;
  onConfirm: (details: LocationDetails) => void;
}

interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

export default function LocationPickerModal({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  onConfirm,
}: LocationPickerModalProps) {
  // Default map center (Bangalore center)
  const defaultLat = 12.9716;
  const defaultLng = 77.5946;

  const [lat, setLat] = useState<number>(initialLat || defaultLat);
  const [lng, setLng] = useState<number>(initialLng || defaultLng);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parsed location address details
  const [formattedAddress, setFormattedAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search suggestion autocomplete
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      void searchPlaces(searchQuery);
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Trigger load of address details on mount if initial lat/lng is supplied
  useEffect(() => {
    if (isOpen) {
      const activeLat = initialLat || defaultLat;
      const activeLng = initialLng || defaultLng;
      setLat(activeLat);
      setLng(activeLng);
      void reverseGeocode(activeLat, activeLng);
      setErrorMsg(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, initialLat, initialLng]);

  // Clean state when modal opens
  if (!isOpen) return null;

  async function searchPlaces(query: string) {
    if (!query.trim()) return;
    setIsSearching(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&addressdetails=1&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      if (!res.ok) throw new Error('Failed to fetch search results.');
      const data = (await res.json()) as NominatimResult[];
      setSearchResults(data);
      if (data.length === 0) {
        setErrorMsg('No matches found. Try a different search term.');
      }
    } catch (err) {
      setErrorMsg('Search failed. Check your network or API status.');
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  }

  async function reverseGeocode(latitude: number, longitude: number) {
    setReverseGeocoding(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      if (!res.ok) throw new Error('Reverse geocoding failed.');
      const data = (await res.json()) as NominatimResult;

      if (data && data.address) {
        const addr = data.address;
        const dispCity = addr.city || addr.town || addr.village || addr.suburb || '';
        const dispState = addr.state || '';
        const dispCountry = addr.country || '';
        const dispPostcode = addr.postcode || '';

        // Formulate a clean street address
        const road = addr.road || '';
        const houseNum = addr.house_number || '';
        const suburb = addr.suburb || addr.neighbourhood || '';
        const cleanStreet = [houseNum, road, suburb].filter(Boolean).join(', ') || data.display_name.split(',')[0];

        setFormattedAddress(cleanStreet || data.display_name);
        setCity(dispCity);
        setState(dispState);
        setCountry(dispCountry);
        setPostalCode(dispPostcode);
      } else {
        setFormattedAddress(data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }
    } catch (err) {
      console.error('Reverse geocode error:', err);
      setFormattedAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    } finally {
      setReverseGeocoding(false);
    }
  }

  function handleSelectSearchResult(result: NominatimResult) {
    const nextLat = parseFloat(result.lat);
    const nextLng = parseFloat(result.lon);
    setLat(nextLat);
    setLng(nextLng);
    setSearchResults([]);
    setSearchQuery(result.display_name);

    if (result.address) {
      const addr = result.address;
      const dispCity = addr.city || addr.town || addr.village || addr.suburb || '';
      const dispState = addr.state || '';
      const dispCountry = addr.country || '';
      const dispPostcode = addr.postcode || '';

      const road = addr.road || '';
      const houseNum = addr.house_number || '';
      const suburb = addr.suburb || addr.neighbourhood || '';
      const cleanStreet = [houseNum, road, suburb].filter(Boolean).join(', ') || result.display_name.split(',')[0];

      setFormattedAddress(cleanStreet || result.display_name);
      setCity(dispCity);
      setState(dispState);
      setCountry(dispCountry);
      setPostalCode(dispPostcode);
    } else {
      void reverseGeocode(nextLat, nextLng);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setErrorMsg(null);
    setIsFetchingLocation(true);
    setReverseGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLng = position.coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        void reverseGeocode(nextLat, nextLng);
        setIsFetchingLocation(false);
      },
      (error) => {
        setReverseGeocoding(false);
        setIsFetchingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMsg('Location permission denied. Please allow access or search manually.');
        } else {
          setErrorMsg('Failed to fetch current location.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function handlePositionChange(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    void reverseGeocode(newLat, newLng);
  }

  function handleConfirm() {
    onConfirm({
      address: formattedAddress,
      city,
      state,
      country,
      postalCode,
      latitude: lat,
      longitude: lng,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <header className="px-5 py-4 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>📍 Pick Location on Map</span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Search for your branch or drag the marker to your clinic location.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
          >
            <Icon.X className="h-4.5 w-4.5" />
          </button>
        </header>

        {/* Content body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Autocomplete & Geo location Search Row */}
          <div className="flex gap-2 relative">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                {isSearching ? (
                  <Icon.Activity className="h-4 w-4 animate-spin text-emerald-500" />
                ) : (
                  <Icon.Search className="h-4 w-4" />
                )}
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="input pl-9 pr-8 w-full !py-2 text-xs"
                placeholder="Search clinic name, locality, street, landmark..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchPlaces(searchQuery);
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setErrorMsg(null);
                  }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-250"
                >
                  <Icon.X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void searchPlaces(searchQuery)}
              disabled={isSearching || !searchQuery.trim()}
              className="btn-primary !py-2 !px-4 text-xs font-semibold shrink-0"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isFetchingLocation}
              title="Use current location"
              className="btn-secondary !py-2 !px-3 shrink-0 flex items-center justify-center gap-1.5 hover:text-emerald-600 dark:hover:text-emerald-450 text-xs font-bold"
            >
              {isFetchingLocation ? (
                <Icon.Activity className="h-4 w-4 shrink-0 animate-spin text-emerald-500" />
              ) : (
                <Icon.MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
              <span>Use current location</span>
            </button>

            {/* Suggestions Overlay Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 max-h-48 overflow-y-auto rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl z-[9999] divide-y divide-slate-100 dark:divide-slate-900 animate-slide-up">
                {searchResults.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    onClick={() => handleSelectSearchResult(result)}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors truncate block"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="text-xs p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-350 border border-rose-200/50 dark:border-rose-900/50 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Interactive Map */}
          <div className="relative h-[300px] sm:h-[350px] w-full rounded-xl overflow-hidden shadow-inner">
            <LeafletMap latitude={lat} longitude={lng} onPositionChange={handlePositionChange} />
          </div>

          {/* Address Details Output box */}
          <div className="bg-slate-50/60 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="text-slate-400 text-xs mt-0.5 shrink-0">📍</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Resolved Address
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mt-0.5 leading-relaxed break-words min-h-4">
                  {reverseGeocoding ? (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Icon.Activity className="h-3 w-3 animate-spin text-slate-400" />
                      Resolving address...
                    </span>
                  ) : (
                    formattedAddress || 'Place marker to resolve address details'
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">City</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5 min-h-4">
                  {city || '—'}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">State</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5 min-h-4">
                  {state || '—'}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Latitude</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                  {lat.toFixed(6)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Longitude</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                  {lng.toFixed(6)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <footer className="px-5 py-3 border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/20 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-250 !py-2 !px-4 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={reverseGeocoding}
            className="btn bg-brand-500 hover:bg-brand-600 text-white !py-2 !px-4 text-xs font-bold shadow-sm"
          >
            Confirm Location
          </button>
        </footer>
      </div>
    </div>
  );
}
