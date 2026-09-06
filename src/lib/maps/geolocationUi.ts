/**
 * Geolocation UX mapping - the single place that decides what the user reads
 * when location detection does not work.
 *
 * Rules encoded here:
 *  - a blocked permission must NEVER look like a failed GPS: it says how to
 *    un-block it and offers a retry, and it always points at the manual
 *    address / landmark path;
 *  - no message may imply that we can (or did) turn the permission on for them;
 *  - emergency submission is never gated on any of these states.
 */

import type { GeolocationStatus } from './types';

export type GpsUiState =
  | 'default'
  | 'loading'
  | 'success'
  | 'blocked'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'insecure';

export const GEOLOCATION_STATUSES: readonly GeolocationStatus[] = [
  'SUCCESS',
  'DENIED',
  'UNAVAILABLE',
  'TIMEOUT',
  'UNSUPPORTED',
  'INSECURE',
];

export const GPS_UI_STATES: readonly GpsUiState[] = [
  'default',
  'loading',
  'success',
  'blocked',
  'unavailable',
  'timeout',
  'unsupported',
  'insecure',
];

/** Lifecycle of a responder location-sharing session, as the UI presents it. */
export type LocationSharingStatus =
  | 'off'
  | 'starting'
  | 'active'
  | 'blocked'
  | 'retrying'
  | 'error';

export function toGpsUiState(status: GeolocationStatus): GpsUiState {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'DENIED':
      // The only reason a citizen sees DENIED on a click-driven path is that
      // the browser holds a Block decision for this origin.
      return 'blocked';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'TIMEOUT':
      return 'timeout';
    case 'UNSUPPORTED':
      return 'unsupported';
    case 'INSECURE':
      return 'insecure';
    default: {
      // Exhaustiveness guard: adding a status to the union breaks the build
      // until it is mapped above.
      const exhaustive: never = status;
      return exhaustive as GpsUiState;
    }
  }
}

/** The copy a screen must supply for every state it can reach. */
export interface GpsCopy {
  defaultLabel: string;
  loadingLabel: string;
  successLabel: string;
  blocked: string;
  unavailable: string;
  timeout: string;
  unsupported: string;
  insecure: string;
  tryAgain: string;
}

export function gpsButtonLabel(state: GpsUiState, copy: GpsCopy): string {
  switch (state) {
    case 'loading':
      return copy.loadingLabel;
    case 'success':
      return copy.successLabel;
    // Every failure state keeps an actionable button (retry), never a dead end.
    case 'blocked':
    case 'unavailable':
    case 'timeout':
    case 'unsupported':
    case 'insecure':
    case 'default':
    default:
      return copy.defaultLabel;
  }
}

/**
 * Helper text under the control. Empty string for the happy/loading path, so
 * the citizen sees nothing but the button until something needs explaining.
 */
export function gpsHelpMessage(state: GpsUiState, copy: GpsCopy): string {
  switch (state) {
    case 'default':
    case 'loading':
    case 'success':
      return '';
    case 'blocked':
      return copy.blocked;
    case 'unavailable':
      return copy.unavailable;
    case 'timeout':
      return copy.timeout;
    case 'unsupported':
      return copy.unsupported;
    case 'insecure':
      return copy.insecure;
    default:
      return '';
  }
}

/**
 * Whether "Try Again" makes sense. It never does for an unsupported browser or
 * an insecure origin - the user cannot fix those by tapping.
 */
export function shouldOfferGpsRetry(state: GpsUiState): boolean {
  return state === 'blocked' || state === 'timeout' || state === 'unavailable';
}

/**
 * A `force` retry is only meaningful for a state we reached from the cached
 * Block decision: that is the one case where the user may have just changed the
 * browser setting and we must actually call the API again.
 */
export function needsForcedRetry(state: GpsUiState, suppressedApiCall?: boolean): boolean {
  return state === 'blocked' && suppressedApiCall === true;
}
