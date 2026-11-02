import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { currentCycle, parseCycle, phaseOf } from '@/lib/elections/calendar';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { buildFacts, headline } from '@/lib/elections/summary';
import { compactKeys, decodeAnyPicks, project } from '@/lib/elections/predict';
import { renderPageCard } from '@/lib/og/page-card.server';

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
          const cycle = (q.cycle ? parseCycle(q.cycle) : null) ?? currentCycle(now);
          const snap = await getElectionSnapshot(cycle, now);
          const facts = buildFacts(snap);
          const phase = phaseOf(cycle.date, now);

          let title = cycle.title;
          let subtitle: string;
          const stats: { value: string; label: string; lead?: boolean }[] = [];
          let key: string;

          const picks = q.p ? decodeAnyPicks(q.p, compactKeys(snap.races)) : {};
          if (q.p && Object.keys(picks).length) {
            title = `My ${cycle.year} map`;
            subtitle = 'Paint yours and get graded as the races are called.';
            for (const office of ['senate', 'governor', 'president'] as const) {
              const rs = snap.races.filter((r) => r.office === office);
              if (!rs.length) continue;
              const pr = project(picks, rs, snap.chambers[office]);
              const label = office === 'senate' ? 'Senate D–R' : office === 'governor' ? 'Governors D–R' : 'President D–R';
              stats.push({ value: `${pr.DEM}–${pr.GOP}`, label, lead: stats.length === 0 });
              if (pr.open) stats.push({ value: String(pr.open), label: `${office} open` });
            }
            key = `map:${cycle.date}:${stats.map((s) => s.value).join(',')}`;
          } else {
            subtitle =
              snap.races.length > 0
                ? headline(snap).slice(0, 140)
                : 'Live results, race calls and your own map — the moment polls report.';
            for (const c of facts.chambers) {
              if (c.office === 'governor' && c.derived && !facts.racesCalled) continue;
              stats.push({
                value: facts.racesCalled || !c.derived ? `${c.seats.DEM}–${c.seats.GOP}` : String(c.seatsUp),
                label: `${c.name} D–R`,
                lead: stats.length === 0,
              });
            }
            if (facts.racesCalled) stats.push({ value: `${facts.racesCalled}/${facts.racesTotal}`, label: 'called' });
            key = `board:${cycle.date}:${phase}:${stats.map((s) => `${s.value}${s.label}`).join(',')}`;
          }

          const png = await renderPageCard({
            cacheKey: key,
            eyebrow: 'Elections',
            title,
            subtitle,
            stats: stats.slice(0, 4),
            path: '/elections',
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
