/**
 * Shared utility functions.
 * Placeholder for future helper modules.
 */

/**
 * Generate a short unique ID (non-cryptographic, for UI use only).
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Format a date string for display.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
