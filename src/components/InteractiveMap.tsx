'use client';

import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { MapPin, Truck, Building2, Layers } from 'lucide-react';
import type { EmergencyCase, ReliefResource } from '@/types';

// Karachi coordinate projection for SVG viewBox (600x400)
function projectCoords(lat: number, lng: number): { x: number; y: number } {
  const minLat = 24.78;
  const maxLat = 25.05;
  const minLng = 66.95;
  const maxLng = 67.2;
  const x = ((lng - minLng) / (maxLng - minLng)) * 600;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 400;
  return { x, y };
}

interface InteractiveMapProps {
  cases?: EmergencyCase[];
  resources?: ReliefResource[];
  selectedCaseId?: string;
  showLayers?: boolean;
  className?: string;
}

export default function InteractiveMap({
  cases = [],
  resources = [],
  selectedCaseId,
  showLayers = true,
  className = '',
}: InteractiveMapProps) {
  const { lang } = useLanguage();
  const [layers, setLayers] = useState({
    incidents: true,
    fleet: true,
    facilities: true,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const urgencyColors: Record<string, string> = {
    critical: '#F85149',
    high: '#D29922',
    medium: '#58A6FF',
    low: '#3FB950',
  };

  const resourceColors: Record<string, string> = {
    ambulance: '#3FB950',
    medical: '#58A6FF',
    shelter: '#BC8CFF',
    food: '#D29922',
    water: '#58A6FF',
    rescue: '#F85149',
    supplies: '#D29922',
  };

  return (
    <div className={`relative rounded-xl border border-[#21262D] bg-[#0B0E14] overflow-hidden ${className}`}>
      {/* Layer Controls */}
      {showLayers && (
        <div className="absolute top-3 left-3 z-10 flex gap-1.5">
          <button
            onClick={() => setLayers((p) => ({ ...p, incidents: !p.incidents }))}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
              layers.incidents
                ? 'border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]'
                : 'border-[#21262D] bg-[#11151C] text-[#6E7681]'
            }`}
          >
            <MapPin className="h-3 w-3" />
            {lang === 'ur' ? 'واقعات' : 'Incidents'}
          </button>
          <button
            onClick={() => setLayers((p) => ({ ...p, fleet: !p.fleet }))}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
              layers.fleet
                ? 'border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]'
                : 'border-[#21262D] bg-[#11151C] text-[#6E7681]'
            }`}
          >
            <Truck className="h-3 w-3" />
            {lang === 'ur' ? 'فلیٹ' : 'Fleet'}
          </button>
          <button
            onClick={() => setLayers((p) => ({ ...p, facilities: !p.facilities }))}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
              layers.facilities
                ? 'border-[#58A6FF]/40 bg-[#58A6FF]/10 text-[#58A6FF]'
                : 'border-[#21262D] bg-[#11151C] text-[#6E7681]'
            }`}
          >
            <Building2 className="h-3 w-3" />
            {lang === 'ur' ? 'سہولیات' : 'Facilities'}
          </button>
        </div>
      )}

      {/* SVG Map */}
      <svg
        viewBox="0 0 600 400"
        className="w-full h-full min-h-[300px]"
        style={{ background: '#0B0E14' }}
      >
        {/* Dot pattern background */}
        <defs>
          <pattern id="mapDots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.8" fill="rgba(139,148,158,0.08)" />
          </pattern>
        </defs>
        <rect width="600" height="400" fill="url(#mapDots)" />

        {/* Karachi coastline (simplified) */}
        <path
          d="M 0 320 Q 80 300, 150 330 Q 220 350, 300 340 Q 380 330, 450 350 Q 520 360, 600 340 L 600 400 L 0 400 Z"
          fill="rgba(88,166,255,0.04)"
          stroke="rgba(88,166,255,0.12)"
          strokeWidth="1"
        />

        {/* Major highways */}
        <path
          d="M 50 100 Q 200 120, 350 80 Q 450 60, 580 90"
          fill="none"
          stroke="rgba(139,148,158,0.1)"
          strokeWidth="2"
          strokeDasharray="8 4"
        />
        <path
          d="M 300 0 Q 310 100, 280 200 Q 260 300, 300 340"
          fill="none"
          stroke="rgba(139,148,158,0.1)"
          strokeWidth="2"
          strokeDasharray="8 4"
        />

        {/* District labels */}
        <text x="120" y="160" fill="rgba(139,148,158,0.2)" fontSize="11" fontWeight="600">
          Gulshan
        </text>
        <text x="350" y="200" fill="rgba(139,148,158,0.2)" fontSize="11" fontWeight="600">
          Saddar
        </text>
        <text x="200" y="280" fill="rgba(139,148,158,0.2)" fontSize="11" fontWeight="600">
          Clifton
        </text>
        <text x="450" y="150" fill="rgba(139,148,158,0.2)" fontSize="11" fontWeight="600">
          Korangi
        </text>
        <text x="80" y="250" fill="rgba(139,148,158,0.2)" fontSize="11" fontWeight="600">
          Nazimabad
        </text>

        {/* Emergency case markers */}
        {layers.incidents &&
          cases.map((c) => {
            if (!c.location.coordinates) return null;
            const { x, y } = projectCoords(c.location.coordinates.lat, c.location.coordinates.lng);
            const color = urgencyColors[c.urgency] || '#58A6FF';
            const isSelected = c.id === selectedCaseId;
            return (
              <g
                key={c.id}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
              >
                {/* Pulse ring */}
                <circle cx={x} cy={y} r="12" fill={color} opacity="0.15">
                  <animate attributeName="r" values="8;18;8" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Core marker */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 7 : 5}
                  fill={color}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                />
                {/* Tooltip */}
                {hoveredId === c.id && (
                  <g>
                    <rect x={x - 60} y={y - 40} width="120" height="28" rx="4" fill="#11151C" stroke="#21262D" />
                    <text x={x} y={y - 22} textAnchor="middle" fill="#E6EDF3" fontSize="9" fontWeight="600">
                      {c.id}
                    </text>
                    <text x={x} y={y - 12} textAnchor="middle" fill="#8B949E" fontSize="8">
                      {c.urgency.toUpperCase()} — {c.category}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Resource markers */}
        {layers.facilities &&
          resources.map((r) => {
            const { x, y } = projectCoords(r.coordinates.lat, r.coordinates.lng);
            const color = resourceColors[r.type] || '#58A6FF';
            return (
              <g
                key={r.id}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
              >
                <rect x={x - 4} y={y - 4} width="8" height="8" rx="2" fill={color} opacity="0.8" />
                {hoveredId === r.id && (
                  <g>
                    <rect x={x - 55} y={y - 36} width="110" height="24" rx="4" fill="#11151C" stroke="#21262D" />
                    <text x={x} y={y - 20} textAnchor="middle" fill="#E6EDF3" fontSize="9" fontWeight="500">
                      {r.name.split('(')[0].trim().substring(0, 20)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Fleet / responder markers */}
        {layers.fleet &&
          cases
            .filter((c) => c.assignedResource?.currentCoords)
            .map((c) => {
              const coords = c.assignedResource!.currentCoords!;
              const { x, y } = projectCoords(coords.lat, coords.lng);
              return (
                <g key={`fleet-${c.id}`}>
                  <rect x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="#3FB950" stroke="#0B0E14" strokeWidth="2" />
                  {/* Direction indicator */}
                  <line x1={x} y1={y - 5} x2={x + 3} y2={y - 10} stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              );
            })}
      </svg>

      {/* Map legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-[#21262D] bg-[#11151C]/90 px-3 py-1.5 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-[#F85149]" />
          <span className="text-[9px] text-[#6E7681]">{lang === 'ur' ? 'شدید' : 'Critical'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded bg-[#3FB950]" />
          <span className="text-[9px] text-[#6E7681]">{lang === 'ur' ? 'ریسپونڈر' : 'Responder'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded bg-[#58A6FF]" />
          <span className="text-[9px] text-[#6E7681]">{lang === 'ur' ? 'سہولت' : 'Facility'}</span>
        </div>
      </div>

      {/* Layers icon */}
      <div className="absolute bottom-3 right-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#21262D] bg-[#11151C]/90 backdrop-blur-sm">
          <Layers className="h-4 w-4 text-[#6E7681]" />
        </div>
      </div>
    </div>
  );
}
