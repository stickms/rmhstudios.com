/**
 * Contracts for /api/rideshare/** and /api/admin/rideshare/** (redesign audit
 * C1, batches 6 and 9). The ride endpoints keep their bespoke 400 messages via
 * `defineHandler`'s `invalid` option; the bodies' zod schemas live in
 * `rideshare-schema.ts` and are referenced here by `import type`. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  adminApplicationsQuery,
  adminDecisionBody,
  adminRidesQuery,
  createRideBody,
  directionsQuery,
  driverApplicationBody,
  driverLocationBody,
  driverOnlineBody,
  geocodeQuery,
  listRidesQuery,
  rateRideBody,
  rideActionBody,
  reverseQuery,
  savedPlaceBody,
  sendRideMessageBody,
} from './rideshare-schema';

export type RideStatusView =
  | 'SCHEDULED'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface RidePersonView {
  id: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
  image:
    | string
    | null;
}

export interface RideVehicleView {
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: number;
  licensePlate: string;
  seats: number;
}

/** A ride as listed to its rider/driver (never any licence data). */
export interface RideView {
  id: string;
  rideClass: string;
  status: RideStatusView;
  pickupLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters:
    | number
    | null;
  durationSeconds:
    | number
    | null;
  estimatedFareCents: number;
  tipCents: number;
  scheduledFor:
    | string
    | null;
  notes:
    | string
    | null;
  requestedAt: string;
  acceptedAt:
    | string
    | null;
  completedAt:
    | string
    | null;
  cancelledAt:
    | string
    | null;
  rider: RidePersonView;
  driver:
    | (RidePersonView & {
        rideshareDriver: RideVehicleView | null;
      })
    | null;
}

export const listRidesApi =
  endpoint<{
    query: z.infer<
      typeof listRidesQuery
    >;
    res: {
      rides: RideView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/rides',
    },
  );

export const createRideApi =
  endpoint<{
    body: z.infer<
      typeof createRideBody
    >;
    res: {
      ride: RideView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/rides',
    },
  );

/** accept | start | complete | cancel | tip. */
export const rideActionApi =
  endpoint<{
    body: z.infer<
      typeof rideActionBody
    >;
    res: {
      ride: {
        id: string;
        status: RideStatusView;
        driverId:
          | string
          | null;
      } | null;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/rides/$id',
    },
  );

export const rateRideApi =
  endpoint<{
    body: z.infer<
      typeof rateRideBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/rides/$id/rate',
    },
  );

