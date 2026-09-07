/**
 * External Google Maps link builders + clipboard helper.
 *
 * Pure functions on purpose: the operator map cards are rendered into a
 * Google InfoWindow (a separate React root), so every URL must be buildable
 * and testable without a browser, and must never depend on app routing.
 *
 * All URLs use the documented Google Maps *Universal* HTTPS endpoints
 * (https://developers.google.com/maps/documentation/urls):
 *  - they work in desktop browsers, Android and iOS browsers,
 *  - the platform hands off to the installed Google Maps app where it wants,
 *  - directions deliberately omit `origin` so Google Maps asks for / uses the
 *    device's own location. The app must NOT issue its own geolocation request
 *    just to build a navigation link.
 */

import type { GeoPoint } from './types';

/** View a exact coordinate on the map. */
export function googleMapsViewUrl(point: GeoPoint, zoom = 17): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}&zoom=${zoom}`;
}

/**
 * Directions to an exact coordinate. No origin parameter on purpose:
 * Google Maps obtains (or asks for) the traveller's starting point itself.
 */
export function googleMapsDirectionsUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
}

/**
 * Free-text search (text-only locations). Clearly a *search*, never exact
 * navigation - the caller must label it as such.
 */
export function googleMapsTextSearchUrl(text: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/**
 * "24.8607, 67.0011" - exactly the stored precision, never more.
 */
export function formatCoordinates(point: GeoPoint): string {
  return `${point.latitude}, ${point.longitude}`;
}

/**
 * Clipboard write with a legacy fallback. Returns true when the text reached
 * the clipboard. Never throws: a failed copy must not break the map card.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
