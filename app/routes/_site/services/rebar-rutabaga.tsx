import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { jsonLdScript, restaurantSchema } from '@/lib/schema';
import { MENU_PRICE_SEK } from '@/lib/rebar-rutabaga/menu';
import { TastingMenu } from '@/components/rebar-rutabaga/TastingMenu';
import { RoomSchedule } from '@/components/rebar-rutabaga/RoomSchedule';
import { Reservations } from '@/components/rebar-rutabaga/Reservations';

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
 * The globe is the reason the page exists in this shape. Spherification is the
 * kitchen's technique, so the menu is read off the site's own liquid globe with
 * one pearl per course, drawn at the diameter it is served at — see
 * `components/rebar-rutabaga/MenuGlobe.tsx`.
 */
export const Route = createFileRoute('/_site/services/rebar-rutabaga')({
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
    <PageLayout
      title={t('page.title', { defaultValue: 'Rebar & Rutabaga' })}
      description={t('page.lede', {
        defaultValue:
          'A molecular-gastronomy kitchen in a decommissioned rebar foundry. Nine courses, every one of them a sphere. One root vegetable that has been through considerably more than you have.',
      })}
      backTo="/services"
      backLabel={t('page.back', { defaultValue: 'Services' })}
      wide
    >
      <div className="flex flex-col gap-12 px-4 pb-12">
        <section aria-labelledby="rr-premise">
          <h2
            id="rr-premise"
            className="font-display text-xl font-semibold tracking-[-0.02em] text-site-text sm:text-2xl"
          >
            {t('premise.title', {
              defaultValue: 'The hall bent steel for thirty-five years. Now it bends liquids.',
            })}
          </h2>
          <p className="mt-3 max-w-prose text-site-text-muted">
            {t('premise.body', {
              defaultValue:
                'When we took the foundry over, everyone told us to warm it up — something on the walls, carpet, a smaller light. We took the walls back to lime plaster instead, kept the board-formed concrete with the patches where the rebar cages sat, and hung twenty-four bulbs at nine per cent. Then we built a menu that could survive in here. Every course is set into a sphere: bound with alginate, dropped into a calcium bath, and held until it is bitten. It is the same trade as the one this building was built for — something liquid, given a shape it keeps until it is put under load.',
            })}
          </p>
        </section>

        <section aria-labelledby="rr-menu">
          <h2
            id="rr-menu"
            className="mb-6 font-display text-xl font-semibold tracking-[-0.02em] text-site-text sm:text-2xl"
          >
            {t('menu.title', { defaultValue: 'Turn the globe.' })}
          </h2>
          <TastingMenu />
        </section>

        <section aria-labelledby="rr-room">
          <h2
            id="rr-room"
            className="mb-6 font-display text-xl font-semibold tracking-[-0.02em] text-site-text sm:text-2xl"
          >
            {t('room.title', { defaultValue: 'The room, scheduled.' })}
          </h2>
          <RoomSchedule />
        </section>

        {/* Floor demarcation — the one place the restaurant's mark is allowed to
            be a stripe rather than a detail. It separates the room from the
            booking, which is where a foundry floor would have had one too. */}
        <div
          aria-hidden
          className="h-2.5 w-full"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, var(--rebar-sulphur) 0 10px, transparent 10px 20px)',
          }}
        />

        <section aria-labelledby="rr-book">
          <h2
            id="rr-book"
            className="mb-6 font-display text-xl font-semibold tracking-[-0.02em] text-site-text sm:text-2xl"
          >
            {t('book.title', { defaultValue: 'Reservations.' })}
          </h2>
          <Reservations />
        </section>

        <footer className="border-t border-site-border pt-6 text-sm text-site-text-muted">
          <p>
            {t('footer.address', {
              defaultValue: 'Verkstadsgatan 4, 417 07 Göteborg, Sverige · +46 31 18 14 63',
            })}
          </p>
          <p className="mt-1">
            {t('footer.colophon', {
              defaultValue: 'A kitchen by RMH Studios. Closed July and the week of midsummer.',
            })}
          </p>
        </footer>
      </div>
    </PageLayout>
  );
}
