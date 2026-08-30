# KhidmatConnect AI

## Project Goal

KhidmatConnect AI is an AI-powered humanitarian emergency coordination platform.

The system helps citizens submit emergency requests quickly and helps human coordinators understand, prioritize, and assign the correct response resources.

The AI supports the coordinator but does not replace human decision-making.

---

## Main Users

1. Emergency Requester
2. Registered Citizen
3. Operator / Coordinator
4. Responder / Ambulance Driver

---

## Core MVP Flow

Emergency Request  
→ AI Understanding  
→ Case Creation  
→ Operator Review  
→ Resource / Ambulance Assignment  
→ Responder Action  
→ Live Tracking  
→ Requester Status Tracking  
→ Case Completion

---

## Technology Direction

- Next.js
- React
- TypeScript
- PostgreSQL
- Alibaba Cloud Model Studio
- Qwen AI models
- Google Maps Platform
- Twilio only for prototype telephony
- Alibaba Cloud for deployment

---

## Important Rules

- Emergency requests must work without login.
- Emergency intake must never fail just because AI is uncertain.
- Human operators must be able to override AI decisions.
- Critical emergencies must not be delayed by unnecessary questions.
- Full sensitive emergency details should not be stored directly in browser localStorage.
- A secure browser case token should remain available for up to 90 days.
- English and Urdu UI must be supported.
- Urdu layout must support RTL.
- Emergency messages may contain English, Urdu, Roman Urdu, or mixed language.
- Demo resource data must be clearly labelled as demo data.

---

# Application Structure

The project should use the Next.js App Router with TypeScript.

Primary application areas:

- `/`
  Public landing page.

- `/emergency`
  No-login emergency intake screen.

- `/case/[caseId]`
  Temporary emergency case status and tracking screen.

- `/login`
  Login for registered citizens, operators, and responders.

- `/dashboard`
  Registered citizen dashboard for normal support requests and history.

- `/operator`
  Operator / coordinator dashboard.

- `/operator/cases/[caseId]`
  Full emergency case review and response screen.

- `/responder`
  Ambulance / responder mobile dashboard.

- `/responder/cases/[caseId]`
  Assigned emergency details, navigation, and status controls.

---

## Backend Responsibilities

The backend must provide APIs for:

- emergency case creation
- AI emergency analysis
- case status updates
- resource management
- ambulance / responder assignment
- live responder location updates
- temporary case-token validation
- authentication
- voice emergency intake
- notifications

---

## Architecture Principles

- Keep the MVP as a modular monolith.
- Do not create microservices unless specifically requested later.
- Keep business logic separate from UI components.
- Keep external integrations behind service modules.
- Never expose secret API keys to browser-side code.
- All AI, Twilio, database, and privileged Google Maps operations must run server-side where appropriate.
- Use environment variables for credentials.
- Use reusable TypeScript types and validation schemas.
- Design modules so they can later be separated into services if needed.

---

# Core Data Model

## User

Represents authenticated users.

### Fields

- id
- name
- email
- phone
- passwordHash or authenticationProvider
- role
- preferredLanguage
- createdAt
- updatedAt

### Roles

- CITIZEN
- OPERATOR
- RESPONDER

Emergency requesters do not require a User record.

---

## EmergencyCase

Represents an emergency request from the website or voice-call channel.

### Fields

- id
- caseCode
- source
- primaryContact
- alternateContact
- originalMessage
- transcript
- locationText
- latitude
- longitude
- locationAccuracy
- locationConfirmed
- detectedLanguage
- aiSummary
- aiReasoning
- urgency
- aiConfidence
- status
- createdAt
- updatedAt
- closedAt

### Source Values

- WEB
- VOICE_CALL

### Urgency Values

- CRITICAL
- HIGH
- MEDIUM
- LOW

### Status Values

