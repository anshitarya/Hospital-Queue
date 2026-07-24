import { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix Leaflet default marker icon paths in web bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LeafletMapProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export default function LeafletMap({ latitude, longitude, onPositionChange }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Use absolute center coords or default if invalid
    const lat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 12.9716;
    const lng = typeof longitude === 'number' && !isNaN(longitude) ? longitude : 77.5946;

    const map = L.map(containerRef.current).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

    marker.on('dragend', () => {
      const position = marker.getLatLng();
      onPositionChange(position.lat, position.lng);
    });

    map.on('click', (e) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      marker.setLatLng([clickLat, clickLng]);
      onPositionChange(clickLat, clickLng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Update map and marker when lat/lng change from outside (e.g. search or geolocation)
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      const markerLatLng = markerRef.current.getLatLng();
      if (
        typeof latitude === 'number' && !isNaN(latitude) &&
        typeof longitude === 'number' && !isNaN(longitude) &&
        (markerLatLng.lat !== latitude || markerLatLng.lng !== longitude)
      ) {
        markerRef.current.setLatLng([latitude, longitude]);
        mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
      }
    }
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
    />
  );
}
