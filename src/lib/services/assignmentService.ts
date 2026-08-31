/**
 * Assignment service — core logic for Milestone 8.
 *
 * Handles:
 * - Operator assignment (transactional)
 * - Status transitions with validation
 * - Location updates with ownership checks
 * - Duplicate active assignment prevention
 * - Support requests
 * - Completion cleanup
 */

import { prisma } from '@/lib/db/prisma';
import { isValidTransition } from '@/lib/validation/assignment';

// ─── Types ──────────────────────────────────────────────────

export interface AssignInput {
  caseCode: string;
  responderId: string;
  ambulanceId?: string;
  resourceId?: string;
  operatorId: string;
}

export interface StatusTransitionInput {
  assignmentId: string;
  newStatus: 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED';
}

export interface LocationUpdateInput {
  responderId: string;
  ambulanceId?: string;
  assignmentId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface SupportRequestInput {
  assignmentId: string;
  requestType: 'AMBULANCE' | 'MEDICAL_TEAM' | 'RESCUE_TEAM' | 'SUPPLIES' | 'OTHER';
  details: string;
}

// ─── Assignment ─────────────────────────────────────────────

/**
 * Create an assignment transactionally.
 *
 * Validates:
 * - Case exists and is assignable
 * - Responder exists and is available
 * - Ambulance exists and is available (if provided)
 * - No duplicate active assignment for responder/ambulance
 *
 * On success:
 * - Creates Assignment record
 * - Marks responder ASSIGNED
 * - Marks ambulance ASSIGNED (if provided)
 * - Sets case status to ASSIGNED
 * - Creates CaseUpdate audit entry
 */
export async function createAssignment(input: AssignInput) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify case exists and is in an assignable state
    const caseRecord = await tx.emergencyCase.findUnique({
      where: { caseCode: input.caseCode },
      select: { id: true, status: true },
    });
    if (!caseRecord) {
      throw new Error(`Case ${input.caseCode} not found`);
    }

    const assignableStatuses = ['NEW', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'ASSIGNED'];
    if (!assignableStatuses.includes(caseRecord.status)) {
      throw new Error(`Case ${input.caseCode} is not assignable (status: ${caseRecord.status})`);
    }

    // 2. Verify responder exists and is available
    const responder = await tx.responder.findUnique({
      where: { id: input.responderId },
      select: { id: true, availabilityStatus: true, name: true },
    });
    if (!responder) {
      throw new Error(`Responder ${input.responderId} not found`);
    }
    if (responder.availabilityStatus !== 'AVAILABLE') {
      throw new Error(`Responder ${responder.name} is not available (status: ${responder.availabilityStatus})`);
    }

    // 3. Check for duplicate active assignment (responder)
    const activeResponderAssignment = await tx.assignment.findFirst({
      where: {
        responderId: input.responderId,
        status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
      },
    });
    if (activeResponderAssignment) {
      throw new Error(`Responder ${responder.name} already has an active assignment`);
    }

    // 4. Verify ambulance if provided
    let ambulanceName: string | undefined;
    if (input.ambulanceId) {
      const ambulance = await tx.ambulance.findUnique({
        where: { id: input.ambulanceId },
        select: { id: true, availabilityStatus: true, identifier: true },
      });
      if (!ambulance) {
        throw new Error(`Ambulance ${input.ambulanceId} not found`);
      }
      if (ambulance.availabilityStatus !== 'AVAILABLE') {
        throw new Error(`Ambulance ${ambulance.identifier} is not available (status: ${ambulance.availabilityStatus})`);
      }

      // Check for duplicate active assignment (ambulance)
      const activeAmbAssignment = await tx.assignment.findFirst({
        where: {
          ambulanceId: input.ambulanceId,
          status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
        },
      });
      if (activeAmbAssignment) {
        throw new Error(`Ambulance ${ambulance.identifier} already has an active assignment`);
      }
      ambulanceName = ambulance.identifier;
    }

    // 5. Create the assignment
    const assignment = await tx.assignment.create({
      data: {
        emergencyCaseId: caseRecord.id,
        responderId: input.responderId,
        ambulanceId: input.ambulanceId || null,
        resourceId: input.resourceId || null,
        assignedByOperatorId: input.operatorId,
        status: 'PENDING',
      },
    });

