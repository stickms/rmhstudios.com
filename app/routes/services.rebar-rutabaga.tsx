import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { jsonLdScript, restaurantSchema } from '@/lib/schema';
import { MENU_PRICE_SEK } from '@/lib/rebar-rutabaga/menu';
import { Masthead } from '@/components/rebar-rutabaga/Masthead';
import { Hero } from '@/components/rebar-rutabaga/Hero';
import { TastingMenu } from '@/components/rebar-rutabaga/TastingMenu';
import { RoomSchedule } from '@/components/rebar-rutabaga/RoomSchedule';
import { Reservations } from '@/components/rebar-rutabaga/Reservations';
import { Reveal, DrawnRule } from '@/components/rebar-rutabaga/Reveal';

/**
 * `/services/rebar-rutabaga` — the restaurant.
 *
 * A real route rather than a `?tab=` panel on the hub, which is the split
 * `/services` already draws: the three link-out verticals get summary panels
 * there and own their routes, while the two *showcases* (the car fleet, the
 * wardrobe) stay as tabs because they are a stage and a picker with no page
 * around them. This has a page around it — a menu, a materials schedule, prices
 * and house rules — so it takes a route, gets its own canonical and its own
 * `Restaurant` JSON-LD, and the hub links out to it like the other verticals.
 *
 * ## Why this route is top-level, not under `_site` (2026-09-15)
 *
 * It used to be `_site/services/rebar-rutabaga.tsx` on `PageLayout`, and for a
 * settings or wallet page that is the right answer — `PageLayout` plus the
 * radial shell is what makes the rest of the site feel like one product. A
 * restaurant inside a software company's site is not another page of that
 * product. It is a different establishment, and the site-consistency argument
 * that holds everywhere else is the wrong argument here. This is the licence
 * `docs/design-language.md` §12 grants a game with a bespoke visual identity,
 * spent on a room rather than a level.
 *
 * The first attempt kept the shell and restyled only the body. Looking at it in
 * the three themes settled the question: the plaster ran as a ~1000px strip
 * between the nav rail and the live rail, and the radial hub orb sat on top of
 * the lede. A design whose whole subject is light and negative space cannot be
 * served through a letterbox, so the route moved to the top level.
 *
 * **The file name is the whole trick.** `services.rebar-rutabaga.tsx` at the
 * root of `app/routes/` — dots are path separators — still serves
 * `/services/rebar-rutabaga`, so the canonical, the sitemap entry, the JSON-LD
 * `url` and the hub's link are all unchanged. Nothing outside this file had to
 * move, and no redirect was needed.
 *
 * What that costs, and what it does NOT cost:
 *
 * - **Cost:** no radial nav, no site sidebar, and the `_site` error/404
 *   components no longer wrap it (`__root`'s still do). `Masthead` is therefore
 *   not decoration — it is the only way back to `/services`, which is why it is
 *   sticky and why the back link is its first element.
 * - **Not a cost:** every site-wide invariant that is not a look survives —
 *   strings through `t()`, `head()` with `buildMeta`/`buildCanonical`, JSON-LD
 *   via `jsonLdScript`, tokens for every colour (the `--rebar-*` group, the
 *   sanctioned escape hatch for a domain-fixed palette), square corners via
 *   `rounded-none`, named transition properties, no `transition-all`, and the
 *   page still answers all three shipped themes.
 * - The liquid glass survives in exactly one place — the globe's panel — which
 *   is what makes it read as a material instead of a house style.
 *
 * The globe is still the reason the page exists in this shape. Spherification
 * is the kitchen's technique, so the menu is read off the site's own liquid
 * globe with one pearl per course, drawn at the diameter it is served at.
 */
