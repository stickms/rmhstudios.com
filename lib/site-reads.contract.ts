/**
 * Contracts for small signed-in and public JSON reads that have no domain contract
 * file of their own: coin balance, delight config, hunt marker, release notes,
 * resume rail, Globe Set record (redesign audit C1). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DelightConfig } from '@/lib/delight/shared';
import type { ReleaseNoteView } from '@/lib/devplatform/release-notes';
import type { ResumeCard } from '@/lib/history/resume.server';

export const coinBalanceApi =
  endpoint<{
    res: {
      coins: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/coins',
    },
  );

export const delightConfigApi =
  endpoint<{
    res: DelightConfig;
  }>()(
    {
      method:
        'GET',
      path: '/api/delight/config',
    },
  );

/** The clue text, only when `path` hides the member's current clue. */
export const huntMarkerApi =
  endpoint<{
    query: {
      path: string;
    };
    res: {
      marker: {
        text: string;
      } | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/hunt/marker',
    },
  );

export const releaseNotesApi =
  endpoint<{
    res: {
      notes: ReleaseNoteView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/release-notes',
    },
  );

export const resumeCardsApi =
  endpoint<{
    res: {
      cards: ResumeCard[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/history/resume',
    },
  );

export interface GlobeSetVersusRecord {
  racesPlayed: number;
  racesWon: number;
  bestRaceMs:
    | number
    | null;
  setsFound: number;
}

export const globeSetRecordApi =
  endpoint<{
    res: {
      record: GlobeSetVersusRecord | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/globeset/record',
    },
  );
