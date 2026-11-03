import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseDay, phaseOf } from '@/lib/elections/calendar';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { buildFacts, headline } from '@/lib/elections/summary';
import { compactKeys, decodeAnyPicks, project } from '@/lib/elections/predict';
import { renderElectionsCard } from '@/lib/og/elections-card.server';
import { cardStats, type CardStat } from '@/lib/elections/card-stats';
import { OFFICE_NAME } from '@/lib/elections/types';

const query = z.object({
  cycle: z.string().max(10).optional(),
  /** A shared map (`~…` compact or the long form). Only ever read as picks — never drawn. */
  p: z.string().max(400).optional(),
  /** Cache-buster the page puts on the URL so crawlers re-fetch as the night moves. */
  v: z.string().max(12).optional(),
});

/**
 * GET /api/og/elections — the share card for the election hub.
 *
 * Without `p`: the live board (seats, races called). With `p`: "My 2026 map" with the control
 * the visitor's picks imply. Like every card route here, nothing free-text from the URL ever
 * becomes text on the card: the picks are decoded to calls and the card shows NUMBERS we
 * compute, so this cannot be used to put words on rmhstudios.com's own image host.
 *
 * A render failure redirects to the site-wide card — a generic unfurl beats a broken one.
 */
export const Route = createFileRoute('/api/og/elections')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', query }, async ({ query: q }) => {
        try {
          const now = new Date();
          const cycle = (q.cycle ? parseDay(q.cycle) : null) ?? currentCycle(now);
          const snap = await getElectionSnapshot(cycle, now);
          const facts = buildFacts(snap);
          const phase = phaseOf(cycle.date, now);

          const picks = q.p ? decodeAnyPicks(q.p, compactKeys(snap.races)) : {};
          const isMap = Boolean(q.p) && Object.keys(picks).length > 0;
          let line1 = `Vote ${cycle.year}`;
          let line2 = cycle.kind === 'midterm' ? 'Midterms' : cycle.kind === 'presidential' ? 'President' : 'Results';
          let sub: string;
          let sticker: string;
          let stats: CardStat[];

          if (isMap) {
            // A shared map: only the sharer's CALLS (decoded to D/R/toss-up) become numbers; nothing
            // from the URL is ever drawn as text.
            line1 = `My ${cycle.year}`;
            line2 = 'Map';
            sub = 'Paint yours and get graded as the races are called.';
            sticker = 'My call';
            stats = [];
            for (const office of ['senate', 'governor', 'president'] as const) {
              const rs = snap.races.filter((r) => r.office === office);
              if (!rs.length) continue;
              const pr = project(picks, rs, snap.chambers[office]);
              stats.push({ value: `${pr.DEM}–${pr.GOP}`, label: `${OFFICE_NAME[office]} D–R`, tone: 'result', dem: pr.DEM, gop: pr.GOP });
              if (pr.open) stats.push({ value: String(pr.open), label: `${office} open`, tone: 'ink' });
            }
          } else {
            sub = snap.races.length > 0 ? headline(snap).slice(0, 120) : 'Live results, race calls and your own map — the moment polls report.';
            sticker = phase === 'archive' ? 'Final' : snap.live ? 'Live' : phase === 'election-day' ? 'Today' : 'Soon';
            stats = cardStats(snap);
          }

          const png = await renderElectionsCard({
            cacheKey: `${isMap ? 'map' : 'board'}:${cycle.date}:${sticker}:${line1}:${line2}:${stats.map((s) => `${s.value}${s.label}`).join(',')}`,
            date: cycle.date,
            line1,
            line2,
            sub,
            stats: stats.slice(0, 4),
            sticker,
            ttlMs: facts.racesCalled || phase === 'election-day' ? 60_000 : 30 * 60_000,
          });
          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              // Short: the board moves on election night. The page's `v` bucket busts crawler caches.
              'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
            },
          });
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/images/og/default.png', 'Cache-Control': 'public, max-age=60' },
          });
        }
      }),
    },
  },
});
