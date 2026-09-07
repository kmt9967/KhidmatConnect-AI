/**
 * Operator-map marker logic, kept pure so it can be unit-tested without a
 * browser and shared by /operator and any future command-center surface.
 *
 * Colour tokens are the ones the rest of the UI already uses for urgency
 * (#F85149 red, #F0883E orange, #D29922 amber, #3FB950 green) - no new palette.
 */

import type { MapMarkerData, MarkerType } from './types';
import { haversineDistance } from './distance';

// ─── Severity → colour (existing design tokens) ────────────
export const URGENCY_MARKER_COLORS: Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', string> = {
  CRITICAL: '#F85149',
  HIGH: '#F0883E',
  MEDIUM: '#D29922',
  LOW: '#3FB950',
};

const TYPE_MARKER_COLORS: Record<MarkerType, string> = {
  EMERGENCY: '#F85149',
  RESOURCE: '#58A6FF',
  RESPONDER: '#3FB950',
  AMBULANCE: '#3FB950',
  USER: '#BC8CFF',
};

/** Material "place" pin, 24×24 path units; the tip sits at (12, 22). */
export const EMERGENCY_PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z';

/** Serializable symbol descriptor - GoogleMap turns it into a google.maps.Symbol. */
export interface MarkerSymbolSpec {
  path: string | 'CIRCLE';
  scale: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
  /** Anchor in path units; pins must point with their tip. */
  anchor?: { x: number; y: number };
}

export function markerSymbolFor(
  marker: Pick<MapMarkerData, 'type' | 'urgency'>,
  selected: boolean,
): MarkerSymbolSpec {
  if (marker.type === 'EMERGENCY') {
    const color = (marker.urgency && URGENCY_MARKER_COLORS[marker.urgency]) || TYPE_MARKER_COLORS.EMERGENCY;
    return {
      path: EMERGENCY_PIN_PATH,
      scale: selected ? 1.9 : 1.55,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: selected ? '#FFFFFF' : '#0B0E14',
      strokeWeight: selected ? 1.6 : 1.1,
      anchor: { x: 12, y: 22 },
    };
  }
  return {
    path: 'CIRCLE',
    scale: selected ? 10 : 8,
    fillColor: TYPE_MARKER_COLORS[marker.type] || '#58A6FF',
    fillOpacity: 0.9,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
  };
}

/** Halo drawn under a pulsing emergency pin (two phases, kept subtle). */
export function pulseHaloSpec(phase: 0 | 1): MarkerSymbolSpec {
  return {
    path: 'CIRCLE',
    scale: phase === 0 ? 10 : 14,
    fillColor: URGENCY_MARKER_COLORS.CRITICAL,
    fillOpacity: phase === 0 ? 0.28 : 0.1,
    strokeColor: URGENCY_MARKER_COLORS.CRITICAL,
    strokeWeight: 1,
  };
}

const CLOSED_CASE_STATUSES = ['COMPLETED', 'CLOSED', 'DUPLICATE'];

/**
 * Subtle pulse only for CRITICAL emergencies that are still open and have no
 * assignment yet. Completed cases and assigned cases stay calm.
 */
export function shouldPulseMarker(marker: MapMarkerData): boolean {
  if (marker.type !== 'EMERGENCY') return false;
  if (marker.urgency !== 'CRITICAL') return false;
  if (marker.assigned) return false;
  if (marker.caseStatus && CLOSED_CASE_STATUSES.includes(marker.caseStatus)) return false;
  return true;
}

// ─── Queue → markers ────────────────────────────────────────
/** Structural slice of the operator queue payload the map needs. */
export interface QueueCaseForMap {
  caseCode: string;
  status: string;
  urgency: string | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  assignments: {
    status: string;
    responder?: {
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      availabilityStatus: string;
    } | null;
    ambulance?: {
      id: string;
      identifier: string;
      latitude: number | null;
      longitude: number | null;
      availabilityStatus: string;
    } | null;
  }[];
}