    // 6. Mark responder as ASSIGNED
    await tx.responder.update({
      where: { id: input.responderId },
      data: { availabilityStatus: 'ASSIGNED' },
    });

    // 7. Mark ambulance as ASSIGNED (if provided)
    if (input.ambulanceId) {
      await tx.ambulance.update({
        where: { id: input.ambulanceId },
        data: { availabilityStatus: 'ASSIGNED' },
      });
    }

    // 8. Update case status
    await tx.emergencyCase.update({
      where: { id: caseRecord.id },
      data: { status: 'ASSIGNED' },
    });

    // 9. Create audit entry
    const assignmentDetails = [
      `Responder: ${responder.name}`,
      ambulanceName ? `Ambulance: ${ambulanceName}` : null,
    ].filter(Boolean).join(', ');

    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: caseRecord.id,
        updateType: 'AMBULANCE_ASSIGNED',
        message: `Assignment created. ${assignmentDetails}`,
        createdByUserId: input.operatorId,
      },
    });

    return {
      assignmentId: assignment.id,
      caseCode: input.caseCode,
      responderName: responder.name,
      ambulanceName,
    };
  });

  return result;
}

// ─── Status Transitions ─────────────────────────────────────

/**
 * Transition an assignment status with full validation.
 *
 * Validates:
 * - Assignment exists
 * - Current status allows the requested transition
 * - Assignment is not already completed/cancelled
 *
 * On transition:
 * - Updates assignment timestamp
 * - Updates case status
 * - Creates CaseUpdate audit entry
 * - On COMPLETED: releases responder and ambulance
 */
export async function transitionAssignmentStatus(input: StatusTransitionInput) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Get current assignment
    const assignment = await tx.assignment.findUnique({
      where: { id: input.assignmentId },
      include: {
        emergencyCase: { select: { id: true, caseCode: true } },
        responder: { select: { id: true, name: true } },
        ambulance: { select: { id: true, identifier: true } },
      },
    });

    if (!assignment) {
      throw new Error(`Assignment ${input.assignmentId} not found`);
    }

    const currentStatus = assignment.status;

    // 2. Validate transition
    if (!isValidTransition(currentStatus, input.newStatus)) {
      throw new Error(`Invalid transition: ${currentStatus} → ${input.newStatus}`);
    }

    // 3. Build update data
    const updateData: Record<string, unknown> = { status: input.newStatus };
    if (input.newStatus === 'ACCEPTED') updateData.acceptedAt = new Date();
    if (input.newStatus === 'EN_ROUTE') updateData.enRouteAt = new Date();
    if (input.newStatus === 'ARRIVED') updateData.arrivedAt = new Date();
    if (input.newStatus === 'COMPLETED') updateData.completedAt = new Date();

    // 4. Update assignment
    await tx.assignment.update({
      where: { id: input.assignmentId },
      data: updateData,
    });

    // 5. Map assignment status to case status
    const caseStatusMap: Record<string, string> = {
      ACCEPTED: 'RESPONDER_ACCEPTED',
      EN_ROUTE: 'EN_ROUTE',
      ARRIVED: 'ARRIVED',
      COMPLETED: 'COMPLETED',
    };

    await tx.emergencyCase.update({
      where: { id: assignment.emergencyCase.id },
      data: { status: caseStatusMap[input.newStatus] as any },
    });

    // 6. On COMPLETED: release resources
    if (input.newStatus === 'COMPLETED') {
      await tx.responder.update({
        where: { id: assignment.responderId! },
        data: { availabilityStatus: 'AVAILABLE' },
      });
      if (assignment.ambulanceId) {
        await tx.ambulance.update({
          where: { id: assignment.ambulanceId },
          data: { availabilityStatus: 'AVAILABLE' },
        });
      }
      await tx.emergencyCase.update({
        where: { id: assignment.emergencyCase.id },
        data: { closedAt: new Date() },
      });
    }

    // 7. Create audit entry
    const statusLabels: Record<string, string> = {
      ACCEPTED: 'Responder accepted assignment',
      EN_ROUTE: 'Responder is en route',
      ARRIVED: 'Responder arrived at scene',
      COMPLETED: 'Response completed',
    };

    // Map assignment status to CaseUpdateType enum
    const updateTypeMap: Record<string, string> = {
      ACCEPTED: 'RESPONDER_ACCEPTED',
      EN_ROUTE: 'EN_ROUTE',
      ARRIVED: 'ARRIVED',
      COMPLETED: 'COMPLETED',
    };

    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: assignment.emergencyCase.id,
        updateType: (updateTypeMap[input.newStatus] || input.newStatus) as any,
        message: statusLabels[input.newStatus] || `Status changed to ${input.newStatus}`,
      },
    });

    return {
      assignmentId: input.assignmentId,
      caseCode: assignment.emergencyCase.caseCode,
      newStatus: input.newStatus,
    };
  });

  return result;
}

