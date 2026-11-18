/** Contracts for per-page vibe endpoints. Client-safe: no zod ships from here. */
import { endpoint } from '@/lib/contract/endpoint';
import type { z } from 'zod';
import type {
  vibeGalleryQuerySchema,
  vibeLaunchQuerySchema,
  vibePageQuerySchema,
} from '@/lib/rmhvibe/vibe-schema';
import type { VibeCard } from '@/lib/rmhvibe/vibe.server';
import type {
  TweakSpec,
  TweakValue,
} from '@/lib/rmhvibe/tweaks';

/**
 * Owner only (403 otherwise): save the page's tweak values. Entries are checked against
 * the latest version's spec and the rest are dropped; the thumbnail is re-rendered.
 */
export const vibeTweaksApi =
  endpoint<{
    body: {
      values: Record<
        string,
        unknown
      >;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/vibe/page/$slug/tweaks',
    },
  );

export type VibeKind =
  | 'page'
  | 'widget';

/**
 * A ready page (404 otherwise) at one version, or its latest when `versionId` is left out
 * (404 if that version is not the page's). Carries what a frame needs to run: the HTML,
 * the version's tweak spec and the page's saved tweak values. Public, like `/v/$slug`.
 */
export const vibePageApi =
  endpoint<{
    query: z.infer<
      typeof vibePageQuerySchema
    >;
    res: {
      slug: string;
      versionId: string;
      title: string;
      description:
        | string
        | null;
      html: string;
      kind: VibeKind;
      thumbnailUrl:
        | string
        | null;
      tweakValues: Record<
        string,
        TweakValue
      >;
      tweakSpec: TweakSpec[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/vibe/page/$slug',
    },
  );

export type VibeGalleryPage =
  {
    items: VibeCard[];
    nextCursor:
      | string
      | null;
  };

/** Public gallery list (search, newest/best sort, cursor paging) — the Discord Activity's browse view. */
export const vibeGalleryApi =
  endpoint<{
    query: z.infer<
      typeof vibeGalleryQuerySchema
    >;
    res: VibeGalleryPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/vibe/gallery',
    },
  );

/**
 * The vibe most recently launched into a Discord channel in the last 30 minutes, or null.
 * Public; reads only a slug keyed by a channel id.
 */
export const vibeLaunchApi =
  endpoint<{
    query: z.infer<
      typeof vibeLaunchQuerySchema
    >;
    res: {
      slug:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/discord/vibe-launch',
    },
  );
