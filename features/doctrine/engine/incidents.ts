/**
 * Doctrine Engine — Incident System
 *
 * Crisis management as entertainment. Failures are content.
 */

import { prisma } from '@/lib/prisma.server';
import {
  cached,
  invalidateCachedPrefix,
} from '@/lib/cached.server';
import { generateCodename } from './constants';
import type {
  IncidentSeverity,
  IncidentStatus,
} from './types';

/**
 * Create a new incident with initial timeline event.
 */
export async function createIncident(data: {
  severity: IncidentSeverity;
  title: string;
  narrative: string;
  firstReporterId?: string;
}) {
  const codename =
    generateCodename();

  const incident =
    await prisma.doctrineIncident.create(
      {
        data: {
          codename,
          severity:
            data.severity,
          title:
            data.title,
          narrative:
            data.narrative,
          firstReporterId:
            data.firstReporterId ??
            null,
          timeline:
            {
              create:
                {
                  type: 'detected',
                  message: `Incident "${codename}" detected. Severity: ${data.severity}. ${data.narrative}`,
                },
            },
        },
        include:
          {
            timeline: true,
          },
      },
    );

  void invalidateCachedPrefix(
    'doctrine:incidents',
  );
  return incident;
}

/**
 * Add a timeline event to an existing incident.
 */
export async function addIncidentEvent(
  incidentId: string,
  type: string,
  message: string,
) {
  const event =
    await prisma.doctrineIncidentEvent.create(
      {
        data: {
          incidentId,
          type,
          message,
        },
      },
    );

  void invalidateCachedPrefix(
    'doctrine:incidents',
  );
  return event;
}

/**
 * Transition an incident to a new status.
 */
export async function transitionIncidentStatus(
  incidentId: string,
  newStatus: IncidentStatus,
) {
  const resolvedAt =
    newStatus ===
      'RESOLVED' ||
    newStatus ===
      'LEGENDARY'
      ? new Date()
      : undefined;

  const incident =
    await prisma.doctrineIncident.update(
      {
        where:
          {
            id: incidentId,
          },
        data: {
          status:
            newStatus,
          resolvedAt,
        },
      },
    );

  // Add timeline event for the transition
  await addIncidentEvent(
    incidentId,
    newStatus.toLowerCase(),
    `Incident status changed to ${newStatus}.`,
  );

  void invalidateCachedPrefix(
    'doctrine:incidents',
  );
  return incident;
}

/**
 * Get recent incidents with caching.
 */
export async function getRecentIncidents(
  limit = 10,
) {
  const cacheKey = `doctrine:incidents:recent:${limit}`;
  return cached(
    cacheKey,
    15_000,
    async () => {
      const result =
        await fetchIncidents(
          limit,
        );
      return result;
    },
    {
      l2: false,
    },
  );
}

async function fetchIncidents(
  limit: number,
) {
  return prisma.doctrineIncident.findMany(
    {
      take: limit,
      orderBy:
        {
          createdAt:
            'desc',
        },
      include:
        {
          timeline:
            {
              orderBy:
                {
                  createdAt:
                    'asc',
                },
            },
          reactions: true,
          _count:
            {
              select:
                {
                  reports: true,
                },
            },
        },
    },
  );
}

/**
 * Get a single incident by ID.
 */
export async function getIncident(
  id: string,
) {
  return prisma.doctrineIncident.findUnique(
    {
      where:
        {
          id,
        },
      include:
        {
          timeline:
            {
              orderBy:
                {
                  createdAt:
                    'asc',
                },
            },
          reactions: true,
          reports:
            {
              include:
                {
                  user: {
                    select:
                      {
                        id: true,
                        name: true,
                        handle: true,
                      },
                  },
                },
              orderBy:
                {
                  createdAt:
                    'desc',
                },
              take: 50,
            },
          _count:
            {
              select:
                {
                  reports: true,
                  reactions: true,
                },
            },
        },
    },
  );
}

/**
 * Submit a user report for an incident.
 */
export async function reportIncident(
  incidentId: string,
  userId: string,
  message: string,
) {
  return prisma.doctrineIncidentReport.create(
    {
      data: {
        incidentId,
        userId,
        message,
      },
    },
  );
}