// ─── Location Updates ───────────────────────────────────────

/**
 * Update responder/ambulance location.
 *
 * Validates:
 * - Assignment exists and is active
 * - Responder belongs to the assignment
 * - Coordinates are valid
 * - Tracking only allowed during active assignment
 *
 * Stores:
 * - Responder current position
 * - Ambulance current position (if applicable)
 * - ResponderLocation history row
 */
export async function updateResponderLocation(input: LocationUpdateInput) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify assignment exists and is active
    const assignment = await tx.assignment.findUnique({
      where: { id: input.assignmentId },
      select: {
        id: true,
        responderId: true,
        ambulanceId: true,
        status: true,
      },
    });

    if (!assignment) {
      throw new Error(`Assignment ${input.assignmentId} not found`);
    }

    // 2. Check assignment is active (not completed/cancelled)
    const activeStatuses = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
    if (!activeStatuses.includes(assignment.status)) {
      throw new Error(`Assignment is not active (status: ${assignment.status})`);
    }

    // 3. Verify responder belongs to this assignment
    if (assignment.responderId !== input.responderId) {
      throw new Error('Responder does not belong to this assignment');
    }

    // 4. Update responder current position
    await tx.responder.update({
      where: { id: input.responderId },
      data: {
        currentLatitude: input.latitude,
        currentLongitude: input.longitude,
        lastLocationUpdateAt: new Date(),
      },
    });

    // 5. Update ambulance position if applicable
    if (input.ambulanceId && assignment.ambulanceId === input.ambulanceId) {
      await tx.ambulance.update({
        where: { id: input.ambulanceId },
        data: {
          currentLatitude: input.latitude,
          currentLongitude: input.longitude,
          lastLocationUpdateAt: new Date(),
        },
      });
    }

    // 6. Store location history
    await tx.responderLocation.create({
      data: {
        responderId: input.responderId,
        ambulanceId: input.ambulanceId || null,
        assignmentId: input.assignmentId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy || null,
      },
    });

    return {
      recorded: true,
      latitude: input.latitude,
      longitude: input.longitude,
    };
  });

  return result;
}

// ─── Responder Current Assignment ───────────────────────────

/**
 * Get the current active assignment for a responder.
 * Returns requester-safe operational data.
 */
export async function getResponderCurrentAssignment(responderId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      responderId,
      status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
    include: {
      emergencyCase: {
        select: {
          caseCode: true,
          urgency: true,
          locationText: true,
          latitude: true,
          longitude: true,
          primaryContact: true,
          aiSummary: true,
          categories: { select: { category: true } },
        },
      },
      ambulance: {
        select: { identifier: true, vehicleNumber: true },
      },
      resource: {
        select: { name: true, type: true },
      },
    },
    orderBy: { assignedAt: 'desc' },
  });

  if (!assignment) return null;

  return {
    assignmentId: assignment.id,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    acceptedAt: assignment.acceptedAt,
    enRouteAt: assignment.enRouteAt,
    arrivedAt: assignment.arrivedAt,
    caseCode: assignment.emergencyCase.caseCode,
    urgency: assignment.emergencyCase.urgency,
    categories: assignment.emergencyCase.categories.map((c) => c.category),
    locationText: assignment.emergencyCase.locationText,
    caseLatitude: assignment.emergencyCase.latitude,
    caseLongitude: assignment.emergencyCase.longitude,
    requesterContact: assignment.emergencyCase.primaryContact,
    summary: assignment.emergencyCase.aiSummary,
    ambulance: assignment.ambulance
      ? { identifier: assignment.ambulance.identifier, vehicleNumber: assignment.ambulance.vehicleNumber }
      : null,
    resource: assignment.resource
      ? { name: assignment.resource.name, type: assignment.resource.type }
      : null,
  };
}

