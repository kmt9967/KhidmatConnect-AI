/**
 * Shared map / geolocation types for KhidmatConnect AI.
 * Single source of truth for coordinate shapes across the app.
 */

// ─── Core coordinate pair ───────────────────────────────────
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// ─── Browser geolocation result ─────────────────────────────
export type GeolocationStatus =
  | 'SUCCESS'
  | 'DENIED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED';

export interface GeolocationResult {
  status: GeolocationStatus;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  error?: string;
}

// ─── Geocode result (forward or reverse) ────────────────────
export type GeocodeConfidence = 'PRECISE' | 'APPROXIMATE';

export interface GeocodeResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  confidenceType: GeocodeConfidence;
}

// ─── Route / ETA result ─────────────────────────────────────
export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER';

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
  travelMode: TravelMode;
}

// ─── Map marker data (unified for all marker types) ─────────
export type MarkerType = 'EMERGENCY' | 'RESOURCE' | 'RESPONDER' | 'AMBULANCE' | 'USER';

export interface MapMarkerData {
  id: string;
  type: MarkerType;
  position: GeoPoint;
  title: string;
  subtitle?: string;
  urgency?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category?: string;
  available?: boolean;
}

// ─── Location confidence level ──────────────────────────────
export type LocationConfidence =
  | 'GPS_CONFIRMED'
  | 'MANUAL_ENTERED'
  | 'AI_EXTRACTED'
  | 'UNCONFIRMED';

// ─── Map service error codes ────────────────────────────────
export type MapServiceError =
  | 'MAPS_NOT_CONFIGURED'
  | 'GEOCODING_FAILED'
  | 'ROUTE_FAILED'
  | 'INVALID_COORDINATES';

export interface MapServiceErrorResult {
  error: MapServiceError;
  message: string;
}

// ─── Pakistan / Karachi default center ──────────────────────
export const KARACHI_CENTER: GeoPoint = {
  latitude: 24.8607,
  longitude: 67.0011,
};

export const DEFAULT_MAP_ZOOM = 12;
