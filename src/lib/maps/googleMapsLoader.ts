/**
 * Google Maps JavaScript API loader.
 *
 * Uses @googlemaps/js-api-loader v2 functional API (setOptions + importLibrary).
 * The browser key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) is required
 * for client-side map rendering.
 */

let optionsSet = false;
let loadPromise: Promise<typeof google.maps | null> | null = null;

/**
 * Check if the browser-side Google Maps API key is configured.
 */
export function isGoogleMapsConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

/**
 * Load the Google Maps JavaScript API.
 * Returns the google.maps namespace, or null if not configured.
 * Deduplicates concurrent calls.
 */
export async function loadGoogleMaps(): Promise<typeof google.maps | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Dynamic import to avoid SSR issues
      const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');

      if (!optionsSet) {
        setOptions({
          key: apiKey,
          v: 'weekly',
          libraries: ['maps', 'geocoding'],
        });
        optionsSet = true;
      }

      // Import the core maps library to trigger script loading
      await importLibrary('maps');

      return google.maps;
    } catch (err) {
      console.error('[Maps] Google Maps failed to load:', err instanceof Error ? err.message : 'Unknown error');
      loadPromise = null; // Allow retry on next call
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Get the Google Maps API key (browser-safe only).
 * Never use this for server-side calls.
 */
export function getBrowserMapsApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}
