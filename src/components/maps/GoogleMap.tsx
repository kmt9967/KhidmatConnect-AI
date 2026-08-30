'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMaps, isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import { KARACHI_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/maps/types';
import type { GeoPoint, MapMarkerData } from '@/lib/maps/types';

interface GoogleMapProps {
  /** Center the map on this point */
  center?: GeoPoint | null;
  /** Zoom level (default 12) */
  zoom?: number;
  /** Markers to display */
  markers?: MapMarkerData[];
  /** Called when a marker is clicked */
  onMarkerClick?: (marker: MapMarkerData) => void;
  /** Called when the map is clicked */
  onMapClick?: (point: GeoPoint) => void;
  /** CSS height class */
  heightClass?: string;
  /** Additional CSS classes */
  className?: string;
  /** Show the user's location button */
  showMyLocation?: boolean;
  /** Disable interactions (for case tracker static display) */
  interactive?: boolean;
}

/**
 * GoogleMap component.
 *
 * Renders a real Google Map when the browser API key is configured.
 * Falls back gracefully to a placeholder when not configured or on error.
 */
export default function GoogleMap({
  center,
  zoom = DEFAULT_MAP_ZOOM,
  markers = [],
  onMarkerClick,
  onMapClick,
  heightClass = 'h-[400px]',
  className = '',
  showMyLocation = false,
  interactive = true,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error' | 'not_configured'>('loading');

  // Initialize the map
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapRef.current) return;

      if (!isGoogleMapsConfigured()) {
        setMapState('not_configured');
        return;
      }

      try {
        const googleMaps = await loadGoogleMaps();
        if (cancelled || !googleMaps || !mapRef.current) return;

        const mapCenter = center
          ? { lat: center.latitude, lng: center.longitude }
          : { lat: KARACHI_CENTER.latitude, lng: KARACHI_CENTER.longitude };

        const map = new googleMaps.Map(mapRef.current, {
          center: mapCenter,
          zoom,
          disableDefaultUI: !interactive,
          gestureHandling: interactive ? 'auto' : 'none',
          zoomControl: interactive,
          clickableIcons: false,
          styles: [
            { elementType: 'geometry', stylers: [{ saturation: -30 }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          ],
        });

        // Map click handler
        if (onMapClick && interactive) {
          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              onMapClick({
                latitude: e.latLng.lat(),
                longitude: e.latLng.lng(),
              });
            }
          });
        }

        googleMapRef.current = map;
        setMapState('ready');
      } catch (err) {
        console.error('[GoogleMap] Failed to initialize:', err);
        if (!cancelled) setMapState('error');
      }
    }

    initMap();

    return () => {
      cancelled = true;
    };
    // Only re-init on mount/unmount — center/zoom changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center when it changes
  useEffect(() => {
    if (!googleMapRef.current || !center) return;
    googleMapRef.current.panTo({ lat: center.latitude, lng: center.longitude });
  }, [center]);

  // Update markers
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Create new markers
    const newMarkers = markers.map((markerData) => {
      const marker = new google.maps.Marker({
        position: { lat: markerData.position.latitude, lng: markerData.position.longitude },
        map,
        title: markerData.title,
        animation: markerData.urgency === 'CRITICAL' ? google.maps.Animation.BOUNCE : undefined,
      });

      // Custom icon based on marker type
      const icon = getMarkerIcon(markerData);
      if (icon) marker.setIcon(icon);

      if (onMarkerClick) {
        marker.addListener('click', () => onMarkerClick(markerData));
      }

      return marker;
    });

    markersRef.current = newMarkers;
  }, [markers, onMarkerClick]);

  // Build fallback UI
  if (mapState === 'not_configured') {
    return <MapPlaceholder message="Map not configured. Google Maps API key required." className={className} heightClass={heightClass} />;
  }

  if (mapState === 'error') {
    return <MapPlaceholder message="Map failed to load. Check your connection." className={className} heightClass={heightClass} />;
  }

  return (
    <div className={`relative ${heightClass} ${className}`}>
      {mapState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B0E14]">
          <div className="flex items-center gap-2 text-sm text-[#8B949E]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#58A6FF] border-t-transparent" />
            Loading map...
          </div>
        </div>
      )}
      <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden" />
    </div>
  );
}

/**
 * Determine marker icon based on type and urgency.
 */
function getMarkerIcon(markerData: MapMarkerData): google.maps.Symbol | undefined {
  const colors: Record<string, string> = {
    EMERGENCY: markerData.urgency === 'CRITICAL' ? '#F85149' : '#D29922',
    RESOURCE: '#58A6FF',
    RESPONDER: '#3FB950',
    AMBULANCE: '#3FB950',
    USER: '#BC8CFF',
  };

  const color = colors[markerData.type] || '#58A6FF';

  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: color,
    fillOpacity: 0.9,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
  };
}

/**
 * Placeholder when Google Maps is not available.
 */
function MapPlaceholder({ message, className, heightClass }: { message: string; className: string; heightClass: string }) {
  return (
    <div className={`relative ${heightClass} rounded-xl border border-[#21262D] bg-[#11151C] flex items-center justify-center ${className}`}>
      <div className="text-center px-4">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1F2B]">
          <svg className="h-6 w-6 text-[#6E7681]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
        <p className="text-xs text-[#6E7681]">{message}</p>
      </div>
    </div>
  );
}
