import { z } from 'zod';

// ─── AI Emergency Analysis Contract ─────────────────────────
// Structured output schema for Qwen emergency triage analysis.
// All fields validated defensively — never trust raw model JSON.

export const detectedLanguageSchema = z.enum([
  'URDU',
  'ENGLISH',
  'ROMAN_URDU',
  'MIXED',
  'UNKNOWN',
]);

export const urgencySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const emergencyCategorySchema = z.enum([
  'RESCUE',
  'MEDICAL',
  'FOOD',
  'WATER',
  'SHELTER',
  'TRANSPORT',
  'SUPPLIES',
  'OTHER',
]);

export const aiAnalysisResponseSchema = z.object({
  detectedLanguage: detectedLanguageSchema,
  categories: z.array(emergencyCategorySchema).min(1).max(5),
  urgency: urgencySchema,
  summary: z.string().min(1).max(500),
  reasoning: z.string().max(1000),
  keyNeeds: z.array(z.string().max(200)).max(10),
  peopleAffected: z.number().int().min(1).max(10000).nullable(),
  specialNeeds: z.array(z.string().max(200)).max(10),
  locationTextDetected: z.string().max(500),
  missingInformation: z.array(z.string().max(300)).max(5),
  followUpQuestion: z.string().max(500),
  confidence: z.number().min(0).max(1),
  potentiallyCritical: z.boolean(),
});

export type AiAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>;

// ─── AI analysis status for API response ─────────────────────
export const aiAnalysisStatusSchema = z.enum([
  'COMPLETED',
  'FAILED',
  'PENDING',
]);

export type AiAnalysisStatus = z.infer<typeof aiAnalysisStatusSchema>;
