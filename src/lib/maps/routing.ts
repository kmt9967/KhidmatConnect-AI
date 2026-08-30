/**
 * Server-side routing client.
 *
 * Uses Google Routes API (new routes v2) via server key.
 * Returns distance, duration, and optionally polyline.
 */

import type { RouteResult, TravelMode, MapServiceErrorResult } from './types';
import { isValidLatitude, isValidLongitude } from './distance';

function getServerApiKey(): string {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY || '';
}

/**
 * Compute a route between origin and destination.
 *
 * Uses Google Routes API (v2) which is the modern replacement for Directions API.
 * Returns distance in meters, duration in seconds, and encoded polyline if available.
 */
export async function computeRoute(params: {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  travelMode?: TravelMode;
}): Promise<RouteResult | MapServiceErrorResult> {
  const apiKey = getServerApiKey();
  if (!apiKey) {
    return { error: 'MAPS_NOT_CONFIGURED', message: 'Routes API key is not configured' };
  }

  const {
    originLatitude,
    originLongitude,
    destinationLatitude,
    destinationLongitude,
    travelMode = 'DRIVE',
  } = params;

  // Validate all coordinates
  if (!isValidLatitude(originLatitude) || !isValidLongitude(originLongitude)) {
    return { error: 'INVALID_COORDINATES', message: 'Invalid origin coordinates' };
  }
  if (!isValidLatitude(destinationLatitude) || !isValidLongitude(destinationLongitude)) {
    return { error: 'INVALID_COORDINATES', message: 'Invalid destination coordinates' };
  }

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: originLatitude,
              longitude: originLongitude,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destinationLatitude,
              longitude: destinationLongitude,
            },
          },
        },
        travelMode: travelMode,
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[Routing] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return { error: 'ROUTE_FAILED', message: `Routing service returned HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.routes?.length) {
      return { error: 'ROUTE_FAILED', message: 'No route found between the specified points' };
    }

    const route = data.routes[0];
    const distanceMeters = route.distanceMeters;
    const durationStr = route.duration; // e.g. "1234s"

    // Parse duration from "1234s" format
    let durationSeconds = 0;
    if (typeof durationStr === 'string') {
      const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
      if (match) {
        durationSeconds = Math.round(parseFloat(match[1]));
      }
    }

    if (!distanceMeters || typeof distanceMeters !== 'number') {
      return { error: 'ROUTE_FAILED', message: 'Invalid route distance in response' };
    }

    return {
      distanceMeters,
      durationSeconds,
      polyline: route.polyline?.encodedPolyline || undefined,
      travelMode,
    };
  } catch (err) {
    console.error('[Routing] Route computation error:', err instanceof Error ? err.message : 'Unknown');
    return { error: 'ROUTE_FAILED', message: 'Route computation failed' };
  }
}
