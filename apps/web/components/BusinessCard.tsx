'use client';

import { Icon } from '@/components/Icons';

// Helper to compute distance in km using Haversine formula
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface BusinessCardProps {
  business: any; // PublicBusiness with latitude/longitude
  userLocation: { latitude: number; longitude: number } | null;
  onClick: () => void;
}

export function BusinessCard({ business, userLocation, onClick }: BusinessCardProps) {
  // 1. Calculate distance (nearest branch)
  let minDistanceStr = '— km';
  let nearestLoc = null;
  let minDistance = Infinity;

  if (userLocation && business.locations) {
    business.locations.forEach((loc: any) => {
      if (loc.latitude !== null && loc.longitude !== null && loc.latitude !== undefined && loc.longitude !== undefined) {
        const dist = getDistance(
          userLocation.latitude,
          userLocation.longitude,
          loc.latitude,
          loc.longitude
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestLoc = loc;
        }
      }
    });
  }

  if (minDistance !== Infinity) {
    minDistanceStr = minDistance < 1 ? `${(minDistance * 1000).toFixed(0)}m` : `${minDistance.toFixed(1)} km`;
  }

  // 2. Real rating average calculated across doctors
  let totalRating = 0;
  let ratingCount = 0;
  let minFee = Infinity;

  business.locations?.forEach((loc: any) => {
    loc.doctors?.forEach((doc: any) => {
      if (doc.rating !== null && doc.rating !== undefined) {
        totalRating += doc.rating;
        ratingCount++;
      }
      if (doc.consultationFee !== null && doc.consultationFee !== undefined) {
        if (doc.consultationFee < minFee) {
          minFee = doc.consultationFee;
        }
      }
    });
  });

  const clinicRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : null;
  const currentHour = new Date().getHours();
  const isOpen = currentHour >= 8 && currentHour < 21;

  // Nice CSS/SVG gradients for business thumbnails
  const numericId = business.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'from-emerald-500 to-teal-600',
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-fuchsia-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600',
  ];
  const gradient = gradients[numericId % gradients.length];

  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700/80 shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col h-full animate-fade-in"
    >
      {/* Thumbnail Banner */}
      <div className="relative w-full h-36 bg-gradient-to-br bg-slate-100 dark:bg-slate-950 overflow-hidden shrink-0">
        <div className={`absolute inset-0 bg-gradient-to-tr ${gradient} opacity-90 group-hover:scale-105 transition-transform duration-500`} />
        
        {/* Floating Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-white/90 text-slate-800 dark:bg-slate-900/90 dark:text-slate-100 backdrop-blur-xs shadow-xs">
            {business.businessType || 'CLINIC'}
          </span>
          {business.locations?.length > 1 && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-brand-500 text-white shadow-xs">
              {business.locations.length} Branches
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3 z-10">
          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase shadow-xs ${isOpen ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Center Initial Brand Identifier */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-4xl font-black text-white/20 select-none tracking-wider">
            {business.name.substring(0, 2).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Info Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row */}
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 tracking-tight line-clamp-1 group-hover:text-brand-500 transition-colors">
              {business.name}
            </h3>
            {/* Rating badge */}
            {clinicRating && (
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-emerald-500 text-white text-[10px] font-black shrink-0 shadow-xs">
                <span>{clinicRating}</span>
                <span>★</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium flex items-center gap-1">
            <Icon.Globe className="h-3 w-3 inline" />
            <span>Healthcare Services</span>
          </p>
        </div>

        {/* Details row */}
        <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-850 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-base">📍</span>
            <span>{minDistanceStr}</span>
          </div>

          {minFee !== Infinity && (
            <div className="flex items-center gap-1">
              <span className="font-bold text-slate-800 dark:text-slate-200">₹{minFee}</span>
              <span className="text-[9px] text-slate-400 font-medium">start</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
