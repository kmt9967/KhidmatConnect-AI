import { z } from 'zod';

// ─── Emergency Case Creation ───────────────────────────────
// AI fields are optional — intake must work without AI.

export const createEmergencyCaseSchema = z.object({
  source: z.enum(['WEB', 'VOICE_CALL']),
  primaryContact: z
    .string()
    .min(5, 'Primary contact is required')
    .max(30, 'Contact number too long'),
  alternateContact: z.string().max(30).optional(),
  originalMessage: z
    .string()
    .min(1, 'Emergency message is required')
    .max(5000, 'Message too long'),
  transcript: z.string().max(20000).optional(),
  locationText: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().min(0).max(100000).optional(),
  locationConfirmed: z.boolean().optional(),
  categories: z
    .array(z.enum(['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER']))
    .min(1, 'At least one category is required')
    .max(5, 'Too many categories'),
  // AI enrichment fields — all optional
  detectedLanguage: z.string().max(50).optional(),
  aiSummary: z.string().max(2000).optional(),
  aiReasoning: z.string().max(5000).optional(),
  urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
});

export type CreateEmergencyCaseInput = z.infer<typeof createEmergencyCaseSchema>;

// ─── Case Update (Requester adding info) ───────────────────
export const addCaseUpdateSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message too long'),
});

export type AddCaseUpdateInput = z.infer<typeof addCaseUpdateSchema>;

// ─── Resource Query ────────────────────────────────────────
export const resourceQuerySchema = z.object({
  type: z.enum([
    'AMBULANCE', 'RESCUE_TEAM', 'MEDICAL_CENTER', 'FOOD_CENTER',
    'WATER_POINT', 'SHELTER', 'TRANSPORT', 'SUPPLY_CENTER',
  ]).optional(),
  availability: z.enum([
    'AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'OFFLINE',
    'MAINTENANCE', 'LIMITED', 'BUSY', 'CLOSED',
  ]).optional(),
});

export type ResourceQueryInput = z.infer<typeof resourceQuerySchema>;
