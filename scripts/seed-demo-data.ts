/**
 * M15 — KhidmatConnect AI demo seed.
 *
 * Creates a realistic, repeatable demo environment:
 *  - 8 emergency cases spanning the full status lifecycle
 *  - deterministic AI decision-support content (no live Qwen calls)
 *  - CaseUpdate audit timelines with chronologically consistent timestamps
 *  - assignments respecting every business invariant:
 *      one active assignment per responder / per ambulance,
 *      availability status matches assignment state,
 *      completed assignments release their resources
 *  - responder/ambulance GPS positions + location history for EN_ROUTE/ARRIVED cases
 *  - ONE voice-originated demo case (VoiceCallSession + turns; no audio files, no Twilio)
 *
 * Idempotency:
 *  Every record created here is tagged via EmergencyCase.demoKey. Re-running the
 *  seed deletes only demo cases (cascade removes their categories/tokens/
 *  assignments/updates/voice sessions) and rebuilds them. Genuine cases — real
 *  citizen submissions and automated-test artifacts — are never touched.
 *
 * Safety:
 *  Refuses to run unless DATABASE_URL points at localhost (dev-only tool).
 *
 * Usage: npm run demo:seed
 */
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient, type CaseUpdateType, type Urgency, type EmergencyCategory } from '@prisma/client';
import { loadEnvLocal } from './lib/env';

// ─── Env loading (tsx does not auto-load Next.js env files) ─
loadEnvLocal();

// ─── Development-only guard ─────────────────────────────────
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set. Aborting — refusing to run without a target database.');
  process.exit(1);
}
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error('❌ REFUSING TO SEED: DATABASE_URL does not point at localhost.');
  console.error('   demo:seed is a development-only tool and will never touch a remote/production database.');
  process.exit(1);
}

const prisma = new PrismaClient();

// Demo timestamps are relative to "now" so the queue always looks fresh/live.
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(NOW - ms);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ─── Demo case definitions ──────────────────────────────────
type AssignmentPlan = {
  responderName: string;
  ambulanceIdentifier?: string;
  /** how far the assignment has progressed at seed time */
  stage: 'PENDING' | 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED';
  /** minutes after AI triage that the operator dispatched */
  delayMin: number;
} | null;

interface DemoCaseDef {
  demoKey: string;
  label: string;
  caseStatus: 'NEW' | 'UNDER_REVIEW' | 'NEEDS_INFORMATION' | 'COMPLETED';
  source: 'WEB' | 'VOICE_CALL';
  createdHoursAgo: number;
  primaryContact: string;
  originalMessage: string;
  locationText: string;
  lat?: number;
  lng?: number;
  locationConfirmed?: boolean;
  categories: EmergencyCategory[];
  ai: {
    summary: string;
    reasoning: string;
    urgency: Urgency;
    confidence: number;
    keyNeeds: string[];
    specialNeeds: string[];
    missingInformation: string[];
    followUpQuestion?: string;
    peopleAffected: number;
    detectedLanguage: string;
  };
  assignment?: AssignmentPlan;
  /** for COMPLETED cases: full lifecycle that has already released resources */
  completedAssignment?: { responderName: string; ambulanceIdentifier?: string };
  voiceTurns?: { speaker: 'AI' | 'CALLER'; text: string; offsetSec: number }[];
}