const ACTIVE_ASSIGNMENT_STATUSES = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];

/**
 * Builds emergency + live responder/ambulance markers from queue data.
 * Cases without coordinates produce NO marker - never a fabricated position.
 */
export function queueMarkersFromCases(cases: QueueCaseForMap[]): MapMarkerData[] {
  const markers: MapMarkerData[] = [];
  for (const c of cases) {
    if (c.latitude == null || c.longitude == null) continue;
    const assigned = c.assignments.some((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
    markers.push({
      id: c.caseCode,
      type: 'EMERGENCY',
      position: { latitude: c.latitude, longitude: c.longitude },
      title: `${c.caseCode} • ${(c.categories[0] || 'EMERGENCY').toUpperCase()}`,
      subtitle: c.locationText || 'Emergency',
      urgency: (c.urgency as MapMarkerData['urgency']) || undefined,
      category: c.categories[0] || undefined,
      caseStatus: c.status,
      assigned,
    });
    for (const a of c.assignments) {
      if (a.responder?.latitude && a.responder?.longitude) {
        markers.push({
          id: `resp-${a.responder.id}`,
          type: 'RESOURCE',
          position: { latitude: a.responder.latitude, longitude: a.responder.longitude },
          title: a.responder.name,
          subtitle: a.status,
          available: a.responder.availabilityStatus === 'AVAILABLE',
        });
      }
      if (a.ambulance?.latitude && a.ambulance?.longitude) {
        markers.push({
          id: `amb-${a.ambulance.id}`,
          type: 'AMBULANCE',
          position: { latitude: a.ambulance.latitude, longitude: a.ambulance.longitude },
          title: a.ambulance.identifier,
          subtitle: a.status,
          available: a.ambulance.availabilityStatus === 'AVAILABLE',
        });
      }
    }
  }
  return markers;
}

// ─── Marker reconciliation plan (polling-safe updates) ──────
export interface MarkerUpdatePlan {
  add: MapMarkerData[];
  /** id → new data for markers that already exist but changed. */
  update: MapMarkerData[];
  remove: string[];
}

function samePosition(a: MapMarkerData, b: MapMarkerData): boolean {
  return a.position.latitude === b.position.latitude && a.position.longitude === b.position.longitude;
}

function samePresentation(a: MapMarkerData, b: MapMarkerData): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.urgency === b.urgency &&
    a.type === b.type &&
    a.available === b.available &&
    a.caseStatus === b.caseStatus &&
    a.assigned === b.assigned
  );
}

/**
 * Diffs the previous marker set against the next one so a polling refresh
 * only touches what actually changed. Markers that are identical (the common
 * case on a quiet queue) keep their Google object - and therefore keep any
 * open InfoWindow, animation state and click focus.
 */
export function planMarkerUpdate(previous: MapMarkerData[], next: MapMarkerData[]): MarkerUpdatePlan {
  const prevById = new Map(previous.map((m) => [m.id, m]));
  const plan: MarkerUpdatePlan = { add: [], update: [], remove: [] };
  const seen = new Set<string>();
  for (const m of next) {
    seen.add(m.id);
    const old = prevById.get(m.id);
    if (!old) plan.add.push(m);
    else if (!samePosition(old, m) || !samePresentation(old, m)) plan.update.push(m);
  }
  for (const id of prevById.keys()) {
    if (!seen.has(id)) plan.remove.push(id);
  }
  return plan;
}

// ─── Recenter decision ──────────────────────────────────────
/**
 * True once the operator has moved meaningfully away from the incident
 * (> threshold meters). Used to decide when the floating "Back to Case"
 * control appears; polling never feeds into this.
 */
export function hasDriftedFromFocus(
  center: { latitude: number; longitude: number } | null,
  focus: { latitude: number; longitude: number } | null,
  thresholdMeters = 150,
): boolean {
  if (!center || !focus) return false;
  return haversineDistance(center, focus) > thresholdMeters;
}