export interface RideMessageView {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export const sendRideMessageApi =
  endpoint<{
    body: z.infer<
      typeof sendRideMessageBody
    >;
    res: {
      message: RideMessageView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/rides/$id/messages',
    },
  );

export interface RideSyncVehicleView extends RideVehicleView {
  lastLat:
    | number
    | null;
  lastLng:
    | number
    | null;
  locationUpdatedAt:
    | string
    | null;
  ratingCount: number;
  ratingTotal: number;
}

/** The live trip snapshot polled by both parties. */
export interface RideSyncView {
  id: string;
  status: RideStatusView;
  rideClass: string;
  pickupLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters:
    | number
    | null;
  durationSeconds:
    | number
    | null;
  estimatedFareCents: number;
  tipCents: number;
  requestedAt: string;
  acceptedAt:
    | string
    | null;
  completedAt:
    | string
    | null;
  ratingByRider:
    | number
    | null;
  ratingByDriver:
    | number
    | null;
  rider: RidePersonView;
  driver:
    | (RidePersonView & {
        rideshareDriver: RideSyncVehicleView | null;
      })
    | null;
  messages: RideMessageView[];
}

export const syncRideApi =
  endpoint<{
    res: {
      ride: RideSyncView;
      role:
        | 'rider'
        | 'driver';
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/rides/$id/sync',
    },
  );

export interface DriverRecordView {
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED';
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  licensePlate: string;
  vehicleClass: string;
  seats: number;
  isOnline: boolean;
  ratingCount: number;
  ratingAvg:
    | number
    | null;
  rejectionReason:
    | string
    | null;
  createdAt: string;
  reviewedAt:
    | string
    | null;
}

export const getDriverApi =
  endpoint<{
    res: {
      driver: DriverRecordView | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/driver',
    },
  );

/**
 * Apply to drive. The route checks "already approved / under review" (409)
 * BEFORE it validates the body (400), an order `defineHandler`'s body option
 * cannot express, so it parses by hand and this contract is not bound with
 * `implement`.
 */
export const applyToDriveApi =
  endpoint<{
    // The form posts year and seats as text; the route coerces them.
    body: Omit<
      z.infer<
        typeof driverApplicationBody
      >,
      | 'vehicleYear'
      | 'seats'
    > & {
      vehicleYear:
        | number
        | string;
      seats:
        | number
        | string;
    };
    res: {
      driver: DriverRecordView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/driver',
    },
  );

export const setDriverOnlineApi =
  endpoint<{
    body: z.infer<
      typeof driverOnlineBody
    >;
    res: {
      isOnline: boolean;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/rideshare/driver',
    },
  );

/** Driver location heartbeat; a throttled call answers `{ ok, throttled }`. */
export const shareDriverLocationApi =
  endpoint<{
    body: z.infer<
      typeof driverLocationBody
    >;
    res: {
      ok: true;
      throttled?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/location',
    },
  );

export const rideDirectionsApi =
  endpoint<{
    query: z.infer<
      typeof directionsQuery
    >;
    res: {
      distanceMeters: number;
      durationSeconds: number;
      precise: boolean;
      geometry:
        | [
            number,
            number,
          ][]
        | null;
      fareCents:
        | number
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/directions',
    },
  );

export interface GeocodeResultView {
  label: string;
  lat: number;
  lng: number;
}

export const geocodeApi =
  endpoint<{
    query: z.infer<
      typeof geocodeQuery
    >;
    res: {
      results: GeocodeResultView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/geocode',
    },
  );

export const reverseGeocodeApi =
  endpoint<{
    query: z.infer<
      typeof reverseQuery
    >;
    res: {
      label: string;
      lat: number;
      lng: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/reverse',
    },
  );

export const createSavedPlaceApi =
  endpoint<{
    body: z.infer<
      typeof savedPlaceBody
    >;
    res: {
      place: SavedPlaceView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rideshare/places',
    },
  );

export interface AdminApplicationView {
  id: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED';
  user: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
    image:
      | string
      | null;
    email:
      | string
      | null;
  };
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  licensePlate: string;
  vehicleClass: string;
  seats: number;
  licenseNumber:
    | string
    | null;
  rejectionReason:
    | string
    | null;
  createdAt: string;
  reviewedAt:
    | string
    | null;
}

export const adminListDriverApplicationsApi =
  endpoint<{
    query: z.infer<
      typeof adminApplicationsQuery
    >;
    res: {
      items: AdminApplicationView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/rideshare/applications',
    },
  );

export const adminDecideDriverApplicationApi =
  endpoint<{
    body: z.infer<
      typeof adminDecisionBody
    >;
    res: {
      status:
        | 'APPROVED'
        | 'REJECTED';
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/admin/rideshare/applications',
    },
  );

export interface AdminRideView {
  id: string;
  rideClass: string;
  status: RideStatusView;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters:
    | number
    | null;
  durationSeconds:
    | number
    | null;
  estimatedFareCents: number;
  scheduledFor:
    | string
    | null;
  requestedAt: string;
  acceptedAt:
    | string
    | null;
  completedAt:
    | string
    | null;
  cancelledAt:
    | string
    | null;
  rider:
    | (RidePersonView & {
        email:
          | string
          | null;
      })
    | null;
  driver: RidePersonView | null;
}

export const adminListRidesApi =
  endpoint<{
    query: z.infer<
      typeof adminRidesQuery
    >;
    res: {
      rides: AdminRideView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/rideshare/rides',
    },
  );

export interface DriverRecentTrip {
  id: string;
  rideClass: string;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters:
    | number
    | null;
  estimatedFareCents: number;
  tipCents: number;
  driverEarningsCents: number;
  completedAt:
    | string
    | null;
  ratingByRider:
    | number
    | null;
}

export interface DriverEarningsView {
  totalTrips: number;
  totalDistanceMeters: number;
  grossFaresCents: number;
  tipsCents: number;
  serviceFeeCents: number;
  insuranceCents: number;
  weekTrips: number;
  weekEarningsCents: number;
  earningsCents: number;
  ratingCount: number;
  ratingAvg:
    | number
    | null;
  recent: DriverRecentTrip[];
}

/** Approved drivers only (403 otherwise). */
export const getDriverEarningsApi =
  endpoint<{
    res: DriverEarningsView;
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/earnings',
    },
  );

export interface SavedPlaceView {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export const listSavedPlacesApi =
  endpoint<{
    res: {
      places: SavedPlaceView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rideshare/places',
    },
  );

export const deleteSavedPlaceApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rideshare/places/$id',
    },
  );
