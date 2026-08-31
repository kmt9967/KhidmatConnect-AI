import { z } from 'zod';

/**
 * Zod schemas for Milestone 8 assignment and tracking APIs.
 */

// ─── Operator Assign ────────────────────────────────────────
export const assignCaseSchema = z.object({
  responderId: z.string().min(1, 'responderId is required'),
  ambulanceId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
});

// ─── Responder Status Transition ────────────────────────────
export const statusTransitionSchema = z.object({
  newStatus: z.enum(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED']),
});

// ─── Location Update ────────────────────────────────────────
export const locationUpdateSchema = z.object({
  responderId: z.string().min(1, 'responderId is required'),
  ambulanceId: z.string().min(1).optional(),
  assignmentId: z.string().min(1, 'assignmentId is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
});

// ─── Support Request ────────────────────────────────────────
export const supportRequestSchema = z.object({
  assignmentId: z.string().min(1),
  requestType: z.enum(['AMBULANCE', 'MEDICAL_TEAM', 'RESCUE_TEAM', 'SUPPLIES', 'OTHER']),
  details: z.string().min(1).max(500),
});

// ─── Valid status transitions ───────────────────────────────
export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED'],
  ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['COMPLETED'],
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(current: string, next: string): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}
