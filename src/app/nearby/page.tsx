'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { mockReliefResources } from '@/data/mockData';
import type { ReliefResource, ResourceType } from '@/types';
import InteractiveMap from '@/components/InteractiveMap';
import GoogleMap from '@/components/maps/GoogleMap';
import MobileBottomNav from '@/components/MobileBottomNav';
import { getCurrentPosition, probePermissionState } from '@/lib/maps/geolocation';
import {
  gpsButtonLabel,
  gpsHelpMessage,
  shouldOfferGpsRetry,
  toGpsUiState,
  type GpsCopy,
  type GpsUiState,
} from '@/lib/maps/geolocationUi';
import { haversineDistance, formatDistance } from '@/lib/maps/distance';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import type { GeoPoint, MapMarkerData } from '@/lib/maps/types';
import {
  AlertTriangle,
  MapPin,
  Search,
  Compass,
  Ambulance,
  Building2,
  Utensils,
  Home,
  Waves,
  ShieldCheck,
  Package,
  Navigation,
  X,
  CheckCircle2,
  Loader2,
  Globe,
  Shield,
  PhoneCall,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type LocationState = GpsUiState;

export default function NearbyPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);

  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedResource, setSelectedResource] = useState<ReliefResource | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('default');
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [useGoogleMap, setUseGoogleMap] = useState(false);

  // Copy for the location control. Reuses the shared GPS state mapping so the
  // wording stays identical to the emergency screen.
  const gpsCopy: GpsCopy = {
    defaultLabel: t.nearbyDetectButton,
    loadingLabel: t.nearbyDetectDetecting,
    successLabel: t.nearbyLocationDetected,
    blocked: t.nearbyDetectBlocked,
    unavailable: t.nearbyLocationUnavailable,
    timeout: t.nearbyLocationUnavailable,
    unsupported: t.nearbyLocationUnavailable,
    insecure: t.gpsInsecureHelp,
    tryAgain: t.tryAgain,
  };

  // No geolocation on load - only whether the map component can be used, plus a
  // read-only probe of the stored permission (never prompts, never locates).
  useEffect(() => {
    setUseGoogleMap(isGoogleMapsConfigured());
    void probePermissionState();
  }, []);

  // The ONLY place this page can reach the Geolocation API: a user click.
  const handleDetectLocation = async (force = false) => {
    setLocationState('loading');
    const result = await getCurrentPosition(force ? { force: true } : {});

    if (result.status === 'SUCCESS' && result.latitude != null && result.longitude != null) {
      setUserLocation({ latitude: result.latitude, longitude: result.longitude });
      setLocationState('success');
      return;
    }

    // Distances fall back to the published demo anchor; the page stays usable.
    setUserLocation(null);
    setLocationState(toGpsUiState(result.status));
  };

  const filterTabs: { id: string; label: string; icon: typeof Compass }[] = [
    { id: 'all', label: t.nearbyFilterAll, icon: Compass },
    { id: 'ambulance', label: t.nearbyFilterAmbulance, icon: Ambulance },
    { id: 'medical', label: t.nearbyFilterMedical, icon: Building2 },
    { id: 'food', label: t.nearbyFilterFood, icon: Utensils },
    { id: 'shelter', label: t.nearbyFilterShelter, icon: Home },
    { id: 'water', label: t.nearbyFilterWater, icon: Waves },
    { id: 'rescue', label: t.nearbyFilterRescue, icon: ShieldCheck },
    { id: 'supplies', label: t.nearbyFilterSupplies, icon: Package },
  ];

  const filteredResources = mockReliefResources.filter((r) => {
    if (activeFilter !== 'all' && r.type !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.organization?.toLowerCase().includes(q)
      );
    }
    return true;
  }).map((r) => {
    // Calculate real distance if user location is available
    let computedDistance = r.distance; // fallback to mock
    if (userLocation) {
      const dist = haversineDistance(userLocation, { latitude: r.coordinates.lat, longitude: r.coordinates.lng });
      computedDistance = formatDistance(dist) + ' away';
    }
    return { ...r, computedDistance };
  }).sort((a, b) => {
    // Sort by distance (parse numeric value)
    const parseDist = (d: string) => parseFloat(d.replace(/[^0-9.]/g, '')) || 999;
    return parseDist(a.computedDistance) - parseDist(b.computedDistance);
  });

  // Build map markers for Google Map
  const mapMarkers: MapMarkerData[] = filteredResources.map((r) => ({
    id: r.id,
    type: 'RESOURCE' as const,
    position: { latitude: r.coordinates.lat, longitude: r.coordinates.lng },
    title: r.name,
    subtitle: r.address,
    category: r.type,
    available: r.availability === 'available',
  }));

  // One short status line under the button; the detailed explanation, when a
  // detection failed, is rendered separately below it.
  const locationFailureMessage = gpsHelpMessage(locationState, gpsCopy);
  const locationChip =
    locationState === 'default'
      ? t.nearbyDetectPrompt
      : locationState === 'blocked'
        ? t.sharingStatusBlocked
        : locationState === 'insecure'
          ? t.gpsInsecureHelp
          : locationFailureMessage
            ? t.nearbyLocationUnavailable
            : gpsButtonLabel(locationState, gpsCopy);

  const availabilityColor = (a: string) => {
    if (a === 'available') return 'text-[#3FB950] bg-[#3FB950]/10 border-[#3FB950]/20';
    if (a === 'limited') return 'text-[#D29922] bg-[#D29922]/10 border-[#D29922]/20';
    if (a === 'busy') return 'text-[#F85149] bg-[#F85149]/10 border-[#F85149]/20';
    return 'text-[#6E7681] bg-[#6E7681]/10 border-[#6E7681]/20';
  };

  const typeIcon = (type: ResourceType) => {
    const map: Record<string, typeof Compass> = {
      ambulance: Ambulance,
      medical: Building2,
      food: Utensils,
      shelter: Home,
      water: Waves,
      rescue: ShieldCheck,
      supplies: Package,
    };
    return map[type] || Compass;
  };

  const primaryAction = (res: ReliefResource) => {
    switch (res.type) {
      case 'ambulance': return { label: t.callAmbulance, icon: PhoneCall };
      case 'medical': return { label: t.callNow, icon: PhoneCall };
      case 'shelter': return { label: t.callShelter, icon: PhoneCall };
      case 'food': return { label: t.callDistribution, icon: PhoneCall };
      default: return { label: t.nearbyCallDirect, icon: PhoneCall };
    }
  };

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14] pb-20 md:pb-0">
      {/* Top Header */}
      <div className="sticky top-0 z-40 border-b border-[#21262D] bg-[#0B0E14]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3FB950] to-[#059669]">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-[#E6EDF3] truncate">{t.nearbyTitle}</h1>
              <p className="text-[10px] text-[#6E7681] truncate">{t.nearbySubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-[#11151C] p-0.5 rounded-xl border border-[#21262D]">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-[10px] rounded-lg font-bold transition-colors ${
                  viewMode === 'list' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#6E7681] hover:text-[#E6EDF3]'
                }`}
              >
                {t.nearbyViewList}
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-2.5 py-1 text-[10px] rounded-lg font-bold transition-colors ${
                  viewMode === 'map' ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#6E7681] hover:text-[#E6EDF3]'
                }`}
              >
                {t.nearbyViewMap}
              </button>
            </div>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-full border border-[#21262D] px-2.5 py-1 text-xs font-medium text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              {isUrdu ? 'EN' : 'اردو'}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {/* Location status - GPS is only touched by the button below. */}
        <div className="mb-3 rounded-xl border border-[#21262D] bg-[#11151C] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin
              className={`h-4 w-4 shrink-0 ${
                locationState === 'success'
                  ? 'text-[#3FB950]'
                  : locationState === 'default'
                  ? 'text-[#8B949E]'
                  : 'text-[#D29922]'
              }`}
            />
            <span className="text-xs font-medium text-[#E6EDF3]">{locationChip}</span>
            {/* Distances without a detected position are measured from the published
                demo anchor - say so instead of implying live GPS. */}
            {!userLocation && locationState !== 'loading' && (
              <span className="text-[10px] text-[#6E7681]">— {t.nearbyDemoLocation}</span>
            )}
            <button
              type="button"
              onClick={() => handleDetectLocation(false)}
              disabled={locationState === 'loading'}
              className="ms-auto flex items-center gap-1.5 rounded-lg border border-[#21262D] bg-[#1A1F2B] px-2.5 py-1.5 text-[11px] font-semibold text-[#E6EDF3] transition-colors hover:border-[#3FB950]/40 min-h-[32px] disabled:opacity-60"
            >
              {locationState === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : locationState === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[#3FB950]" />
              ) : (
                <Navigation className="h-3.5 w-3.5 text-[#58A6FF]" />
              )}
              <span>
                {locationState === 'success' ? gpsButtonLabel('default', gpsCopy) : gpsButtonLabel(locationState, gpsCopy)}
              </span>
            </button>
          </div>
          {locationFailureMessage && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#D29922]" role="status">
              {locationFailureMessage}
            </p>
          )}
          {shouldOfferGpsRetry(locationState) && (
            <button
              type="button"
              onClick={() => handleDetectLocation(true)}
              className="mt-1.5 rounded-lg border border-[#30363D] px-2.5 py-1 text-[11px] font-semibold text-[#8B949E] transition-colors hover:border-[#3FB950]/40 hover:text-[#E6EDF3]"
            >
              {gpsCopy.tryAgain}
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6E7681]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.nearbySearchPlaceholder}
            className="w-full rounded-xl border border-[#21262D] bg-[#11151C] py-3 ps-10 pe-4 text-xs text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#58A6FF] focus:outline-none min-h-[44px]"
          />
        </div>

        {/* Filter Chips */}
        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-semibold transition-all shrink-0 ${
                  isActive
                    ? 'bg-[#58A6FF] text-white shadow-md shadow-blue-900/30'
                    : 'bg-[#11151C] text-[#8B949E] hover:text-[#E6EDF3] border border-[#21262D]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-[#58A6FF]'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Map View */}
        {viewMode === 'map' && (
          <div className="rounded-2xl overflow-hidden border border-[#21262D] shadow-xl mb-4">
            {useGoogleMap ? (
              <GoogleMap
                center={userLocation}
                markers={mapMarkers}
                onMarkerClick={(marker) => {
                  const res = mockReliefResources.find((r) => r.id === marker.id);
                  if (res) setSelectedResource(res);
                }}
                heightClass="h-[400px] sm:h-[480px]"
                className="rounded-2xl"
              />
            ) : (
              <InteractiveMap
                resources={filteredResources}
                heightClass="h-[400px] sm:h-[480px]"
                lang={lang}
                showLayersControl
              />
            )}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {filteredResources.length === 0 ? (
              <div className="rounded-xl border border-[#21262D] bg-[#11151C] p-8 text-center text-xs text-[#6E7681]">
                {t.nearbyNoResults}
              </div>
            ) : (
              filteredResources.map((res) => {
                const TypeIcon = typeIcon(res.type);
                const action = primaryAction(res);
                const ActionIcon = action.icon;
                return (
                  <div
                    key={res.id}
                    className="rounded-xl border border-[#21262D] bg-[#11151C] p-4 hover:border-[#58A6FF]/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#58A6FF]/10 shrink-0 mt-0.5">
                          <TypeIcon className="h-4 w-4 text-[#58A6FF]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-bold text-[#E6EDF3] leading-tight">
                              {isUrdu && res.nameUr ? res.nameUr : res.name}
                            </h3>
                            <span className="rounded-full bg-[#58A6FF]/10 border border-[#58A6FF]/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#58A6FF] uppercase">
                              {res.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#6E7681] flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 text-[#F85149] shrink-0" />
                            {isUrdu && res.addressUr ? res.addressUr : res.address}
                          </p>
                        </div>
                      </div>
                      <span className={`rounded-xl border px-2 py-1 text-[10px] font-bold uppercase shrink-0 ${availabilityColor(res.availability)}`}>
                        {res.availability}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-[10px] text-[#6E7681] mb-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Compass className="h-3 w-3" />
                        {res.computedDistance}
                      </span>
                      {res.organization && (
                        <span>{res.organization}</span>
                      )}
                      {res.verified && (
                        <span className="flex items-center gap-0.5 text-[#3FB950]">
                          <CheckCircle2 className="h-3 w-3" />
                          {t.nearbyVerifiedLabel}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#21262D]">
                      <a
                        href={`tel:${res.phone}`}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#58A6FF]/10 border border-[#58A6FF]/20 py-2.5 text-[11px] font-bold text-[#58A6FF] hover:bg-[#58A6FF]/20 transition-colors min-h-[40px]"
                      >
                        <ActionIcon className="h-3.5 w-3.5" />
                        {action.label}
                      </a>
                      <button
                        onClick={() => setSelectedResource(res)}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0B0E14] border border-[#21262D] px-3 py-2.5 text-[11px] font-bold text-[#8B949E] hover:text-[#E6EDF3] hover:border-[#30363D] transition-colors min-h-[40px]"
                      >
                        {t.nearbyResourceDetails}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Emergency Help Float */}
        <div className="mt-6 mb-4">
          <Link
            href="/emergency"
            className="flex items-center justify-center gap-2 rounded-xl border border-[#F85149]/20 bg-[#F85149]/5 py-3.5 text-sm font-bold text-[#F85149] hover:border-[#F85149]/40 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            {t.requestHelp}
          </Link>
        </div>
      </main>

      {/* Resource Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedResource && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedResource(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-full max-w-md bg-[#11151C] border-t sm:border border-[#21262D] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl z-10 max-h-[85vh] overflow-y-auto"
            >
              {/* Drag handle */}
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#21262D] sm:hidden" />

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-[#E6EDF3]">
                    {isUrdu && selectedResource.nameUr ? selectedResource.nameUr : selectedResource.name}
                  </h3>
                  <p className="text-[11px] text-[#58A6FF] font-mono mt-0.5">
                    {selectedResource.organization || 'Relief Facility'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedResource(null)}
                  className="rounded-xl bg-[#0B0E14] border border-[#21262D] p-1.5 text-[#6E7681] hover:text-[#E6EDF3] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Details */}
              <div className="space-y-2.5 text-xs">
                <div className="rounded-xl bg-[#0B0E14] border border-[#21262D] p-3 space-y-1">
                  <span className="text-[10px] text-[#6E7681] font-mono uppercase">{t.nearbyAddressLabel}</span>
                  <p className="text-[#E6EDF3] font-medium">{isUrdu && selectedResource.addressUr ? selectedResource.addressUr : selectedResource.address}</p>
                  <p className="text-[10px] text-[#6E7681]">
                    {filteredResources.find((r) => r.id === selectedResource.id)?.computedDistance || selectedResource.distance}
                  </p>
                </div>

                <div className="rounded-xl bg-[#0B0E14] border border-[#21262D] p-3 space-y-1">
                  <span className="text-[10px] text-[#6E7681] font-mono uppercase">{t.nearbyStatusLabel}</span>
                  <p className={`font-bold uppercase ${selectedResource.availability === 'available' ? 'text-[#3FB950]' : selectedResource.availability === 'limited' ? 'text-[#D29922]' : 'text-[#F85149]'}`}>
                    {selectedResource.availability}
                  </p>
                </div>

                {selectedResource.capacity && (
                  <div className="rounded-xl bg-[#0B0E14] border border-[#21262D] p-3 space-y-1">
                    <span className="text-[10px] text-[#6E7681] font-mono uppercase">{t.nearbyCapacityLabel}</span>
                    <p className="text-[#E6EDF3] font-mono">{selectedResource.capacity}</p>
                  </div>
                )}

                {selectedResource.stock && (
                  <div className="rounded-xl bg-[#0B0E14] border border-[#21262D] p-3 space-y-1">
                    <span className="text-[10px] text-[#6E7681] font-mono uppercase">{t.nearbyStockLabel}</span>
                    <p className="text-[#E6EDF3] font-mono">{selectedResource.stock}</p>
                  </div>
                )}

                {selectedResource.verified && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#3FB950]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="font-bold">{t.nearbyVerifiedLabel}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[#21262D]">
                <a
                  href={`tel:${selectedResource.phone}`}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#58A6FF] py-3 text-xs font-bold text-white min-h-[44px]"
                >
                  <PhoneCall className="h-4 w-4" />
                  {t.nearbyCallDirect}
                </a>
                <a
                  href={`https://maps.google.com/?q=${selectedResource.coordinates.lat},${selectedResource.coordinates.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0B0E14] border border-[#21262D] py-3 text-xs font-bold text-[#E6EDF3] hover:bg-[#1A1F2B] min-h-[44px]"
                >
                  <Navigation className="h-4 w-4 text-[#58A6FF]" />
                  {t.nearbyOpenMaps}
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MobileBottomNav />
    </div>
  );
}
