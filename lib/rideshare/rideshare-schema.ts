/**
 * Request schemas for the /api/rideshare/** routes, shared by the routes and
 * (as `import type`, so no zod ships) by `rideshare.contract.ts`. Client-safe.
 */
import { z } from 'zod';
import { isRideClassId } from '@/lib/rideshare/classes';
import { MAX_TIP_CENTS } from '@/lib/rideshare/geo';

export const createRideBody =
  z.object(
    {
      rideClass:
        z
          .string()
          .refine(
            isRideClassId,
            'Invalid ride class',
          ),
      pickupLabel:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            300,
          ),
      pickupLat:
        z.number(),
      pickupLng:
        z.number(),
      dropoffLabel:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            300,
          ),
      dropoffLat:
        z.number(),
      dropoffLng:
        z.number(),
      notes:
        z
          .string()
          .trim()
          .max(
            500,
          )
          .optional(),
      scheduledFor:
        z
          .string()
          .datetime()
          .optional(),
    },
  );

/** Lenient on purpose: `scope` is any string; the route treats unknown values as `mine`. */
export const listRidesQuery =
  z.object(
    {
      scope:
        z
          .string()
          .optional(),
    },
  );

export const rideActionBody =
  z.object(
    {
      action:
        z.enum(
          [
            'accept',
            'start',
            'complete',
            'cancel',
            'tip',
          ],
        ),
      // Only used by the `tip` action: a rider tip (in cents) for a completed trip.
      tipCents:
        z.coerce
          .number()
          .int()
          .min(
            1,
          )
          .max(
            MAX_TIP_CENTS,
          )
          .optional(),
    },
  );

export const rateRideBody =
  z.object(
    {
      rating:
        z.coerce
          .number()
          .int()
          .min(
            1,
          )
          .max(
            5,
          ),
    },
  );

export const sendRideMessageBody =
  z.object(
    {
      content:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            500,
          ),
    },
  );

export const driverLocationBody =
  z.object(
    {
      lat: z.number(),
      lng: z.number(),
    },
  );

export const driverOnlineBody =
  z.object(
    {
      isOnline:
        z.boolean(),
    },
  );

const currentYear =
  new Date().getFullYear();

export const driverApplicationBody =
  z.object(
    {
      vehicleMake:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            60,
          ),
      vehicleModel:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            60,
          ),
      vehicleYear:
        z.coerce
          .number()
          .int()
          .min(
            1980,
          )
          .max(
            currentYear +
              2,
          ),
      vehicleColor:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            30,
          ),
      licensePlate:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            16,
          ),
      licenseNumber:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            40,
          ),
      vehicleClass:
        z
          .string()
          .refine(
            isRideClassId,
            'Invalid ride class',
          ),
      seats:
        z.coerce
          .number()
          .int()
          .min(
            1,
          )
          .max(
            8,
          ),
    },
  );

export const savedPlaceBody =
  z.object(
    {
      label:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            40,
          ),
      address:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            300,
          ),
      lat: z.number(),
      lng: z.number(),
    },
  );

/** Read leniently: unparseable numbers are a 400 inside the route, never a schema failure. */
export const directionsQuery =
  z.object(
    {
      fromLat:
        z
          .string()
          .optional(),
      fromLng:
        z
          .string()
          .optional(),
      toLat:
        z
          .string()
          .optional(),
      toLng:
        z
          .string()
          .optional(),
      class:
        z
          .string()
          .optional(),
    },
  );

export const reverseQuery =
  z.object(
    {
      lat: z
        .string()
        .optional(),
      lng: z
        .string()
        .optional(),
    },
  );
export const geocodeQuery =
  z.object(
    {
      q: z
        .string()
        .optional(),
    },
  );

export const adminApplicationsQuery =
  z.object(
    {
      status:
        z
          .string()
          .optional(),
    },
  );
export const adminRidesQuery =
  z.object(
    {
      status:
        z
          .string()
          .optional(),
      q: z
        .string()
        .optional(),
    },
  );

export const adminDecisionBody =
  z.object(
    {
      id: z
        .string()
        .min(
          1,
        ),
      action:
        z.enum(
          [
            'approve',
            'reject',
          ],
        ),
      rejectionReason:
        z
          .string()
          .trim()
          .max(
            500,
          )
          .optional(),
    },
  );
