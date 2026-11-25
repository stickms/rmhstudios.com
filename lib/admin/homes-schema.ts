/** Zod for /api/admin/homes (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { FEED_URL_MAX, HOME_LISTING_TYPES, HOME_SOURCE_STATUSES, STATUS_ACTIONS } from '@/lib/admin/homes';

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** A new RSS source. The city, state and coordinates are the default place for items that carry none. */
export const addRssSourceBody = z
  .object({
    label: z.string().trim().min(1).max(120),
    url: z.string().trim().min(1).max(FEED_URL_MAX),
    listingType: z.enum(HOME_LISTING_TYPES),
    defaultCity: optionalText(120),
    defaultState: optionalText(64),
    defaultLat: z.number().min(-90).max(90).optional(),
    defaultLng: z.number().min(-180).max(180).optional(),
  })
  .refine((v) => (v.defaultLat === undefined) === (v.defaultLng === undefined), {
    message: 'Give both coordinates or neither.',
    path: ['defaultLat'],
  });

/** Pause or resume, naming the status the admin saw (the compare-and-set). */
export const sourceStatusBody = z.object({
  action: z.enum(STATUS_ACTIONS),
  seen: z.enum(HOME_SOURCE_STATUSES),
});
