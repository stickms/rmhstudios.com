/**
 * RMH Rideshare — in-app notification helpers (server only).
 *
 * Thin wrappers over the shared notification system. Ride events use the
 * SYSTEM notification type with a rideshare `entityType` so the notifications
 * column can brand them, and always carry an explicit `link`.
 */

import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { rideClassName } from './classes';

/** Notify the rider that something changed with their ride. */
export async function notifyRider(
  riderId: string,
  actorId: string | null,
  ride: { id: string; rideClass: string },
  preview: string,
): Promise<void> {
  await createNotification({
    userId: riderId,
    actorId,
    type: 'SYSTEM',
    entityType: 'ride',
    entityId: ride.id,
    preview,
    link: '/rideshare/ride',
  });
}

/** Notify the driver that something changed with a trip they're on. */
export async function notifyDriver(
  driverId: string,
  actorId: string | null,
  ride: { id: string },
  preview: string,
): Promise<void> {
  await createNotification({
    userId: driverId,
    actorId,
    type: 'SYSTEM',
    entityType: 'ride',
    entityId: ride.id,
    preview,
    link: '/rideshare/drive',
  });
}

/**
 * Fan a new ride request out to currently-online approved drivers (best-effort,
 * capped). This powers the "live" driver-side request notifications.
 */
export async function notifyAvailableDrivers(ride: {
  id: string;
  riderId: string;
  rideClass: string;
  pickupLabel: string;
  dropoffLabel: string;
}): Promise<void> {
  try {
    const drivers = await prisma.rideshareDriver.findMany({
      where: { status: 'APPROVED', isOnline: true, userId: { not: ride.riderId } },
      select: { userId: true },
      take: 30,
    });
    const preview = `New ${rideClassName(ride.rideClass)} request: ${ride.pickupLabel} → ${ride.dropoffLabel}`;
    await Promise.all(
      drivers.map((d) =>
        createNotification({
          userId: d.userId,
          type: 'SYSTEM',
          entityType: 'ride_request',
          entityId: ride.id,
          preview,
          link: '/rideshare/drive',
        }),
      ),
    );
  } catch (err) {
    console.error('[rideshare] failed to notify drivers:', err);
  }
}

/** Notify the other party that a new chat message arrived (collapsed while unread). */
export async function notifyNewMessage(
  recipientId: string,
  senderId: string,
  rideId: string,
  isRecipientRider: boolean,
  preview: string,
): Promise<void> {
  await createNotification({
    userId: recipientId,
    actorId: senderId,
    type: 'SYSTEM',
    entityType: 'ride_message',
    entityId: rideId,
    preview,
    link: isRecipientRider ? '/rideshare/ride' : '/rideshare/drive',
    dedupeUnread: true,
  });
}
