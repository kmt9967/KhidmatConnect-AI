/**
 * Browser geolocation service.
 *
 * Wraps navigator.geolocation with structured error handling.
 * Returns a normalized GeolocationResult for all outcomes.
 */

import type { GeolocationResult } from './types';

/**
 * Request the user's current position via browser Geolocation API.
 *
 * Options tuned for emergency intake:
 * - high accuracy preferred
 * - 10s timeout (don't hang indefinitely)
 * - short cache (30s) to get fresh position
 */
export function getCurrentPosition(): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        status: 'UNSUPPORTED',
        error: 'Geolocation is not supported by this browser',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'SUCCESS',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            resolve({
              status: 'DENIED',
              error: 'Location permission was denied',
            });
            break;
          case error.POSITION_UNAVAILABLE:
            resolve({
              status: 'UNAVAILABLE',
              error: 'Location information is unavailable',
            });
            break;
          case error.TIMEOUT:
            resolve({
              status: 'TIMEOUT',
              error: 'Location request timed out',
            });
            break;
          default:
            resolve({
              status: 'UNAVAILABLE',
              error: 'An unknown geolocation error occurred',
            });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000,
      }
    );
  });
}
