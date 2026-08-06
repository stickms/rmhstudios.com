/**
 * Slice It chart editor — the browser's half of the chart API.
 *
 * Kept out of the components so the fetch shapes and the zod schemas that bound
 * them sit next to each other (`api-schemas.ts`), and so a component never has to
 * know that "open the editor" is two round trips.
 */

import { DIFFICULTIES } from '@/lib/slice-it/constants';
import type { SliceSong } from '@/lib/slice-it/types';
import type { ChartDto, ChartRevisionDto } from './api-schemas';
import { emptyChart } from './store';
import type { EditorLoadPayload } from './store';
import {
  toEditorNotes,
  type Charts,
  type Difficulty,
  type Slice,
  type SvPoint,
  type TimingPoint,
} from './types';
import { sortNotes } from './commands';

export class ChartApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ChartApiError';
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ChartApiError(body?.error ?? `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

/**
 * Open a song in the editor.
 *
 * Two calls, not one: the song read is the endpoint that already exists and
 * already mints everything the player needs, and the seed is a write. Folding
 * them together would make opening the editor a POST, which breaks reload and
 * prefetch for a surface that is otherwise a page.
 */
export async function loadEditorDocument(songId: string): Promise<EditorLoadPayload> {
  const song = await json<SliceSong>(
    await fetch(`/api/slice-it/songs/${encodeURIComponent(songId)}`, {
      headers: { accept: 'application/json' },
    }),
  );

  const seeded = await json<{ charts: ChartDto[] }>(
    await fetch('/api/slice-it/charts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ songId, keys: 2 }),
    }),
  );

  return toLoadPayload(song, seeded.charts);
}

export function toLoadPayload(song: SliceSong, dtos: readonly ChartDto[]): EditorLoadPayload {
  const keys = dtos[0]?.keys ?? 2;
  const charts = {} as Charts;
  const chartIds = {} as Record<Difficulty, string | null>;
  const chartStatus = {} as Record<Difficulty, string>;

  for (const difficulty of DIFFICULTIES) {
    const dto = dtos.find((chart) => chart.difficulty === difficulty);
    chartIds[difficulty] = dto?.id ?? null;
    // 'draft' for a difficulty with no row yet: nothing exists, so nothing is
    // published, and the publish button must not offer to un-publish it.
    chartStatus[difficulty] = dto?.status ?? 'draft';
    if (!dto) {
      charts[difficulty] = emptyChart(difficulty, keys);
      continue;
    }
    charts[difficulty] = {
      difficulty,
      keys: dto.keys,
      name: dto.name,
      // `auto` is re-derived from the row's `isGenerated` flag rather than stored
      // per note: §7.3 is a session affordance ("what have I reviewed"), and a
      // chart nobody has touched is entirely the machine's.
      notes: sortNotes(toEditorNotes((dto.notes ?? []) as Slice[], dto.isGenerated)),
      dirty: false,
      rating: dto.rating,
    };
  }

  const first = dtos[0];
  return {
    song: {
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      bpm: song.bpm || 120,
      audioUrl: song.audioUrl,
    },
    keys,
    charts,
    chartIds,
    chartStatus,
    timingPoints: first?.timingPoints ?? [],
    svPoints: first?.svPoints ?? [],
  };
}

/**
 * Publish or un-publish one difficulty (§9, §16 phase 7).
 *
 * The server lints again before it accepts a publish and answers 422 with the
 * blocking issues. That is not redundancy with the editor's own panel: the
 * panel is what the author sees, this endpoint is what is true, and the panel
 * runs on a debounce that a fast click can outrun.
 */
export async function publishChart(chartId: string, status: 'public' | 'draft'): Promise<ChartDto> {
  return json<ChartDto>(
    await fetch(`/api/slice-it/charts/${encodeURIComponent(chartId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  );
}

export interface SaveChartInput {
  chartId: string;
  notes: Slice[];
  /**
   * The timing map and SV markers (§4.2, phase 8).
   *
   * Sent on every write rather than only when they changed: they live on each
   * `Chart` row, the route replaces them wholesale, and omitting them on a note
   * save would be indistinguishable from clearing them.
   */
  timingPoints?: TimingPoint[];
  svPoints?: SvPoint[];
  kind?: 'autosave' | 'manual' | 'publish';
  /**
   * `keepalive` on the unload path. A normal fetch is cancelled when the
   * document goes away; this one survives it, which is what makes the
   * visibilitychange save in `ChartEditor` worth making at all.
   */
  keepalive?: boolean;
  signal?: AbortSignal;
}

export async function saveChart(input: SaveChartInput): Promise<ChartDto> {
  return json<ChartDto>(
    await fetch(`/api/slice-it/charts/${encodeURIComponent(input.chartId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        notes: input.notes,
        kind: input.kind ?? 'autosave',
        ...(input.timingPoints ? { timingPoints: input.timingPoints } : {}),
        ...(input.svPoints ? { svPoints: input.svPoints } : {}),
      }),
      keepalive: input.keepalive,
      signal: input.signal,
    }),
  );
}

export async function listRevisions(chartId: string): Promise<ChartRevisionDto[]> {
  const body = await json<{ revisions: ChartRevisionDto[] }>(
    await fetch(`/api/slice-it/charts/${encodeURIComponent(chartId)}/revisions`),
  );
  return body.revisions;
}
