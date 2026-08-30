'use client';

import { useState, useEffect } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  Building2,
  Check,
  Flame,
  HeartHandshake,
  Layers,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  Utensils,
  Waves,
  Zap,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { EmergencyCase, ReliefResource, Language } from '@/types';

interface InteractiveMapProps {
  cases?: EmergencyCase[];
  resources?: ReliefResource[];
  selectedCaseId?: string | null;
  onSelectCase?: (caseId: string) => void;
  onQuickAssign?: (caseId: string, resourceId: string) => void;
  singleCaseMode?: EmergencyCase | null;
  interactive?: boolean;
  heightClass?: string;
  lang?: Language;
  showLayersControl?: boolean;
  className?: string;
}

export default function InteractiveMap({
  cases = [],
  resources = [],
  selectedCaseId,
  onSelectCase,
  onQuickAssign,
  singleCaseMode,
  interactive = true,
  heightClass = 'h-[520px]',
  lang: langProp,
  showLayersControl = true,
  className = '',
}: InteractiveMapProps) {
  const { lang: ctxLang } = useLanguage();
  const lang = langProp || ctxLang;

  const [activeLayers, setActiveLayers] = useState({
    emergencies: true,
    responders: true,
    hospitals: true,
  });

  const [activeMarkerTooltip, setActiveMarkerTooltip] = useState<{
    id: string;
    title: string;
    subtitle: string;
    urgency?: string;
    type?: string;
    responder?: string;
    phone?: string;
    status?: string;
    eta?: string;
    isResource?: boolean;
    x: number;
    y: number;
  } | null>(null);

  const [responderOffset, setResponderOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setResponderOffset((prev) => {
        const nextX = (prev.x + 0.25) % 30;
        const nextY = (prev.y + 0.15) % 20;
        return { x: nextX, y: nextY };
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const displayedCases = singleCaseMode ? [singleCaseMode] : cases;

  const getCoordinatesPos = (lat?: number, lng?: number, index: number = 0) => {
    if (!lat || !lng) {
      return { x: 120 + (index * 80) % 360, y: 140 + (index * 60) % 200, unconfirmed: true };
    }
    const minLat = 24.8;
    const maxLat = 24.98;
    const minLng = 67.0;
    const maxLng = 67.15;
    const normX = ((lng - minLng) / (maxLng - minLng)) * 520 + 40;
    const normY = (1 - (lat - minLat) / (maxLat - minLat)) * 320 + 40;
    return {
      x: Math.max(40, Math.min(560, normX)),
      y: Math.max(40, Math.min(360, normY)),
      unconfirmed: false,
    };
  };

  return (
    <div
      className={`relative w-full ${heightClass} bg-[#080B10] rounded-2xl overflow-hidden border border-[#30363D] shadow-2xl select-none ${className}`}
    >
      {/* Background Subtle GIS Grid */}
      <div className="absolute inset-0 bg-dot-pattern opacity-25 pointer-events-none" />

      {/* Tactical Status Pill */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#161B22]/90 backdrop-blur-md rounded-xl border border-[#30363D] text-[11px] font-mono text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        <span>EOC LIVE MAP • 24°N 67°E</span>
      </div>

      {/* Layer Filters Control */}
      {showLayersControl && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 p-1 bg-[#161B22]/90 backdrop-blur-md rounded-xl border border-[#30363D] text-xs text-gray-300">
          <button
            onClick={() => setActiveLayers((p) => ({ ...p, emergencies: !p.emergencies }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold ${
              activeLayers.emergencies
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Incidents</span>
          </button>
          <button
            onClick={() => setActiveLayers((p) => ({ ...p, responders: !p.responders }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold ${
              activeLayers.responders
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Ambulance className="w-3 h-3" />
            <span>Fleet</span>
          </button>
          <button
            onClick={() => setActiveLayers((p) => ({ ...p, hospitals: !p.hospitals }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold ${
              activeLayers.hospitals
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>Facilities</span>
          </button>
        </div>
      )}

      {/* Vector GIS Graphics */}
      <svg
        viewBox="0 0 600 400"
        className="w-full h-full object-cover"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#080B10" stopOpacity="0" />
          </radialGradient>
          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <circle cx="300" cy="200" r="280" fill="url(#mapGlow)" />

        {/* Coastal contour line */}
        <path
          d="M 0 380 Q 150 360 280 375 T 600 390 L 600 400 L 0 400 Z"
          fill="#0c4a6e"
          opacity="0.3"
        />

        {/* Major Highway Arteries */}
        <path d="M 10 240 Q 180 210 320 220 T 590 160" stroke="#1E293B" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 10 240 Q 180 210 320 220 T 590 160" stroke="#475569" strokeWidth="1.5" strokeDasharray="6 6" fill="none" />
        <path d="M 220 10 Q 250 180 280 390" stroke="#1E293B" strokeWidth="4.5" fill="none" />
        <path d="M 420 20 L 360 210 L 480 390" stroke="#1E293B" strokeWidth="3.5" fill="none" />

        {/* District Zone Labels */}
        <text x="340" y="160" fill="#334155" fontSize="10" fontFamily="monospace" letterSpacing="1">GULSHAN SECTOR</text>
        <text x="180" y="240" fill="#334155" fontSize="10" fontFamily="monospace" letterSpacing="1">SADDAR COMMAND</text>
        <text x="390" y="280" fill="#334155" fontSize="10" fontFamily="monospace" letterSpacing="1">KORANGI INDUSTRIAL</text>

        {/* Facilities */}
        {activeLayers.hospitals &&
          resources.map((res, i) => {
            const pos = getCoordinatesPos(res.coordinates.lat, res.coordinates.lng, i);
            return (
              <g
                key={res.id}
                className="cursor-pointer transition-transform hover:scale-125"
                onClick={() =>
                  setActiveMarkerTooltip({
                    id: res.id,
                    title: res.name,
                    subtitle: res.address,
                    type: res.type.toUpperCase(),
                    status: res.availability.toUpperCase(),
                    isResource: true,
                    x: pos.x,
                    y: pos.y,
                  })
                }
              >
                <circle cx={pos.x} cy={pos.y} r="14" fill="#0B0E14" stroke="#6366F1" strokeWidth="1.5" opacity="0.9" />
                <circle cx={pos.x} cy={pos.y} r="5" fill="#818CF8" />
                <text x={pos.x + 12} y={pos.y + 3} fill="#94A3B8" fontSize="8" fontFamily="sans-serif">
                  {res.name.substring(0, 15)}...
                </text>
              </g>
            );
          })}

        {/* Active En-Route Connection Trajectories */}
        {displayedCases.map((c) => {
          if (!c.assignedResource || !c.assignedResource.currentCoords || !c.location.coordinates) return null;
          const reqPos = getCoordinatesPos(c.location.coordinates.lat, c.location.coordinates.lng);
          const ambPos = getCoordinatesPos(c.assignedResource.currentCoords.lat, c.assignedResource.currentCoords.lng);

          return (
            <g key={`route-${c.id}`}>
              <line
                x1={ambPos.x + responderOffset.x * 0.15}
                y1={ambPos.y + responderOffset.y * 0.15}
                x2={reqPos.x}
                y2={reqPos.y}
                stroke="#10B981"
                strokeWidth="3"
                strokeDasharray="6 6"
                className="animate-pulse"
                opacity="0.8"
              />
              <g transform={`translate(${(ambPos.x + reqPos.x) / 2}, ${(ambPos.y + reqPos.y) / 2})`}>
                <rect x="-30" y="-10" width="60" height="20" rx="10" fill="#080B10" stroke="#10B981" strokeWidth="1.5" />
                <text x="0" y="3" fill="#34D399" fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                  ETA: {c.assignedResource.etaMinutes}m
                </text>
              </g>
            </g>
          );
        })}

        {/* Emergency Case Markers */}
        {activeLayers.emergencies &&
          displayedCases.map((c, idx) => {
            const isSelected = selectedCaseId === c.id;
            const isCritical = c.urgency === 'critical';
            const pos = getCoordinatesPos(c.location.coordinates?.lat, c.location.coordinates?.lng, idx);

            return (
              <g
                key={c.id}
                className="cursor-pointer"
                onClick={() => {
                  if (onSelectCase) onSelectCase(c.id);
                  setActiveMarkerTooltip({
                    id: c.id,
                    title: `${c.id} • ${c.category.toUpperCase()}`,
                    subtitle: c.location.name,
                    urgency: c.urgency.toUpperCase(),
                    isResource: false,
                    x: pos.x,
                    y: pos.y,
                  });
                }}
              >
                {(isCritical || isSelected) && (
                  <>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="24"
                      fill="none"
                      stroke={isCritical ? '#F43F5E' : '#38BDF8'}
                      strokeWidth="1.5"
                      className="animate-ping"
                      opacity="0.4"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="36"
                      fill="none"
                      stroke={isCritical ? '#F43F5E' : '#38BDF8'}
                      strokeWidth="1"
                      opacity="0.2"
                    />
                  </>
                )}

                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 14 : 11}
                  fill={isCritical ? '#E11D48' : c.urgency === 'high' ? '#D97706' : '#2563EB'}
                  stroke="#FFFFFF"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter="url(#glowEffect)"
                />

                <text x={pos.x} y={pos.y + 3.5} fill="#FFFFFF" fontSize="9" fontWeight="black" textAnchor="middle">
                  !
                </text>

                <g transform={`translate(${pos.x + 12}, ${pos.y - 10})`}>
                  <rect x="0" y="0" width="72" height="18" rx="4" fill="#0B0E14" stroke={isCritical ? '#F43F5E' : '#30363D'} strokeWidth="1" />
                  <text x="6" y="12" fill={isCritical ? '#FECDD3' : '#E2E8F0'} fontSize="9" fontWeight="bold">
                    {c.id}
                  </text>
                </g>
              </g>
            );
          })}

        {/* Responders / Ambulances */}
        {activeLayers.responders && (
          <>
            {displayedCases.map((c) => {
              if (!c.assignedResource || !c.assignedResource.currentCoords) return null;
              const pos = getCoordinatesPos(c.assignedResource.currentCoords.lat, c.assignedResource.currentCoords.lng);
              const movingX = pos.x + responderOffset.x * 0.2;
              const movingY = pos.y + responderOffset.y * 0.2;

              return (
                <g
                  key={`amb-${c.assignedResource.id}`}
                  className="cursor-pointer"
                  onClick={() =>
                    setActiveMarkerTooltip({
                      id: c.assignedResource!.id,
                      title: c.assignedResource!.name,
                      subtitle: `Responder: ${c.assignedResource!.responderName}`,
                      responder: c.assignedResource!.responderName,
                      phone: c.assignedResource!.responderPhone,
                      type: 'EN ROUTE AMBULANCE',
                      status: 'EN ROUTE',
                      eta: `${c.assignedResource!.etaMinutes} min`,
                      isResource: true,
                      x: movingX,
                      y: movingY,
                    })
                  }
                >
                  <circle cx={movingX} cy={movingY} r="18" fill="#10B981" fillOpacity="0.2" className="animate-ping" />
                  <rect x={movingX - 13} y={movingY - 13} width="26" height="26" rx="7" fill="#065F46" stroke="#34D399" strokeWidth="2" />
                  <text x={movingX} y={movingY + 4} fill="#FFFFFF" fontSize="12" textAnchor="middle" dominantBaseline="middle">
                    🚑
                  </text>
                  <g transform={`translate(${movingX - 25}, ${movingY + 16})`}>
                    <rect x="0" y="0" width="50" height="14" rx="3" fill="#064E3B" stroke="#10B981" strokeWidth="0.8" />
                    <text x="25" y="10" fill="#A7F3D0" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {c.assignedResource.plateNumber || 'DISPATCHED'}
                    </text>
                  </g>
                </g>
              );
            })}

            {resources
              .filter((r) => r.type === 'ambulance')
              .map((res, i) => {
                const pos = getCoordinatesPos(res.coordinates.lat, res.coordinates.lng, i + 5);
                const isAvailable = res.availability === 'available';

                return (
                  <g
                    key={`fleet-${res.id}`}
                    className="cursor-pointer"
                    onClick={() =>
                      setActiveMarkerTooltip({
                        id: res.id,
                        title: res.name,
                        subtitle: res.address,
                        responder: res.capacity || 'EMT Team Ready',
                        phone: res.phone,
                        type: 'STANDBY FLEET',
                        status: res.availability.toUpperCase(),
                        isResource: true,
                        x: pos.x,
                        y: pos.y,
                      })
                    }
                  >
                    <rect
                      x={pos.x - 12}
                      y={pos.y - 12}
                      width="24"
                      height="24"
                      rx="6"
                      fill={isAvailable ? '#064E3B' : '#78350F'}
                      stroke={isAvailable ? '#10B981' : '#F59E0B'}
                      strokeWidth="1.5"
                    />
                    <text x={pos.x} y={pos.y + 4} fill="#FFFFFF" fontSize="11" textAnchor="middle" dominantBaseline="middle">
                      🚑
                    </text>
                    <g transform={`translate(${pos.x - 22}, ${pos.y + 15})`}>
                      <rect x="0" y="0" width="44" height="13" rx="3" fill="#080B10" stroke={isAvailable ? '#10B981' : '#F59E0B'} strokeWidth="0.8" />
                      <text x="22" y="9" fill={isAvailable ? '#34D399' : '#FCD34D'} fontSize="7.5" fontWeight="bold" textAnchor="middle">
                        {res.id}
                      </text>
                    </g>
                  </g>
                );
              })}
          </>
        )}
      </svg>

      {/* Floating Marker Tooltip */}
      {activeMarkerTooltip && (
        <div
          className="absolute z-30 p-3.5 bg-[#161B22]/98 backdrop-blur-2xl border border-[#30363D] rounded-2xl shadow-2xl max-w-xs text-xs transition-all animate-in fade-in space-y-2"
          style={{
            left: `${Math.min(activeMarkerTooltip.x / 6, 70)}%`,
            top: `${Math.min(activeMarkerTooltip.y / 4, 65)}%`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-black text-blue-400">{activeMarkerTooltip.id}</span>
            <div className="flex items-center gap-1.5">
              {activeMarkerTooltip.urgency && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    activeMarkerTooltip.urgency === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {activeMarkerTooltip.urgency}
                </span>
              )}
              {activeMarkerTooltip.status && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    activeMarkerTooltip.status === 'AVAILABLE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  {activeMarkerTooltip.status}
                </span>
              )}
              <button onClick={() => setActiveMarkerTooltip(null)} className="text-gray-400 hover:text-white p-0.5">
                ✕
              </button>
            </div>
          </div>

          <div>
            <div className="font-bold text-white text-xs leading-snug">{activeMarkerTooltip.title}</div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">{activeMarkerTooltip.subtitle}</div>
          </div>

          {activeMarkerTooltip.isResource && activeMarkerTooltip.status === 'AVAILABLE' && selectedCaseId && (
            <button
              onClick={() => {
                if (onQuickAssign) {
                  onQuickAssign(selectedCaseId, activeMarkerTooltip.id);
                }
                setActiveMarkerTooltip(null);
              }}
              className="w-full mt-2 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Assign {activeMarkerTooltip.id} to Case</span>
            </button>
          )}
        </div>
      )}

      {/* Map Tactical Footer Legend */}
      <div className="absolute bottom-2 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-[#161B22]/90 backdrop-blur-md rounded-xl border border-[#30363D] text-[11px] text-gray-300 font-sans">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-gray-300 font-semibold">Critical Case</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-gray-300">High Case</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
            <span className="text-gray-300 font-semibold">Available Fleet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span className="text-gray-300">Hospital / Facility</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-gray-400 text-[10px] font-mono">
          <span>GPS FIX: ACCURATE (98%)</span>
          <span>•</span>
          <span>DISPATCH RADIUS: 15 KM</span>
        </div>
      </div>
    </div>
  );
}