const DEMO_CASES: DemoCaseDef[] = [
  {
    // 1 — the PRIMARY live-demo case: fresh CRITICAL medical, unassigned, at the TOP of the operator queue.
    demoKey: 'demo-gulshan-unconscious-elderly',
    label: 'CRITICAL / MEDICAL — unconscious elderly patient',
    caseStatus: 'NEW',
    source: 'WEB',
    createdHoursAgo: 0.35,
    primaryContact: '+92 300 5550101',
    originalMessage:
      'Meri buzurg amma achanak behosh ho gayi hain, Gulshan Block 7 gali 3 mein. Saans chal rahi hai magar hosh mein nahi. Please ambulance fori bhejein.',
    locationText: 'Gali 3, Block 7, Gulshan-e-Iqbal, Karachi',
    lat: 24.9095, lng: 67.0854, locationConfirmed: true,
    categories: ['MEDICAL'],
    ai: {
      summary: 'Elderly woman unconscious at home in Gulshan-e-Iqbal Block 7. Breathing but unresponsive. Family requests immediate ambulance.',
      reasoning: 'Unconscious elderly patient ("behosh") with explicit immediate-ambulance request indicates CRITICAL urgency. Precise location (block + gali) with confirmed GPS allows direct dispatch.',
      urgency: 'CRITICAL', confidence: 0.95,
      keyNeeds: ['ambulance', 'emergency medical response'],
      specialNeeds: ['elderly patient', 'unresponsive'],
      missingInformation: ['patient age', 'known medical conditions', 'duration of unconsciousness'],
      followUpQuestion: 'Does the patient have any known medical conditions such as diabetes, heart disease, or high blood pressure?',
      peopleAffected: 1, detectedLanguage: 'ur',
    },
  },
  {
    // 2 — building fire, operator actively reviewing
    demoKey: 'demo-nazimabad-building-fire',
    label: 'HIGH / RESCUE — building fire, people trapped',
    caseStatus: 'UNDER_REVIEW',
    source: 'WEB',
    createdHoursAgo: 1.2,
    primaryContact: '+92 301 5550102',
    originalMessage:
      'Nazimabad Block 4 mein 2 manzila building ko aag lag gayi hai. Oopar wali manzil par 4 log phansay hue hain jin mein 2 bachay shamil hain. Madad bhejein.',
    locationText: 'Block 4, Nazimabad, near Madina Market, Karachi',
    lat: 24.9038, lng: 67.0375, locationConfirmed: true,
    categories: ['RESCUE'],
    ai: {
      summary: 'Two-storey residential building fire in Nazimabad Block 4. Four people, including two children, trapped on the upper floor.',
      reasoning: 'Fire with trapped occupants including children is potentially life-threatening; rescue team priority. Escalation to CRITICAL warranted if staircase confirmed impassable — verifying with caller.',
      urgency: 'HIGH', confidence: 0.92,
      keyNeeds: ['rescue team', 'fire brigade coordination', 'medical standby'],
      specialNeeds: ['children trapped', 'smoke inhalation risk'],
      missingInformation: ['exact flat number', 'staircase accessibility', 'fire origin floor'],
      followUpQuestion: 'Is the main staircase still usable, or are the trapped residents on the roof?',
      peopleAffected: 4, detectedLanguage: 'ur',
    },
  },
  {
    // 3 — road accident, resources dispatched but responder not yet accepted
    demoKey: 'demo-north-karachi-road-accident',
    label: 'HIGH / MEDICAL+TRANSPORT — road accident',
    caseStatus: 'ASSIGNED',
    source: 'WEB',
    createdHoursAgo: 2.1,
    primaryContact: '+92 302 5550103',
    originalMessage:
      'North Karachi Sector 11-A main road par motorbike aur auto rikshaw ka accident hua hai. Do log zakhmi hain, ek ka pair toota hua hai aur kho behoshi ke sath beh raha hai. Tez ambulance bhejein.',
    locationText: 'Sector 11-A Main Road, North Karachi',
    lat: 24.9452, lng: 67.0491, locationConfirmed: true,
    categories: ['MEDICAL', 'TRANSPORT'],
    ai: {
      summary: 'Motorbike–rickshaw collision on Sector 11-A main road, North Karachi. Two injured: one with suspected open fracture and heavy bleeding.',
      reasoning: 'Active haemorrhage + suspected fracture = trauma priority. Two casualties. Scene is roadside with traffic hazard for approaching units. GPS coordinates provided by handset.',
      urgency: 'HIGH', confidence: 0.90,
      keyNeeds: ['ambulance', 'trauma first aid', 'traffic scene safety'],
      specialNeeds: ['open fracture', 'uncontrolled bleeding'],
      missingInformation: ['consciousness level of both injured', 'whether a second ambulance is needed'],
      followUpQuestion: 'Are both injured persons conscious and breathing normally?',
      peopleAffected: 2, detectedLanguage: 'ur',
    },
    assignment: { responderName: 'Junaid Siddiqui', ambulanceIdentifier: 'AKF-33', stage: 'PENDING', delayMin: 10 },
  },
  {
    // 4 — flood supplies, waiting on requester information
    demoKey: 'demo-malir-flood-supplies',
    label: 'MEDIUM / FOOD+WATER — flood-affected family',
    caseStatus: 'NEEDS_INFORMATION',
    source: 'WEB',
    createdHoursAgo: 5.5,
    primaryContact: '+92 303 5550104',
    originalMessage:
      'Malir Colony mein paani bhar gaya hai. Hamari 5 members ki family chhat par baithi hai. Khana aur peene ka paani khatam ho gaya hai. Do din se koi madad nahi aayi.',
    locationText: 'Malir Colony, near Malir River Bridge, Karachi',
    lat: 24.889, lng: 67.1632,
    categories: ['FOOD', 'WATER'],
    ai: {
      summary: 'Family of five stranded on a rooftop in flooded Malir Colony for two days with no food or drinking water remaining.',
      reasoning: 'Prolonged stranding with children and exhausted supplies is serious, but no immediate medical threat reported. Access route unclear due to flooding — supplies drop-off vs boat rescue must be decided after location confirmation.',
      urgency: 'MEDIUM', confidence: 0.84,
      keyNeeds: ['food packs', 'drinking water', 'boat rescue assessment'],
      specialNeeds: ['two children', '48 hours without supplies'],
      missingInformation: ['identifiable nearby landmark', 'current water depth', 'phone battery status'],
      followUpQuestion: 'What is the nearest shop or mosque name that rescue workers could use to identify your street?',
      peopleAffected: 5, detectedLanguage: 'ur',
    },
  },
  {
    // 5 — displaced family; VOICE-originated; responder accepted
    demoKey: 'demo-shelter-displaced-family',
    label: 'HIGH / SHELTER — flood-displaced family (voice intake)',
    caseStatus: 'RESPONDER_ACCEPTED',
    source: 'VOICE_CALL',
    createdHoursAgo: 7.3,
    primaryContact: '+92 304 5550105',
    originalMessage:
      'Gadho Ghar se flood ki wajah se apna ghar chorna para. Hum 8 log hain — 4 bachay, 2 buzurg. Abhi Naya Ghariabad stop par hain, koi jagah nahi mili. Temporary shelter chahiye.',
    locationText: 'Naya Ghariabad bus stop, Malir, Karachi',
    lat: 24.9123, lng: 67.1588,
    categories: ['SHELTER', 'FOOD'],
    ai: {
      summary: 'Flood-displaced family of eight (four children, two elderly) at Naya Ghariabad bus stop seeking temporary shelter before nightfall.',
      reasoning: 'Displaced dependents (children + elderly) with no accommodation. Non-trauma but time-sensitive. Field coordinator with shelter-centre contact list is the correct resource, not an ambulance.',
      urgency: 'HIGH', confidence: 0.88,
      keyNeeds: ['temporary shelter', 'blankets', 'food for eight'],
      specialNeeds: ['four children', 'two elderly persons'],
      missingInformation: ['family medical conditions', 'luggage/possessions status'],
      followUpQuestion: 'Can the family stay at the bus stop until a coordinator arrives within the hour?',
      peopleAffected: 8, detectedLanguage: 'ur',
    },
    assignment: { responderName: 'Bilal Ahmed', stage: 'ACCEPTED', delayMin: 14 },
    voiceTurns: [
      { speaker: 'AI', text: 'Assalam o Alaikum, KhidmatConnect emergency line mein shukriya. Bataiye kya emergency hai?', offsetSec: 20 },
      { speaker: 'CALLER', text: 'Gadho Ghar se flood ki wajah se apna ghar chorna para. Hum 8 log hain, 4 bachay, 2 buzurg.', offsetSec: 55 },
      { speaker: 'AI', text: 'Aapki family ki hifazat sab se ahem hai. Abhi aap log kahan tashreef farma hain?', offsetSec: 95 },
      { speaker: 'CALLER', text: 'Abhi Naya Ghariabad stop par hain, koi jagah nahi mili. Temporary shelter chahiye.', offsetSec: 140 },
    ],
  },
  {
    // 6 — cardiac emergency, responder EN ROUTE with live GPS breadcrumbs
    demoKey: 'demo-korangi-cardiac-enroute',
    label: 'CRITICAL / MEDICAL — suspected heart attack, EN ROUTE',
    caseStatus: 'NEW', // overwritten below by assignment stage → EN_ROUTE
    source: 'WEB',
    createdHoursAgo: 0.9,
    primaryContact: '+92 305 5550106',
    originalMessage:
      'Korangi Sector 5-A chorangi ke paas mere bhai ko seene mein shadeed dard hai aur paseena aa raha hai. Ghar mein gaari nahi hai. Fori ambulance bhejein.',
    locationText: 'Sector 5-A Chorangi, Korangi, Karachi',
    lat: 24.8705, lng: 67.098, locationConfirmed: true,
    categories: ['MEDICAL'],
    ai: {
      summary: 'Middle-aged man with severe chest pain and sweating in Korangi Sector 5-A — presentation consistent with suspected myocardial infarction. No private transport available.',
      reasoning: 'Chest pain + diaphoresis in an adult male is triaged as suspected cardiac emergency (CRITICAL). Time-to-hospital is the dominant factor; ambulance with cardiac support requested at scene.',
      urgency: 'CRITICAL', confidence: 0.94,
      keyNeeds: ['ambulance with cardiac support', 'transport to cardiac-capable hospital'],
      specialNeeds: ['suspected heart attack', 'no private vehicle'],
      missingInformation: ['patient age', 'history of heart disease', 'pain onset time'],
      followUpQuestion: 'Is the patient conscious and able to speak? Any known heart condition?',
      peopleAffected: 1, detectedLanguage: 'ur',
    },
    assignment: { responderName: 'Sara Ali', ambulanceIdentifier: 'AKF-21', stage: 'EN_ROUTE', delayMin: 8 },
  },
  {
    // 7 — pole rescue, responder ARRIVED at scene
    demoKey: 'demo-orangi-pole-rescue',
    label: 'HIGH / RESCUE — electrician trapped on pole, ARRIVED',
    caseStatus: 'NEW', // overwritten below by assignment stage → ARRIVED
    source: 'WEB',
    createdHoursAgo: 1.6,
    primaryContact: '+92 306 5550107',
    originalMessage:
      'Orangi Town Sector 12-B mein bijli ka mistri kharab khunthi par 40 feet oopar phansa hua hai. Current kata hai magar wo neechay nahi utar raha. Bohot ghabraya hua hai. Rescue team bhejein.',
    locationText: 'Sector 12-B, Orangi Town, Karachi',
    lat: 24.8515, lng: 67.0147, locationConfirmed: true,
    categories: ['RESCUE'],
    ai: {
      summary: 'Electrician stranded ~40 feet up a damaged utility pole in Orangi Town Sector 12-B. Power confirmed cut; worker panicked and unable to descend. Height-rescue team requested.',
      reasoning: 'Person at height on a damaged structure — fall risk is life-threatening although rescue team is the enabling resource. Stability of pole unknown, so responders instructed not to climb until K-Electric confirms.',
      urgency: 'HIGH', confidence: 0.89,
      keyNeeds: ['height rescue team', 'ladder or cherry lift', 'medical standby'],
      specialNeeds: ['acute distress', 'possible damaged wiring'],
      missingInformation: ['duration stranded', 'whether the pole is leaning'],
      followUpQuestion: 'How long has he been on the pole, and does the pole look stable?',
      peopleAffected: 1, detectedLanguage: 'ur',
    },
    assignment: { responderName: 'Kashif Mehmood', ambulanceIdentifier: 'AKF-29', stage: 'ARRIVED', delayMin: 12 },
  },
  {
    // 8 — completed delivery case with full lifecycle history
    demoKey: 'demo-frere-completed-delivery',
    label: 'COMPLETED / MEDICAL — maternity transfer, completed',
    caseStatus: 'COMPLETED',
    source: 'WEB',
    createdHoursAgo: 26,
    primaryContact: '+92 307 5550108',
    originalMessage:
      'Frere Town Block 1 mein meri biwi ko delivery ke dard shuru ho gaye hain, paani toot chuka hai. Pehla bachcha hai. Jaldi hospital le janay ke liye ambulance chahiye.',
    locationText: 'Block 1, Frere Town, Karachi',
    lat: 24.8798, lng: 67.0688, locationConfirmed: true,
    categories: ['MEDICAL'],
    ai: {
      summary: 'Woman in active labour with ruptured membranes, first child, in Frere Town. Ambulance required for hospital transfer.',
      reasoning: 'Active labour with water already broken is time-critical medical transport. No breach/danger signs reported at intake; monitored as HIGH with cardiac-style timeline compression if contractions intensify.',
      urgency: 'HIGH', confidence: 0.93,
      keyNeeds: ['ambulance with maternity support', 'hospital coordination'],
      specialNeeds: ['first delivery', 'ruptured membranes'],
      missingInformation: ['contraction interval at call time'],
      followUpQuestion: 'How many minutes apart are the contractions?',
      peopleAffected: 2, detectedLanguage: 'ur',
    },
    completedAssignment: { responderName: 'Sara Ali', ambulanceIdentifier: 'AKF-21' },
  },
];

