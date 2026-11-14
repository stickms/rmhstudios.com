/**
 * Contracts for /api/elections/** JSON endpoints (redesign audit C1, batch 5).
 * Client-safe: every type is imported by `import type` from client-safe modules.
 * The chat SSE stream is not a contract (it is an EventSource).
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { ElectionsApiResponse } from '@/lib/elections/api-types';
import type { ElectionDayEntry } from '@/lib/elections/calendar-days';
import type { SeriesPoint } from '@/lib/elections/history';
import type { BallotMeasure } from '@/lib/elections/measures';
import type { NewsItem } from '@/lib/elections/news';
import type { OtherRace } from '@/lib/elections/downballot';
import type {
  RoomListItem,
  RoomView,
} from '@/lib/elections/rooms';
import type { FeaturedStream } from '@/lib/elections/streams';
import type { Baseline } from '@/lib/elections/swing';

/** The slice of a prediction market the elections page reads. */
export interface ElectionMarket {
  id: string;
  title: string;
  status:
    | 'OPEN'
    | 'RESOLVED_YES'
    | 'RESOLVED_NO'
    | string;
  yesPercent: number;
  volume: number;
  closesAt:
    | string
    | null;
  subjectUrl:
    | string
    | null;
}

export interface ElectionCalendar {
  year: number;
  days: ElectionDayEntry[];
  fec:
    | 'ok'
    | 'rate-limited'
    | 'unavailable';
}

type CycleQuery =
  {
    cycle?:
      | string
      | undefined;
  };

/** The live snapshot for a cycle (400 for an unknown cycle). */
export const getElectionsApi =
  endpoint<{
    query: {
      cycle?:
        | string
        | undefined;
      offices?:
        | string
        | undefined;
    };
    res: ElectionsApiResponse;
  }>()(
    {
      method:
        'GET',
      path: '/api/elections',
    },
  );

export const getElectionSwingApi =
  endpoint<{
    query: CycleQuery;
    res: {
      baseline: Record<
        string,
        Baseline
      >;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/swing',
    },
  );

export const getElectionMarketsApi =
  endpoint<{
    res: {
      markets: ElectionMarket[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/markets',
    },
  );

export const getElectionMeasuresApi =
  endpoint<{
    query: CycleQuery;
    res: {
      measures: BallotMeasure[];
      updatedAt: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/measures',
    },
  );

export const getElectionOfficesApi =
  endpoint<{
    query: CycleQuery;
    res: {
      races: OtherRace[];
      updatedAt: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/offices',
    },
  );

/** The AI desk paragraph; `summary` is null when AI is off or nothing has happened yet. */
export const getElectionSummaryApi =
  endpoint<{
    query: CycleQuery;
    res: {
      summary:
        | string
        | null;
      generatedAt:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/summary',
    },
  );

export const getElectionNewsApi =
  endpoint<{
    query: {
      state?:
        | string
        | undefined;
    };
    res: {
      items: NewsItem[];
      sources: {
        ok: number;
        total: number;
      };
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/news',
    },
  );

export const getElectionStreamsApi =
  endpoint<{
    res: {
      streams: FeaturedStream[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/streams',
    },
  );

export const getElectionCalendarApi =
  endpoint<{
    query: {
      year?:
        | number
        | undefined;
    };
    res: ElectionCalendar;
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/calendar',
    },
  );

export const getElectionHistoryApi =
  endpoint<{
    query: {
      cycle?:
        | string
        | undefined;
      race: string;
    };
    res: {
      race: string;
      points: SeriesPoint[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/history',
    },
  );

/** Ask the AI desk. 429 / 402 / 503 are the rate, budget and not-configured refusals. */
export const askElectionsApi =
  endpoint<{
    body: {
      question: string;
      cycle?:
        | string
        | undefined;
    };
    res: {
      answer: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/elections/ask',
    },
  );

export const listElectionRoomsApi =
  endpoint<{
    query: {
      cycle: string;
    };
    res: {
      rooms: RoomListItem[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/rooms',
    },
  );

/** Signed in; 10 active rooms per account. */
export const createElectionRoomApi =
  endpoint<{
    body: {
      name: string;
      visibility:
        | 'PUBLIC'
        | 'PRIVATE';
      cycle: string;
      config?: unknown;
    };
    res: {
      room: RoomView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/elections/rooms',
    },
  );

/** The code IS the capability. 404 when the room is gone. */
export const getElectionRoomApi =
  endpoint<{
    params: {
      code: string;
    };
    res: {
      room: RoomView;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/elections/rooms/$code',
    },
  );

/** Host edits name / visibility / shared screen. */
export const updateElectionRoomApi =
  endpoint<{
    params: {
      code: string;
    };
    body: {
      name?:
        | string
        | undefined;
      visibility?:
        | 'PUBLIC'
        | 'PRIVATE'
        | undefined;
      config?: unknown;
    };
    res: {
      room: RoomView;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/elections/rooms/$code',
    },
  );

/** Say something in the live room. 429 when sending too fast. */
export const postElectionChatApi =
  endpoint<{
    body: {
      text: string;
      cycle: string;
      room?:
        | string
        | undefined;
    };
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/elections/chat',
    },
  );

/** Host / admin removes a message. */
export const deleteElectionChatApi =
  endpoint<{
    query: {
      cycle: string;
      room?:
        | string
        | undefined;
      id: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/elections/chat',
    },
  );

export const reactElectionChatApi =
  endpoint<{
    body: {
      cycle: string;
      emoji: string;
      room?:
        | string
        | undefined;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/elections/chat/react',
    },
  );

/** Host (or a site admin) removes the room. */
export const deleteElectionRoomApi =
  endpoint<{
    params: {
      code: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/elections/rooms/$code',
    },
  );
