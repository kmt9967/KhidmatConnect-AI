'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';
import { loadGoogleMaps, isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import { KARACHI_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/maps/types';
import type { GeoPoint, MapMarkerData } from '@/lib/maps/types';
import {
  markerSymbolFor,
  pulseHaloSpec,
  planMarkerUpdate,
  shouldPulseMarker,
  type MarkerSymbolSpec,
} from '@/lib/maps/operatorMap';

interface GoogleMapProps {
  /** Center the map on this point. Compared by VALUE, so polling refreshes
   *  that rebuild the parent never re-pan the map. */
  center?: GeoPoint | null;
  /** Zoom level (default 12) */
  zoom?: number;
  /** Markers to display. Reconciled by id - unchanged markers keep their
   *  Google object (and any open InfoWindow) across polling refreshes. */
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
  /** Marker rendered in the selected style (bigger pin, white outline). */
  selectedMarkerId?: string | null;
  /** Marker whose info card should be open. Parent owns this state so the
   *  queue list and the map can both open/close the same card. */
  openInfoMarkerId?: string | null;
  /** Called when the operator closes the info card. */
  onInfoClose?: () => void;
  /** Renders the info card body for a marker. Mounted into the InfoWindow
   *  through a dedicated React root, so it must not rely on context. */
  infoCard?: (marker: MapMarkerData) => ReactNode;
  /** Zoom restored by "Back to Case". */
  focusZoom?: number;
  /** Accessible label of the floating recenter control. */
  recenterLabel?: string;
  /** Accessible labels of the fullscreen toggle. */
  fullscreenLabel?: string;
  exitFullscreenLabel?: string;
}

/**
 * GoogleMap component - the operator command-center map.
 *
 * Renders a real Google Map when the browser API key is configured and falls
 * back gracefully to a placeholder when not. Markers are legacy
 * `google.maps.Marker` objects on purpose: AdvancedMarkerElement requires a
 * Cloud Map ID, which this project does not configure.
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
  selectedMarkerId = null,
  openInfoMarkerId = null,
  onInfoClose,
  infoCard,
  focusZoom,
  recenterLabel = 'Recenter on emergency',
  fullscreenLabel = 'Fullscreen map',
  exitFullscreenLabel = 'Exit fullscreen',
}: GoogleMapProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const entriesRef = useRef<Map<string, { marker: google.maps.Marker; data: MapMarkerData }>>(new Map());
  const markersListRef = useRef<MapMarkerData[]>([]);
  const halosRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const haloPhaseRef = useRef<0 | 1>(0);
  const haloTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const infoRootRef = useRef<Root | null>(null);
  const openInfoIdRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedMarkerId);
  const centerRef = useRef<GeoPoint | null>(center ?? null);
  const lastAppliedCenterRef = useRef<GeoPoint | null>(null);
  const programmaticMoveRef = useRef(false);
  const userMovedRef = useRef(false);
  const focusZoomRef = useRef(focusZoom);
  const reducedMotionRef = useRef(false);
  const callbacksRef = useRef({ onMarkerClick, onMapClick, onInfoClose });
  const infoCardRef = useRef(infoCard);

  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error' | 'not_configured'>('loading');
  const [userMoved, setUserMoved] = useState(false);
  const [realFullscreen, setRealFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);

  callbacksRef.current = { onMarkerClick, onMapClick, onInfoClose };
  infoCardRef.current = infoCard;
  focusZoomRef.current = focusZoom;
  centerRef.current = center ?? null;

  const setMoved = (value: boolean) => {
    userMovedRef.current = value;
    setUserMoved(value);
  };

  // ─── map bootstrap (once) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapDivRef.current) return;

      if (!isGoogleMapsConfigured()) {
        setMapState('not_configured');
        return;
      }

      try {
        const googleMaps = await loadGoogleMaps();
        if (cancelled || !googleMaps || !mapDivRef.current) return;

        if (typeof window !== 'undefined' && window.matchMedia) {
          reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        const initial = centerRef.current
          ? { lat: centerRef.current.latitude, lng: centerRef.current.longitude }
          : { lat: KARACHI_CENTER.latitude, lng: KARACHI_CENTER.longitude };
        lastAppliedCenterRef.current = centerRef.current;

        const map = new googleMaps.Map(mapDivRef.current, {
          center: initial,
          zoom,
          disableDefaultUI: !interactive,
          gestureHandling: interactive ? 'auto' : 'none',
          zoomControl: interactive,
          // The app provides one consistent fullscreen control (with a mobile
          // fallback), so the native one is hidden instead of duplicated.
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          clickableIcons: false,
          styles: [
            { elementType: 'geometry', stylers: [{ saturation: -30 }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          ],
        });

        if (onMapClick && interactive) {
          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              callbacksRef.current.onMapClick?.({
                latitude: e.latLng.lat(),
                longitude: e.latLng.lng(),
              });
            }
          });
        }

        if (interactive) {
          // Manual exploration flags. Programmatic pans/zooms are masked so
          // polling-driven or selection-driven moves never count as "moved".
          map.addListener('dragend', () => setMoved(true));
          map.addListener('zoom_changed', () => {
            if (!programmaticMoveRef.current) setMoved(true);
          });
        }

        googleMapRef.current = map;

        // Test/demo seam: lets the browser verification suite (and a demo
        // engineer in the console) observe markers and map state.
        if (typeof window !== 'undefined') {
          (window as unknown as { __kcMapDebug?: unknown }).__kcMapDebug = {
            map,
            markers: () => markersListRef.current,
            markerIds: () => Array.from(entriesRef.current.keys()),
            state: () => ({
              userMoved: userMovedRef.current,
              openInfoId: openInfoIdRef.current,
              fullscreen: Boolean(document.fullscreenElement),
            }),
          };
        }

        setMapState('ready');
      } catch (err) {
        console.error('[GoogleMap] Failed to initialize:', err);
        if (!cancelled) setMapState('error');
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (haloTimerRef.current) clearInterval(haloTimerRef.current);
      haloTimerRef.current = null;
      infoWindowRef.current?.close();
      infoRootRef.current?.unmount();
      infoRootRef.current = null;
      entriesRef.current.forEach((e) => e.marker.setMap(null));
      entriesRef.current.clear();
      halosRef.current.forEach((h) => h.setMap(null));
      halosRef.current.clear();
      googleMapRef.current = null;
    };
    // Only re-init on mount/unmount - center/zoom/markers handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── center: value-compared, never identity-compared ──────
  const centerLat = center?.latitude;
  const centerLng = center?.longitude;
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || centerLat == null || centerLng == null) return;
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return;
    const last = lastAppliedCenterRef.current;
    if (last && last.latitude === centerLat && last.longitude === centerLng) return;
    lastAppliedCenterRef.current = { latitude: centerLat, longitude: centerLng };
    moveProgrammatically(() => map.panTo({ lat: centerLat, lng: centerLng }));
    // An explicit selection change is an operator choice: clear "moved".
    setMoved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLng]);

  function moveProgrammatically(apply: () => void) {
    programmaticMoveRef.current = true;
    apply();
    // panTo/setZoom animate for a few hundred ms; mask their events.
    setTimeout(() => {
      programmaticMoveRef.current = false;
    }, 900);
  }

  // ─── markers: reconcile by id (polling-safe) ───────────────
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;

    const plan = planMarkerUpdate(markersListRef.current, markers);

    for (const id of plan.remove) {
      const entry = entriesRef.current.get(id);
      if (entry) {
        entry.marker.setMap(null);
        entriesRef.current.delete(id);
      }
      const halo = halosRef.current.get(id);
      if (halo) {
        halo.setMap(null);
        halosRef.current.delete(id);
      }
    }

    for (const data of plan.add) {
      const marker = new google.maps.Marker({
        position: { lat: data.position.latitude, lng: data.position.longitude },
        map,
        title: data.title,
      });
      const id = data.id;
      marker.addListener('click', () => {
        const entry = entriesRef.current.get(id);
        if (!entry) return;
        callbacksRef.current.onMarkerClick?.(entry.data);
        if (infoCardRef.current) openInfoWindow(id);
      });
      entriesRef.current.set(id, { marker, data });
    }

    for (const data of plan.update) {
      const entry = entriesRef.current.get(data.id);
      if (!entry) continue;
      entry.data = data;
      entry.marker.setPosition({ lat: data.position.latitude, lng: data.position.longitude });
      entry.marker.setTitle(data.title);
    }

    markersListRef.current = markers;
    restyleMarkers();
    syncHalos();
    // Re-anchor an open card if its marker was part of this refresh.
    if (openInfoIdRef.current) openInfoWindow(openInfoIdRef.current, true);
    // mapState is a dependency so reconciliation re-runs the instant the map
    // finishes bootstrapping. Markers commonly arrive (parent data fetch) before
    // the Google API resolves; without this they would sit unreconciled until the
    // next parent re-render (the 10s/15s poll), leaving the map blank that long.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, mapState]);

  // ─── selection styling ────────────────────────────────────
  useEffect(() => {
    selectedRef.current = selectedMarkerId;
    restyleMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarkerId]);

  function restyleMarkers() {
    entriesRef.current.forEach((entry, id) => {
      const selected = selectedRef.current === id;
      entry.marker.setIcon(toSymbol(markerSymbolFor(entry.data, selected)));
      entry.marker.setZIndex(selected ? 999 : entry.data.type === 'EMERGENCY' ? 100 : 50);
    });
  }

  // ─── subtle pulse halo for open CRITICAL unassigned cases ──
  function syncHalos() {
    const map = googleMapRef.current;
    if (!map) return;
    const wanted = reducedMotionRef.current
      ? []
      : markersListRef.current.filter(shouldPulseMarker).map((m) => m.id);
    const wantedSet = new Set(wanted);
    halosRef.current.forEach((halo, id) => {
      if (!wantedSet.has(id)) {
        halo.setMap(null);
        halosRef.current.delete(id);
      }
    });
    for (const id of wanted) {
      const entry = entriesRef.current.get(id);
      if (!entry) continue;
      let halo = halosRef.current.get(id);
      if (!halo) {
        halo = new google.maps.Marker({
          position: { lat: entry.data.position.latitude, lng: entry.data.position.longitude },
          map,
          zIndex: 10,
          clickable: false,
        });
        halosRef.current.set(id, halo);
      } else {
        halo.setPosition({ lat: entry.data.position.latitude, lng: entry.data.position.longitude });
      }
      halo.setIcon(toSymbol(pulseHaloSpec(haloPhaseRef.current)));
    }
    const needsTimer = wanted.length > 0 && haloTimerRef.current === null;
    if (needsTimer) {
      haloTimerRef.current = setInterval(() => {
        haloPhaseRef.current = haloPhaseRef.current === 0 ? 1 : 0;
        halosRef.current.forEach((halo) => halo.setIcon(toSymbol(pulseHaloSpec(haloPhaseRef.current))));
      }, 700);
    }
    if (wanted.length === 0 && haloTimerRef.current) {
      clearInterval(haloTimerRef.current);
      haloTimerRef.current = null;
    }
  }

  // ─── InfoWindow with a React root inside ──────────────────
  function ensureInfoWindow() {
    if (infoWindowRef.current) return infoWindowRef.current;
    const host = document.createElement('div');
    host.className = 'kc-map-info';
    infoRootRef.current = createRoot(host);
    const iw = new google.maps.InfoWindow({ content: host, maxWidth: 330 });
    iw.addListener('closeclick', () => {
      openInfoIdRef.current = null;
      callbacksRef.current.onInfoClose?.();
    });
    infoWindowRef.current = iw;
    return iw;
  }

  function openInfoWindow(id: string, keepOpenState = false) {
    const map = googleMapRef.current;
    const entry = entriesRef.current.get(id);
    const render = infoCardRef.current;
    if (!map || !entry || !render) return;
    if (!keepOpenState) openInfoIdRef.current = id;
    const iw = ensureInfoWindow();
    infoRootRef.current?.render(render(entry.data));
    iw.open({ map, anchor: entry.marker });
  }

  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;
    if (!openInfoMarkerId || !infoCard) {
      openInfoIdRef.current = openInfoMarkerId;
      infoWindowRef.current?.close();
      return;
    }
    openInfoWindow(openInfoMarkerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfoMarkerId, infoCard, markers, mapState]);

  // ─── recenter ("Back to Case") ────────────────────────────
  const handleRecenter = () => {
    const map = googleMapRef.current;
    const focus = centerRef.current;
    if (!map || !focus) return;
    moveProgrammatically(() => {
      map.panTo({ lat: focus.latitude, lng: focus.longitude });
      map.setZoom(focusZoomRef.current ?? zoom);
    });
    setMoved(false);
    if (openInfoIdRef.current) openInfoWindow(openInfoIdRef.current, true);
  };

  // ─── fullscreen (app-level, with mobile fallback) ─────────
  useEffect(() => {
    const onChange = () => setRealFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!cssFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCssFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cssFullscreen]);

  const fullscreenActive = realFullscreen || cssFullscreen;

  // Google needs a nudge after the container changes size.
  useEffect(() => {
    const map = googleMapRef.current;
    if (map) google.maps.event.trigger(map, 'resize');
  }, [fullscreenActive]);

  const toggleFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setCssFullscreen(false));
      return;
    }
    if (cssFullscreen) {
      setCssFullscreen(false);
      return;
    }
    if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setCssFullscreen(true));
    } else {
      // iOS Safari has no element fullscreen API: expand via CSS instead.
      setCssFullscreen(true);
    }
  };

  // ─── fallback UI ──────────────────────────────────────────
  if (mapState === 'not_configured') {
    return <MapPlaceholder message="Map not configured. Google Maps API key required." className={className} heightClass={heightClass} />;
  }

  if (mapState === 'error') {
    return <MapPlaceholder message="Map failed to load. Check your connection." className={className} heightClass={heightClass} />;
  }

  const controlButton =
    'flex items-center justify-center min-h-[40px] min-w-[40px] p-2 rounded-xl bg-[#161B22]/95 backdrop-blur border border-[#30363D] text-gray-200 shadow-lg transition-colors hover:text-white hover:border-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div
      ref={shellRef}
      className={`${cssFullscreen ? 'fixed inset-0 z-[90] rounded-none bg-[#0B0E14]' : `relative ${heightClass}`} ${className}`}
    >
      {mapState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B0E14]">
          <div className="flex items-center gap-2 text-sm text-[#8B949E]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#58A6FF] border-t-transparent" />
            Loading map...
          </div>
        </div>
      )}
      {/* absolute inset-0 (not h-full): the shell is always positioned and its
          height comes from heightClass. On mobile the shell height is often
          min-height-driven (e.g. h-full min-h-[450px] inside an indefinite flex
          chain), where a child's percentage height:100% resolves to 0. Anchoring
          the map to the shell's padding box keeps it filled at every viewport,
          matching the loading overlay and control cluster which are also absolute. */}
      <div ref={mapDivRef} className="absolute inset-0 rounded-xl overflow-hidden" />
      {interactive && mapState === 'ready' && (
        <div className="absolute bottom-7 right-3 z-20 flex flex-col gap-2">
          {userMoved && centerRef.current && (
            <button
              type="button"
              onClick={handleRecenter}
              aria-label={recenterLabel}
              title={recenterLabel}
              className={controlButton}
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreenActive ? exitFullscreenLabel : fullscreenLabel}
            title={fullscreenActive ? exitFullscreenLabel : fullscreenLabel}
            aria-pressed={fullscreenActive}
            className={controlButton}
          >
            {fullscreenActive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

/** Convert our serializable spec into a google.maps.Symbol. */
function toSymbol(spec: MarkerSymbolSpec): google.maps.Symbol {
  return {
    path: spec.path === 'CIRCLE' ? google.maps.SymbolPath.CIRCLE : spec.path,
    scale: spec.scale,
    fillColor: spec.fillColor,
    fillOpacity: spec.fillOpacity,
    strokeColor: spec.strokeColor,
    strokeWeight: spec.strokeWeight,
    ...(spec.anchor ? { anchor: new google.maps.Point(spec.anchor.x, spec.anchor.y) } : {}),
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7 7 0 1115 0z" />
          </svg>
        </div>
        <p className="text-xs text-[#6E7681]">{message}</p>
      </div>
    </div>
  );
}