- NEW
- UNDER_REVIEW
- NEEDS_INFORMATION
- ASSIGNED
- RESPONDER_ACCEPTED
- EN_ROUTE
- ARRIVED
- COMPLETED
- CLOSED
- DUPLICATE
- UNREACHABLE

---

## EmergencyCategory

A case can have more than one category.

### Categories

- RESCUE
- MEDICAL
- FOOD
- WATER
- SHELTER
- TRANSPORT
- SUPPLIES
- OTHER

Store these as a many-to-many or equivalent relationship with EmergencyCase.

---

## CaseAccessToken

Used for the no-login 90-day browser case session.

### Fields

- id
- emergencyCaseId
- tokenHash
- expiresAt
- revokedAt
- createdAt

### Important Rules

- Store only the secure token in the browser.
- Store the hashed token in the database.
- Tokens expire after 90 days.
- Sensitive case details must not be stored directly in localStorage.

---

## Resource

Represents humanitarian resources.

### Fields

- id
- name
- type
- phone
- email
- address
- latitude
- longitude
- availabilityStatus
- capacity
- currentCapacity
- isDemo
- createdAt
- updatedAt

### Example Resource Types

- AMBULANCE
- RESCUE_TEAM
- MEDICAL_CENTER
- FOOD_CENTER
- WATER_POINT
- SHELTER
- TRANSPORT
- SUPPLY_CENTER

---

## Responder

Represents an ambulance driver or field responder.

### Fields

- id
- userId
- name
- phone
- responderType
- availabilityStatus
- currentLatitude
- currentLongitude
- lastLocationUpdateAt
- createdAt
- updatedAt

---

## Ambulance

### Fields

- id
- identifier
- vehicleNumber
- responderId
- availabilityStatus
- currentLatitude
- currentLongitude
- lastLocationUpdateAt
- createdAt
- updatedAt

### Availability Values

- AVAILABLE
- ASSIGNED
- EN_ROUTE
- OFFLINE
- MAINTENANCE

---

## Assignment

Connects an emergency case with a resource or responder.

### Fields

- id
- emergencyCaseId
- resourceId
- ambulanceId
- responderId
- assignedByOperatorId
- status
- assignedAt
- acceptedAt
- enRouteAt
- arrivedAt
- completedAt

---

## CaseUpdate

Stores the case history.

### Fields

- id
- emergencyCaseId
- updateType
- message
- createdByUserId
- createdAt

### Example Update Types

- priority changed
- category changed
- operator note
- ambulance assigned
- responder accepted
- responder arrived
- requester added information
- case closed

---

## ResponderLocation

Stores live responder / ambulance location history.

### Fields

- id
- responderId
- ambulanceId
- assignmentId
- latitude
- longitude
- accuracy
- recordedAt

Location updates should only be stored while the responder is on duty or actively assigned.

---

## NormalRequest

Used later for logged-in non-emergency citizen requests.

### Fields

- id
- userId
- subject
- message
- status
- createdAt
- updatedAt

This module is secondary to the emergency MVP.

---

# AI Emergency Analysis Contract

The emergency AI must return structured JSON only.

## Required Shape

```json
{
  "detectedLanguage": "URDU | ENGLISH | ROMAN_URDU | MIXED | UNKNOWN",
  "categories": [
    "RESCUE",
    "MEDICAL"
  ],
  "urgency": "CRITICAL | HIGH | MEDIUM | LOW",
  "summary": "Short operator-friendly summary of the emergency.",
  "reasoning": "Short explanation of why the urgency and categories were selected.",
  "keyNeeds": [
    "ambulance",
    "rescue assistance"
  ],
  "peopleAffected": null,
  "specialNeeds": [
    "elderly person",
    "diabetic patient"
  ],
  "locationTextDetected": "Gulshan Block 7",
  "missingInformation": [
    "exact street address"
  ],
  "followUpQuestion": "Please tell us your nearest landmark.",
  "confidence": 0.86,
  "potentiallyCritical": true
}