// Map case status derived from assignment stage (for cases 6/7 defined above with stage status)
const STAGE_TO_CASE_STATUS: Record<string, 'ASSIGNED' | 'RESPONDER_ACCEPTED' | 'EN_ROUTE' | 'ARRIVED'> = {
  PENDING: 'ASSIGNED',
  ACCEPTED: 'RESPONDER_ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
};

async function main() {
  console.log('🌱 Seeding KhidmatConnect AI demo environment (dev-only)...\n');

  // ─── 1. Purge ONLY previous demo records (cascade handles children) ───
  const existingDemo = await prisma.emergencyCase.findMany({
    where: { demoKey: { not: null } },
    select: { id: true },
  });
  if (existingDemo.length > 0) {
    await prisma.emergencyCase.deleteMany({ where: { id: { in: existingDemo.map((c) => c.id) } } });
    console.log(`♻️  Removed ${existingDemo.length} previous demo case(s); rebuilding fresh.\n`);
  }
  // Voice sessions carry a unique providerCallSid — clear our deterministic demo sid if orphaned
  await prisma.voiceCallTurn.deleteMany({ where: { session: { providerCallSid: 'DEMO-VOICE-SEED-SID-0001' } } }).catch(() => {});
  await prisma.voiceCallSession.deleteMany({ where: { providerCallSid: 'DEMO-VOICE-SEED-SID-0001' } }).catch(() => {});

  // ─── 2. Ensure demo operator + responder pool ─────────────
  const operator = await prisma.user.upsert({
    where: { phone: '0300-1122001' },
    update: { role: 'OPERATOR' },
    create: { name: 'Operator Fatima', phone: '0300-1122001', role: 'OPERATOR', preferredLanguage: 'EN' },
  });

  async function ensureResponderUserAndRecord(
    id: string, name: string, phone: string,
    type: 'PARAMEDIC' | 'DRIVER' | 'FIELD_RESCUER' | 'COORDINATOR',
    lat: number, lng: number,
  ) {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { name, phone, role: 'RESPONDER', preferredLanguage: 'UR' },
    });
    const existing = await prisma.responder.findUnique({ where: { userId: user.id } });
    if (existing) {
      return prisma.responder.update({
        where: { id: existing.id },
        data: { availabilityStatus: 'AVAILABLE', currentLatitude: lat, currentLongitude: lng, lastLocationUpdateAt: ago(30 * MIN) },
      });
    }
    return prisma.responder.create({
      data: { id, userId: user.id, name, phone, responderType: type, availabilityStatus: 'AVAILABLE', currentLatitude: lat, currentLongitude: lng, lastLocationUpdateAt: ago(30 * MIN) },
    });
  }

  async function ensureAmbulance(id: string, identifier: string, vehicleNumber: string, responderDbId: string | null, lat: number, lng: number) {
    const existing = await prisma.ambulance.findUnique({ where: { identifier } });
    if (existing) {
      return prisma.ambulance.update({
        where: { id: existing.id },
        data: { availabilityStatus: 'AVAILABLE', responderId: responderDbId, currentLatitude: lat, currentLongitude: lng, lastLocationUpdateAt: ago(30 * MIN) },
      });
    }
    return prisma.ambulance.create({
      data: { id, identifier, vehicleNumber, responderId: responderDbId, availabilityStatus: 'AVAILABLE', currentLatitude: lat, currentLongitude: lng, lastLocationUpdateAt: ago(30 * MIN) },
    });
  }

  // Existing seeded responders get sensible Karachi positions.
  const sara = await ensureResponderUserAndRecord('demo-responder-sara', 'Sara Ali', '0333-5121002', 'FIELD_RESCUER', 24.8805, 67.0965);
  // Additional demo field resources so multiple live-stage assignments can coexist.
  const bilal = await ensureResponderUserAndRecord('demo-responder-bilal', 'Bilal Ahmed', '0344-5550110', 'FIELD_RESCUER', 24.9061, 67.1540);
  const junaid = await ensureResponderUserAndRecord('demo-responder-junaid', 'Junaid Siddiqui', '0345-5550111', 'DRIVER', 24.9388, 67.0583);
  const kashif = await ensureResponderUserAndRecord('demo-responder-kashif', 'Kashif Mehmood', '0346-5550112', 'FIELD_RESCUER', 24.8612, 67.0298);

  const akf21 = await ensureAmbulance('demo-ambulance-akf21', 'AKF-21', 'KHI-KE-2101', sara.id, 24.8805, 67.0965);
  const akf29 = await ensureAmbulance('demo-ambulance-akf29', 'AKF-29', 'KHI-OR-2901', kashif.id, 24.8612, 67.0298);
  const akf33 = await ensureAmbulance('demo-ambulance-akf33', 'AKF-33', 'KHI-NK-3301', junaid.id, 24.9388, 67.0583);
  const akf07 = await ensureAmbulance('demo-ambulance-akf07', 'AKF-07', 'KHI-GL-8910', null, 24.919, 67.098);

  const respondersByName = new Map([['Sara Ali', sara], ['Bilal Ahmed', bilal], ['Junaid Siddiqui', junaid], ['Kashif Mehmood', kashif]]);
  const ambulancesByIdentifier = new Map([['AKF-21', akf21], ['AKF-29', akf29], ['AKF-33', akf33]]);

  // ─── 3. Case-code generator (same scheme as emergencyCaseService) ───
  async function generateCaseCode(): Promise<string> {
    const year = new Date().getFullYear();
    const latest = await prisma.emergencyCase.findFirst({
      where: { caseCode: { startsWith: `KC-${year}-` } },
      orderBy: { caseCode: 'desc' },
      select: { caseCode: true },
    });
    let next = 1;
    if (latest) {
      const n = parseInt(latest.caseCode.split('-')[2], 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `KC-${year}-${next.toString().padStart(6, '0')}`;
  }

  const report: { caseCode: string; status: string; urgency: string; demoKey: string; trackingToken?: string }[] = [];

  // ─── 4. Create demo cases ──────────────────────────────────
  for (const d of DEMO_CASES) {
    const caseCode = await generateCaseCode();
    const createdAt = ago(d.createdHoursAgo * HOUR);
    const aiDoneAt = new Date(createdAt.getTime() + 45_000);

    const effectiveStatus = d.assignment ? STAGE_TO_CASE_STATUS[d.assignment.stage] : d.caseStatus;

    // Deterministic raw access token so tracking links are stable & printable.
    const rawToken = createHash('sha256').update(`khidmat-demo-token:${d.demoKey}`).digest('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(NOW + 90 * 24 * HOUR);

    const c = await prisma.emergencyCase.create({
      data: {
        caseCode,
        source: d.source,
        primaryContact: d.primaryContact,
        originalMessage: d.originalMessage,
        transcript: d.source === 'VOICE_CALL' ? d.voiceTurns?.map((t) => `${t.speaker}: ${t.text}`).join('\n') ?? d.originalMessage : null,
        locationText: d.locationText,
        latitude: d.lat ?? null,
        longitude: d.lng ?? null,
        locationAccuracy: d.lat ? 12 : null,
        locationConfirmed: d.locationConfirmed ?? false,
        detectedLanguage: d.ai.detectedLanguage,
        aiSummary: d.ai.summary,
        aiReasoning: d.ai.reasoning,
        urgency: d.ai.urgency,
        aiConfidence: d.ai.confidence,
        keyNeeds: d.ai.keyNeeds,
        specialNeeds: d.ai.specialNeeds,
        missingInformation: d.ai.missingInformation,
        followUpQuestion: d.ai.followUpQuestion ?? null,
        potentiallyCritical: d.ai.urgency === 'CRITICAL',
        peopleAffected: d.ai.peopleAffected,
        locationTextDetected: d.locationText,
        status: effectiveStatus,
        demoKey: d.demoKey,
        createdAt,
        closedAt: d.caseStatus === 'COMPLETED' ? new Date(createdAt.getTime() + 90 * MIN) : null,
        categories: { create: d.categories.map((category) => ({ category })) },
        accessTokens: { create: { tokenHash, expiresAt } },
      },
    });

    // ── audit timeline ──
    const updates: { updateType: CaseUpdateType; message: string; at: Date; byOp?: boolean }[] = [
      { updateType: 'CASE_CREATED', message: `Emergency case ${caseCode} created via ${d.source}.`, at: createdAt },
      { updateType: 'AI_ANALYSIS_COMPLETED', message: 'AI triage completed. Human review required before operational action.', at: aiDoneAt },
    ];
    if (d.caseStatus === 'UNDER_REVIEW') {
      updates.push({ updateType: 'OPERATOR_NOTE', message: 'Operator verifying scene details with reporter.', at: new Date(aiDoneAt.getTime() + 6 * MIN), byOp: true });
    }
    if (d.caseStatus === 'NEEDS_INFORMATION') {
      updates.push({ updateType: 'OPERATOR_NOTE', message: 'Location ambiguous due to flooding — follow-up question sent to requester.', at: new Date(aiDoneAt.getTime() + 8 * MIN), byOp: true });
    }

    // ── assignment (active stages) ──
    if (d.assignment) {
      const a = d.assignment;
      const responder = respondersByName.get(a.responderName);
      const ambulance = a.ambulanceIdentifier ? ambulancesByIdentifier.get(a.ambulanceIdentifier) : undefined;
      if (!responder) throw new Error(`Demo seed: unknown responder ${a.responderName}`);

      const assignedAt = new Date(aiDoneAt.getTime() + a.delayMin * MIN);
      const acceptedAt = new Date(assignedAt.getTime() + 4 * MIN);
      const enRouteAt = new Date(assignedAt.getTime() + 8 * MIN);
      const arrivedAt = new Date(assignedAt.getTime() + 25 * MIN);

      await prisma.assignment.create({
        data: {
          emergencyCaseId: c.id,
          responderId: responder.id,
          ambulanceId: ambulance?.id ?? null,
          assignedByOperatorId: operator.id,
          status: a.stage,
          assignedAt,
          acceptedAt: a.stage !== 'PENDING' ? acceptedAt : null,
          enRouteAt: ['EN_ROUTE', 'ARRIVED'].includes(a.stage) ? enRouteAt : null,
          arrivedAt: a.stage === 'ARRIVED' ? arrivedAt : null,
        },
      });

      updates.push({ updateType: 'AMBULANCE_ASSIGNED', message: `Assignment created. Responder: ${a.responderName}${ambulance ? `, Ambulance: ${ambulance.identifier}` : ''}`, at: assignedAt, byOp: true });
      if (a.stage !== 'PENDING') updates.push({ updateType: 'RESPONDER_ACCEPTED', message: 'Responder accepted assignment', at: acceptedAt });
      if (['EN_ROUTE', 'ARRIVED'].includes(a.stage)) updates.push({ updateType: 'EN_ROUTE', message: 'Responder is en route', at: enRouteAt });
      if (a.stage === 'ARRIVED') updates.push({ updateType: 'ARRIVED', message: 'Responder arrived at scene', at: arrivedAt });

      // invariant: active assignment ⇔ resource not AVAILABLE
      await prisma.responder.update({ where: { id: responder.id }, data: { availabilityStatus: 'ASSIGNED' } });
      if (ambulance) await prisma.ambulance.update({ where: { id: ambulance.id }, data: { availabilityStatus: 'ASSIGNED' } });

      // GPS realism for EN_ROUTE / ARRIVED
      if (d.lat && d.lng) {
        const from = { lat: responder.currentLatitude ?? d.lat, lng: responder.currentLongitude ?? d.lng };
        const t = a.stage === 'ARRIVED' ? 1 : a.stage === 'EN_ROUTE' ? 0.55 : 0;
        const pos = { lat: lerp(from.lat, d.lat, t), lng: lerp(from.lng, d.lng, t) };
        await prisma.responder.update({ where: { id: responder.id }, data: { currentLatitude: pos.lat, currentLongitude: pos.lng, lastLocationUpdateAt: ago(4 * MIN), ...(a.stage === 'EN_ROUTE' ? { availabilityStatus: 'EN_ROUTE' } : {}) } });
        if (ambulance) await prisma.ambulance.update({ where: { id: ambulance.id }, data: { currentLatitude: pos.lat, currentLongitude: pos.lng, lastLocationUpdateAt: ago(4 * MIN), ...(a.stage === 'EN_ROUTE' ? { availabilityStatus: 'EN_ROUTE' } : {}) } });
        if (['EN_ROUTE', 'ARRIVED'].includes(a.stage)) {
          const steps = a.stage === 'ARRIVED' ? [0.25, 0.5, 0.75, 1] : [0.15, 0.3, 0.45, 0.55];
          for (const s of steps) {
            await prisma.responderLocation.create({
              data: {
                responderId: responder.id,
                ambulanceId: ambulance?.id ?? null,
                assignmentId: (await prisma.assignment.findFirst({ where: { emergencyCaseId: c.id }, select: { id: true } }))!.id,
                latitude: lerp(from.lat, d.lat, s),
                longitude: lerp(from.lng, d.lng, s),
                accuracy: 10,
                recordedAt: new Date(NOW - (40 - s * 30) * MIN),
              },
            });
          }
        }
      }
    }

    // ── completed lifecycle (case 8) ──
    if (d.completedAssignment) {
      const a = d.completedAssignment;
      const responder = respondersByName.get(a.responderName)!;
      const ambulance = a.ambulanceIdentifier ? ambulancesByIdentifier.get(a.ambulanceIdentifier) : undefined;
      const assignedAt = new Date(aiDoneAt.getTime() + 7 * MIN);
      const acceptedAt = new Date(assignedAt.getTime() + 3 * MIN);
      const enRouteAt = new Date(assignedAt.getTime() + 6 * MIN);
      const arrivedAt = new Date(assignedAt.getTime() + 22 * MIN);
      const completedAt = new Date(assignedAt.getTime() + 55 * MIN);

      await prisma.assignment.create({
        data: {
          emergencyCaseId: c.id,
          responderId: responder.id,
          ambulanceId: ambulance?.id ?? null,
          assignedByOperatorId: operator.id,
          status: 'COMPLETED',
          assignedAt, acceptedAt, enRouteAt, arrivedAt, completedAt,
        },
      });
      updates.push({ updateType: 'AMBULANCE_ASSIGNED', message: `Assignment created. Responder: ${a.responderName}${ambulance ? `, Ambulance: ${ambulance.identifier}` : ''}`, at: assignedAt, byOp: true });
      updates.push({ updateType: 'RESPONDER_ACCEPTED', message: 'Responder accepted assignment', at: acceptedAt });
      updates.push({ updateType: 'EN_ROUTE', message: 'Responder is en route', at: enRouteAt });
      updates.push({ updateType: 'ARRIVED', message: 'Responder arrived at scene', at: arrivedAt });
      updates.push({ updateType: 'COMPLETED', message: 'Response completed — patient transferred to hospital, mother and child stable.', at: completedAt });
      // A completed (historical) assignment must NOT change current resource
      // availability — those resources were released in the past and may since
      // be held by a later active assignment (handled by that assignment).
    }

    // ── voice session (case 5) ──
    if (d.voiceTurns && d.voiceTurns.length > 0) {
      const startedAt = new Date(createdAt.getTime() - 3 * MIN);
      await prisma.voiceCallSession.create({
        data: {
          emergencyCaseId: c.id,
          provider: 'TWILIO',
          providerCallSid: 'DEMO-VOICE-SEED-SID-0001',
          callerNumber: d.primaryContact,
          status: 'COMPLETED',
          detectedLanguage: d.ai.detectedLanguage,
          startedAt,
          endedAt: new Date(startedAt.getTime() + 3 * MIN),
          lastActivityAt: new Date(startedAt.getTime() + 3 * MIN),
          turnCount: d.voiceTurns.length,
          transcriptText: d.voiceTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n'),
          humanReviewRequired: false,
          processingState: 'IDLE',
          turns: {
            create: d.voiceTurns.map((t) => ({
              speaker: t.speaker,
              transcript: t.text,
              detectedLanguage: d.ai.detectedLanguage,
              createdAt: new Date(startedAt.getTime() + t.offsetSec * 1000),
            })),
          },
        },
      });
      updates.push({ updateType: 'VOICE_CALL_COMPLETED', message: 'Voice intake completed. Transcript attached for human review.', at: new Date(startedAt.getTime() + 3 * MIN) });
      console.log(`   🎙 voice demo session: ${d.voiceTurns.length} turns linked to ${caseCode}`);
    }

    await prisma.caseUpdate.createMany({
      data: updates.map((u) => ({
        emergencyCaseId: c.id,
        updateType: u.updateType,
        message: u.message,
        createdAt: u.at,
        createdByUserId: u.byOp ? operator.id : null,
      })),
    });

    report.push({ caseCode, status: effectiveStatus, urgency: d.ai.urgency, demoKey: d.demoKey, trackingToken: rawToken });
    console.log(`✅ ${caseCode}  [${d.ai.urgency}/…/${effectiveStatus}]  ${d.label}`);
  }

  // ─── 5. Primary live-demo resource readiness ───────────────
  const ahmed = await prisma.responder.findFirst({ where: { name: 'Ahmed Khan' } });
  if (ahmed) {
    const activeOfAhmed = await prisma.assignment.findFirst({
      where: { responderId: ahmed.id, status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
    });
    if (!activeOfAhmed) {
      await prisma.responder.update({ where: { id: ahmed.id }, data: { availabilityStatus: 'AVAILABLE', currentLatitude: 24.92, currentLongitude: 67.09, lastLocationUpdateAt: ago(20 * MIN) } });
    }
  }
  const akf07now = await prisma.ambulance.findUnique({ where: { identifier: 'AKF-07' } });
  if (akf07now) {
    const activeOfAkf07 = await prisma.assignment.findFirst({
      where: { ambulanceId: akf07now.id, status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
    });
    if (!activeOfAkf07) {
      await prisma.ambulance.update({ where: { id: akf07now.id }, data: { availabilityStatus: 'AVAILABLE' } });
    }
  }

  // ─── 6. Invariant audit ────────────────────────────────────
  const allResponders = await prisma.responder.findMany({
    include: { assignments: { where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } }, select: { id: true } } },
  });
  const problems: string[] = [];
  for (const r of allResponders) {
    const hasActive = r.assignments.length > 0;
    if (hasActive && r.assignments.length > 1) problems.push(`${r.name}: ${r.assignments.length} concurrent active assignments`);
    if (hasActive && r.availabilityStatus === 'AVAILABLE') problems.push(`${r.name}: active assignment but AVAILABLE`);
    if (!hasActive && (r.availabilityStatus === 'ASSIGNED' || r.availabilityStatus === 'EN_ROUTE') && r.name !== 'Usman Raza') problems.push(`${r.name}: no active assignment but ${r.availabilityStatus}`);
  }
  const allAmb = await prisma.ambulance.findMany({
    include: { assignments: { where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } }, select: { id: true } } },
  });
  for (const amb of allAmb) {
    const hasActive = amb.assignments.length > 0;
    if (hasActive && amb.assignments.length > 1) problems.push(`${amb.identifier}: multiple active assignments`);
    if (hasActive && amb.availabilityStatus === 'AVAILABLE') problems.push(`${amb.identifier}: active assignment but AVAILABLE`);
    if (!hasActive && (amb.availabilityStatus === 'ASSIGNED' || amb.availabilityStatus === 'EN_ROUTE')) problems.push(`${amb.identifier}: no active assignment but ${amb.availabilityStatus}`);
  }
  if (problems.length > 0) {
    console.warn('\n⚠️  Invariant issues:');
    for (const p of problems) console.warn('   -', p);
  } else {
    console.log('\n✅ Invariant audit passed: one active assignment per responder/ambulance; availability matches state.');
  }

  // ─── 7. Printable summary (paste into demo runbook) ───────
  console.log('\n══════════════ DEMO CASES ══════════════');
  for (const r of report) {
    console.log(`  ${r.caseCode}  ${r.urgency.padEnd(8)} ${r.status.padEnd(20)} ${r.demoKey}`);
    console.log(`           tracking: /case/${r.caseCode}?t=${r.trackingToken}`);
  }
  const ahmedNow = await prisma.responder.findFirst({ where: { name: 'Ahmed Khan' } });
  const akf07Final = await prisma.ambulance.findUnique({ where: { identifier: 'AKF-07' } });
  console.log('\n🎯 Live walkthrough ready:');
  console.log(`   Ahmed Khan (Responder Demo) → ${ahmedNow?.availabilityStatus}`);
  console.log(`   AKF-07                      → ${akf07Final?.availabilityStatus}`);
  console.log(`   Start: submit fresh emergency at /emergency (Gulshan Block 7 scenario), assign to Ahmed Khan.`);
  console.log('\n🌿 Demo seed complete. Re-running is safe — genuine cases untouched.');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
