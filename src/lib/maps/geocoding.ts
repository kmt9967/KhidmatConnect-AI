/**
 * Server-side geocoding client.
 *
 * Uses Google Geocoding API via server key (GOOGLE_MAPS_SERVER_API_KEY).
 * Never expose this key to the browser.
 */

import type { GeocodeResult, MapServiceErrorResult } from './types';
import { isValidLatitude, isValidLongitude } from './distance';

function getServerApiKey(): string {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY || '';
}

/**
 * Forward geocode: convert an address string to coordinates.
 */
export async function forwardGeocode(address: string): Promise<GeocodeResult | MapServiceErrorResult> {
  const apiKey = getServerApiKey();
  if (!apiKey) {
    return { error: 'MAPS_NOT_CONFIGURED', message: 'Geocoding API key is not configured' };
  }

  if (!address || address.trim().length < 3) {
    return { error: 'INVALID_COORDINATES', message: 'Address is too short to geocode' };
  }

  try {
    const params = new URLSearchParams({
      address: address.trim(),
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { next: { revalidate: 3600 } } // Cache 1 hour
    );

    if (!response.ok) {
      console.error(`[Geocoding] HTTP ${response.status} for address: ${address.substring(0, 100)}`);
      return { error: 'GEOCODING_FAILED', message: `Geocoding service returned HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return {
        error: 'GEOCODING_FAILED',
        message: data.status === 'ZERO_RESULTS' ? 'No results found for this address' : `Geocoding status: ${data.status}`,
      };
    }

    const result = data.results[0];
    const location = result.geometry?.location;

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return { error: 'GEOCODING_FAILED', message: 'Invalid coordinates in geocoding response' };
    }

    if (!isValidLatitude(location.lat) || !isValidLongitude(location.lng)) {
      return { error: 'GEOCODING_FAILED', message: 'Coordinates out of valid range' };
    }

    // Derive confidence from result types (heuristic, not fabricated)
    const locationType = result.geometry?.location_type;
    const confidenceType: GeocodeResult['confidenceType'] =
      locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED'
        ? 'PRECISE'
        : 'APPROXIMATE';

    return {
      formattedAddress: result.formatted_address || address,
      latitude: location.lat,
      longitude: location.lng,
      placeId: result.place_id || undefined,
      confidenceType,
    };
  } catch (err) {
    console.error('[Geocoding] Forward geocode error:', err instanceof Error ? err.message : 'Unknown');
    return { error: 'GEOCODING_FAILED', message: 'Geocoding request failed' };
  }
}

/**
 * Reverse geocode: convert coordinates to a human-readable address.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodeResult | MapServiceErrorResult> {
  const apiKey = getServerApiKey();
  if (!apiKey) {
    return { error: 'MAPS_NOT_CONFIGURED', message: 'Geocoding API key is not configured' };
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return { error: 'INVALID_COORDINATES', message: 'Invalid coordinates for reverse geocoding' };
  }

  try {
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      console.error(`[Geocoding] HTTP ${response.status} for reverse geocode`);
      return { error: 'GEOCODING_FAILED', message: `Geocoding service returned HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return {
        error: 'GEOCODING_FAILED',
        message: data.status === 'ZERO_RESULTS' ? 'No address found for these coordinates' : `Geocoding status: ${data.status}`,
      };
    }

    const result = data.results[0];
    const locationType = result.geometry?.location_type;
    const confidenceType: GeocodeResult['confidenceType'] =
      locationType === 'ROOFTOP' ? 'PRECISE' : 'APPROXIMATE';

    return {
      formattedAddress: result.formatted_address || `${latitude}, ${longitude}`,
      latitude,
      longitude,
      placeId: result.place_id || undefined,
      confidenceType,
    };
  } catch (err) {
    console.error('[Geocoding] Reverse geocode error:', err instanceof Error ? err.message : 'Unknown');
    return { error: 'GEOCODING_FAILED', message: 'Reverse geocoding request failed' };
  }
}