export const Route = createFileRoute('/services/rebar-rutabaga')({
  head: () => ({
    meta: buildMeta({
      title: 'Rebar & Rutabaga | RMH Studios',
      description:
        'A molecular-gastronomy restaurant in a decommissioned Göteborg rebar foundry. Nine spherified courses, read off a glass globe. Two stars, one of them for the lighting.',
      path: '/services/rebar-rutabaga',
    }),
    links: [buildCanonical('/services/rebar-rutabaga')],
    scripts: [
      jsonLdScript(
        restaurantSchema({
          name: 'Rebar & Rutabaga',
          description:
            'A molecular-gastronomy tasting room in a 1963 rebar foundry: nine courses, all of them spherified, served on blackened steel under twenty-four bulbs at nine per cent.',
          path: '/services/rebar-rutabaga',
          street: 'Verkstadsgatan 4',
          locality: 'Göteborg',
          postalCode: '417 07',
          country: 'SE',
          telephone: '+46 31 18 14 63',
          currency: 'SEK',
          price: MENU_PRICE_SEK,
          cuisine: 'Nordic',
          // Two seatings a night, Wednesday to Saturday — the span the room is
          // occupied, not a window you may walk into.
          hours: ['We,Th,Fr,Sa 17:30-23:35'],
        }),
      ),
    ],
  }),
  component: RebarRutabagaPage,
});

function RebarRutabagaPage() {
  const { t } = useTranslation('c-rebar-rutabaga');

  return (
    // The room's own ground. Every section paints its own band on top of this,
    // so the page reads as plaster all the way out to the viewport edge rather
    // than as a document floating on the site's background.
    //
    // No `min-h-screen` here: the `_site` shell already guarantees the viewport,
    // and a column that claims it again leaves a second screen of dead scroll
    // under the footer (`lib/__tests__/responsive-layout-contract.test.ts`).
    // The hero carries the only viewport-sized box on the page, and it uses
    // `svh` so a phone's collapsing address bar does not crop it.
    <div className="bg-rebar-paper text-rebar-ink">
      <Masthead />
      <Hero />

      {/* ── The premise ───────────────────────────────────────────────────
          Asymmetric on purpose: the heading sits in a narrow left column and
          the body runs past it, which is how a Nordic editorial spread sets a
          standfirst. A centred block here would have made the page symmetrical
          for the first time and it would have looked like a brochure. */}
      <section
        aria-labelledby="rr-premise"
        className="border-t border-rebar-line bg-rebar-paper"
      >
        <div className="mx-auto max-w-[86rem] px-6 py-24 sm:px-10 sm:py-32">
          <DrawnRule />
          <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
            <Reveal>
              <h2
                id="rr-premise"
                className="font-display text-[clamp(2rem,4.4vw,3.25rem)] font-light leading-[1.02] tracking-[-0.035em] text-rebar-ink"
              >
                {t('premise.title', {
                  defaultValue: 'The hall bent steel for thirty-five years. Now it bends liquids.',
                })}
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-[46ch] text-lg leading-[1.75] text-rebar-ink-soft">
                {t('premise.body', {
                  defaultValue:
                    'When we took the foundry over, everyone told us to warm it up — something on the walls, carpet, a smaller light. We took the walls back to lime plaster instead, kept the board-formed concrete with the patches where the rebar cages sat, and hung twenty-four bulbs at nine per cent. Then we built a menu that could survive in here. Every course is set into a sphere: bound with alginate, dropped into a calcium bath, and held until it is bitten. It is the same trade as the one this building was built for — something liquid, given a shape it keeps until it is put under load.',
                })}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <TastingMenu />
      <RoomSchedule />

      {/* Floor demarcation — the one place the restaurant's mark is allowed to
          be a stripe rather than a detail, and the page's second and last use
          of the sulphur. It separates the room from the booking, which is where
          a foundry floor would have had one too. */}
      <div
        aria-hidden
        className="h-2 w-full"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, var(--rebar-sulphur) 0 10px, transparent 10px 20px)',
        }}
      />

      <Reservations />

      <footer className="border-t border-rebar-line bg-rebar-paper">
        <div className="mx-auto flex max-w-[86rem] flex-col gap-3 px-6 py-14 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-rebar-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <p>
            {t('footer.address', {
              defaultValue: 'Verkstadsgatan 4, 417 07 Göteborg, Sverige · +46 31 18 14 63',
            })}
          </p>
          <p>
            {t('footer.colophon', {
              defaultValue: 'A kitchen by RMH Studios. Closed July and the week of midsummer.',
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}