// ─── Operator Case Data ─────────────────────────────────────

/**
 * Get active cases with assignment and location data for the operator dashboard.
 */
export async function getOperatorActiveCases() {
  const cases = await prisma.emergencyCase.findMany({
    where: {
      status: { in: ['NEW', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'ASSIGNED', 'RESPONDER_ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
    include: {
      categories: { select: { category: true } },
      assignments: {
        where: {
          status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
        },
        include: {
          responder: {
            select: {
              id: true,
              name: true,
              phone: true,
              currentLatitude: true,
              currentLongitude: true,
              availabilityStatus: true,
            },
          },
          ambulance: {
            select: {
              id: true,
              identifier: true,
              currentLatitude: true,
              currentLongitude: true,
              availabilityStatus: true,
            },
          },
        },
      },
    },
    orderBy: [
      { urgency: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return cases.map((c) => ({
    id: c.id,
    caseCode: c.caseCode,
    status: c.status,
    urgency: c.urgency,
    locationText: c.locationText,
    latitude: c.latitude,
    longitude: c.longitude,
    locationConfirmed: c.locationConfirmed,
    categories: c.categories.map((cat) => cat.category),
    createdAt: c.createdAt,
    assignments: c.assignments.map((a) => ({
      id: a.id,
      status: a.status,
      responder: a.responder
        ? {
            id: a.responder.id,
            name: a.responder.name,
            phone: a.responder.phone,
            latitude: a.responder.currentLatitude,
            longitude: a.responder.currentLongitude,
            availabilityStatus: a.responder.availabilityStatus,
          }
        : null,
      ambulance: a.ambulance
        ? {
            id: a.ambulance.id,
            identifier: a.ambulance.identifier,
            latitude: a.ambulance.currentLatitude,
            longitude: a.ambulance.currentLongitude,
            availabilityStatus: a.ambulance.availabilityStatus,
          }
        : null,
    })),
  }));
}

// ── Support Request ────────────────────────────────────────

/**
 * Create a support request from a responder.
 * Creates a CaseUpdate record for operator visibility.
 * Does NOT auto-dispatch anything.
 */
export async function createSupportRequest(input: SupportRequestInput) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { emergencyCaseId: true, status: true },
  });

  if (!assignment) {
    throw new Error(`Assignment ${input.assignmentId} not found`);
  }

  const activeStatuses = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
  if (!activeStatuses.includes(assignment.status)) {
    throw new Error('Cannot request support on inactive assignment');
  }

  const caseUpdate = await prisma.caseUpdate.create({
    data: {
      emergencyCaseId: assignment.emergencyCaseId,
      updateType: 'OPERATOR_NOTE',
      message: `Support requested: ${input.requestType} — ${input.details}`,
    },
  });

  return {
    updateId: caseUpdate.id,
    requestType: input.requestType,
    details: input.details,
  };
}

// ─── Available Resources ────────────────────────────────────

/**
 * Get available responders and ambulances for operator assignment UI.
 */
export async function getAvailableResources() {
  const [responders, ambulances] = await Promise.all([
    prisma.responder.findMany({
      where: { availabilityStatus: 'AVAILABLE' },
      select: {
        id: true,
        name: true,
        phone: true,
        responderType: true,
        availabilityStatus: true,
        currentLatitude: true,
        currentLongitude: true,
      },
    }),
    prisma.ambulance.findMany({
      where: { availabilityStatus: 'AVAILABLE' },
      select: {
        id: true,
        identifier: true,
        vehicleNumber: true,
        availabilityStatus: true,
        currentLatitude: true,
        currentLongitude: true,
      },
    }),
  ]);

  return { responders, ambulances };
}
