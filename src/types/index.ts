// ─── Language ───────────────────────────────────────────────
export type Language = 'en' | 'ur';

// ─── Urgency ────────────────────────────────────────────────
export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

// ─── Category ───────────────────────────────────────────────
export type EmergencyCategory =
  | 'medical'
  | 'rescue'
  | 'food'
  | 'shelter'
  | 'water'
  | 'fire'
  | 'flood'
  | 'general';

// ─── Case Status ────────────────────────────────────────────
export type CaseStatus =
  | 'submitted'
  | 'ai_reviewed'
  | 'operator_reviewing'
  | 'resource_assigned'
  | 'en_route'
  | 'arrived'
  | 'completed';

// ─── Source ──────────────────────────────────────────────────
export type EmergencySource = 'web' | 'voice_call' | 'sms' | 'operator';

// ─── Location ────────────────────────────────────────────────
export interface LocationInfo {
  name: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isApproximate: boolean;
  addressDetail?: string;
  city?: string;
}

// ─── Requester ───────────────────────────────────────────────
export interface RequesterInfo {
  name?: string;
  phone: string;
  alternatePhone?: string;
}

// ─── AI Analysis ─────────────────────────────────────────────
export interface AiAnalysis {
  summary: string;
  summaryUr?: string;
  reasoning: string;
  keyNeeds: string[];
  peopleCount?: number;
  specialNeeds?: string;
  detectedLanguage: string;
  confidence: number;
  missingInfo?: string[];
  suggestedFollowUp?: string;
}

// ─── Assigned Resource ───────────────────────────────────────
export interface AssignedResource {
  id: string;
  name: string;
  type: string;
  plateNumber?: string;
  responderName: string;
  responderPhone: string;
  etaMinutes: number;
  currentCoords?: {
    lat: number;
    lng: number;
  };
  distanceKm: number;
}

// ─── Voice Transcript ────────────────────────────────────────
export interface VoiceTranscript {
  fullText: string;
  audioLength: string;
  durationSeconds: number;
  isDroppedCall: boolean;
  callTime: string;
}

// ─── Timeline Step ───────────────────────────────────────────
export interface TimelineStep {
  step: CaseStatus;
  label: string;
  labelUr: string;
  time: string;
  completed: boolean;
  current?: boolean;
  note?: string;
}

// ─── Emergency Case ──────────────────────────────────────────
export interface EmergencyCase {
  id: string;
  urgency: UrgencyLevel;
  category: EmergencyCategory;
  status: CaseStatus;
  location: LocationInfo;
  requester: RequesterInfo;
  rawMessage: string;
  timestamp: string;
  source: EmergencySource;
  aiAnalysis: AiAnalysis;
  assignedResource?: AssignedResource;
  voiceTranscript?: VoiceTranscript;
  timeline: TimelineStep[];
  operatorNotes?: string[];
  dynamicFollowUpAnswer?: string;
}

// ─── Resource Types ──────────────────────────────────────────
export type ResourceType =
  | 'medical'
  | 'ambulance'
  | 'food'
  | 'shelter'
  | 'water'
  | 'rescue'
  | 'supplies';

// ─── Relief Resource ─────────────────────────────────────────
export interface ReliefResource {
  id: string;
  name: string;
  nameUr?: string;
  type: ResourceType;
  verified: boolean;
  availability: 'available' | 'busy' | 'limited' | 'closed';
  phone: string;
  address: string;
  addressUr?: string;
  distance: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  capacity?: string;
  stock?: string;
  notes?: string;
  organization?: string;
}

// ─── Citizen Request (Non-Emergency) ──────────────────────
export type CitizenRequestStatus = 'submitted' | 'in_review' | 'completed';

export interface CitizenRequest {
  id: string;
  subject: string;
  subjectUr?: string;
  message: string;
  status: CitizenRequestStatus;
  createdAt: string;
}

// ─── Citizen Inbox ─────────────────────────────────────────
export interface InboxMessage {
  id: string;
  from: string;
  fromUr?: string;
  preview: string;
  previewUr?: string;
  timestamp: string;
  unread: boolean;
  thread?: { sender: string; text: string; time: string }[];
}

// ─── Advisory / Notification ───────────────────────────────
export interface AdvisoryNotification {
  id: string;
  title: string;
  titleUr?: string;
  body: string;
  bodyUr?: string;
  timestamp: string;
  urgent: boolean;
}

// ─── Voice AI ──────────────────────────────────────────────
export type VoiceCallPhase = 'idle' | 'ringing' | 'active' | 'dropped' | 'completed';
export type AiVoiceState = 'listening' | 'thinking' | 'speaking' | 'muted';
export type VoiceCaseStatus = 'Capturing Information' | 'Case Pre-Created' | 'Case Sent to Operator' | 'UNDER REVIEW';
export type VoiceConfidence = 'High (96%)' | 'Medium (78%)' | 'Low (Requires Review)';

export interface TranscriptMessage {
  id: number;
  speaker: 'caller' | 'ai';
  text: string;
  textUr?: string;
  timestamp: string;
  detectedLanguage: 'Urdu' | 'English' | 'Mixed Urdu-English';
  extractedSnapshot?: {
    location?: string;
    urgency?: 'critical' | 'high' | 'medium';
    category?: string;
    need?: string;
    people?: string;
    summary?: string;
    missing?: string;
  };
}

export interface VoiceCaseDraft {
  id: string;
  urgency: 'critical' | 'high' | 'medium';
  category: string;
  need: string;
  location: string;
  people: string;
  contact: string;
  status: VoiceCaseStatus;
  aiSummaryEn: string;
  aiSummaryUr: string;
  missingInfo: string | null;
  confidence: VoiceConfidence;
}
