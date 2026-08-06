/**
 * Slice It — the ranked pool's moderation surface (`R10`).
 *
 * `promoteToRanked()` and `demote()` in `lib/slice-it/ranking.server.ts` are the
 * two human decisions in R10 and, until this route existed, they had no caller
 * at all. Qualification is automatic (the score route evaluates it on every
 * submission), so charts accumulated in `qualified` and stopped: nothing was
 * ever `ranked`, so every `Player.skillRating` stayed 0 and the global board
 * fell through to its `totalScore` tie-break. This is the missing half.
 *
 * ## Why the evidence ships with the list
 *
 * The `GET` returns each chart's full {@link QualificationReport} — clear rate,
 * play count, distinct players, lint errors, and every blocker by name — beside
 * the chart. A moderator who can see only "this chart is qualified" cannot
 * judge it: the automatic gate is a filter, not a verdict, and the decision
 * being asked for is whether these particular numbers describe a chart worth
 * putting into everyone's skill rating. `inspectCharts()` computes them
 * read-only, in four queries for the page, so loading this list never moves a
 * chart between states.
 *
 * ## Why the two actions are safe to expose directly
 *
 * `promoteToRanked` refuses anything that is not already `qualified`, so no
 * request through this route can rank a chart that has never been played, is
 * still a draft, or does not lint — the gate is a prerequisite, not an
 * alternative path. `demote` is its inverse and drops to `unranked` rather than
 * `qualified`, so a removed chart does not re-enter the pool on the next
 * submission. Both return `false` rather than throwing when the transition does
 * not apply, which is what the 409 below reports.
 *
 * ## Static segment beside `$id`
 *
 * `/api/slice-it/charts/ranking` sits next to `/api/slice-it/charts/$id`. The
 * router ranks a static segment above a dynamic one, and `Chart.id` is a UUID,
 * so the two can never contend for the same URL.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import {
  RANK_STATUSES,
  demote,
  inspectCharts,
  promoteToRanked,
  type QualificationReport,
} from '@/lib/slice-it/ranking.server';

const RankingQueryZ = z.object({
  /** Which pool state to list. Defaults to the one awaiting a decision. */
  status: z.enum(RANK_STATUSES).default('qualified'),
  /**
   * Capped at 50. The evidence for a page is four grouped queries over
   * `slice_run` regardless of page size, but the note lint is one O(n) pass per
   * chart over a note array that can be a few hundred kilobytes.
   */
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const RankingActionZ = z.object({
  chartId: z.string().uuid(),
  action: z.enum(['promote', 'demote']),
});

/** What the admin table renders, beside the qualification evidence. */
interface RankingRow {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  name: string;
  difficulty: string;
  /** Null for an account that never set a display name. */
  authorName: string | null;
  /** Null for an account with no handle — never build a URL from the name. */
  authorHandle: string | null;
  rating: number | null;
  ratingVersion: number | null;
  status: string;
  rankStatus: string;
  rankStatusAt: string | null;
  updatedAt: string;
  evidence: QualificationReport;
}

export const Route = createFileRoute('/api/slice-it/charts/ranking')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: RankingQueryZ },
        async ({ query }) => {
          const charts = await prisma.chart.findMany({
            where: { rankStatus: query.status },
            // Oldest decision first: a chart that has been waiting is the one a
            // moderator is keeping waiting.
            orderBy: [{ rankStatusAt: 'asc' }, { updatedAt: 'asc' }],
            take: query.limit,
            // No `notes` — `inspectCharts` reads those itself, and a page of 25
            // Expert charts is megabytes of note arrays to render 25 table rows.
            select: {
              id: true,
              songId: true,
              name: true,
              difficulty: true,
              rating: true,
              ratingVersion: true,
              status: true,
              rankStatus: true,
              rankStatusAt: true,
              updatedAt: true,
              author: { select: userChipSelect },
              song: { select: { title: true, artist: true } },
            },
          });

          const evidence = await inspectCharts(charts.map((chart) => chart.id));
          const byChart = new Map(evidence.map((report) => [report.chartId, report]));

          const rows: RankingRow[] = charts.map((chart) => ({
            id: chart.id,
            songId: chart.songId,
            songTitle: chart.song.title,
            songArtist: chart.song.artist,
            name: chart.name,
            difficulty: chart.difficulty,
            authorName: chart.author.name,
            authorHandle: chart.author.handle,
            rating: chart.rating,
            ratingVersion: chart.ratingVersion,
            status: chart.status,
            rankStatus: chart.rankStatus,
            rankStatusAt: chart.rankStatusAt?.toISOString() ?? null,
            updatedAt: chart.updatedAt.toISOString(),
            evidence: byChart.get(chart.id) ?? {
              chartId: chart.id,
              eligible: false,
              blockers: ['not-found'],
              players: 0,
              plays: 0,
              clearRate: null,
              lintErrors: 0,
              status: 'unranked',
            },
          }));

          const counts = await prisma.chart.groupBy({
            by: ['rankStatus'],
            _count: { _all: true },
          });

          return Response.json({
            charts: rows,
            counts: Object.fromEntries(
              RANK_STATUSES.map((status) => [
                status,
                counts.find((row) => row.rankStatus === status)?._count._all ?? 0,
              ]),
            ),
          });
        },
      ),

      POST: defineHandler(
        {
          auth: 'admin',
          body: RankingActionZ,
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'slice-rank-action', scope: 'user' },
        },
        async ({ userId, body }) => {
          const applied =
            body.action === 'promote'
              ? await promoteToRanked(body.chartId, userId)
              : await demote(body.chartId, userId);

          if (!applied) {
            // Not a 400: the request was well-formed and the caller was
            // entitled to make it. The chart is simply not in a state the
            // transition applies to — it was already demoted, or it never
            // qualified. 409 is the "your view of this resource is stale"
            // answer, and re-reading the list is the correct client response.
            return Response.json(
              {
                error:
                  body.action === 'promote'
                    ? 'Only a qualified chart can be promoted'
                    : 'That chart is already unranked',
              },
              { status: 409 },
            );
          }

          const [chart] = await inspectCharts([body.chartId]);
          const row = await prisma.chart.findUnique({
            where: { id: body.chartId },
            select: { id: true, rankStatus: true, rating: true, rankStatusAt: true },
          });

          return Response.json({
            ok: true,
            chartId: body.chartId,
            rankStatus: row?.rankStatus ?? 'unranked',
            rating: row?.rating ?? null,
            rankStatusAt: row?.rankStatusAt?.toISOString() ?? null,
            evidence: chart,
          });
        },
      ),
    },
  },
});
