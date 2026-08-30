/**
 * Distance and coordinate utilities.
 *
 * Haversine formula for straight-line distance.
 * Coordinate validation helpers.
 * Location-unconfirmed logic.
 */

import type { GeoPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;

/**
 * Calculate straight-line distance in meters between two GeoPoints
 * using the Haversine formula.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Format distance for display: meters or km.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Validate that a latitude is within valid range.
 */
export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validate that a longitude is within valid range.
 */
export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Validate a GeoPoint has valid coordinates.
 */
export function isValidGeoPoint(point: GeoPoint | null | undefined): boolean {
  if (!point) return false;
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

/**
 * Determine if a case location is "unconfirmed".
 *
 * A case is unconfirmed if:
 * - latitude or longitude is missing/null
 * - coordinates are invalid
 * - locationConfirmed is false and no valid coordinates exist
 */
export function isLocationUnconfirmed(input: {
  latitude?: number | null;
  longitude?: number | null;
  locationConfirmed?: boolean;
}): boolean {
  if (input.latitude == null || input.longitude == null) return true;
  if (!isValidLatitude(input.latitude) || !isValidLongitude(input.longitude)) return true;
  if (!input.locationConfirmed) return true;
  return false;
}
