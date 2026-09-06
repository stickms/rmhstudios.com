'use client';

/**
 * **The RMH family of cars** — the fleet behind RMH Rideshare, drawn rather than
 * listed.
 *
 * The page's argument is in its shape: one stage at the top holding one vehicle
 * you can turn and poke, a picker that swaps what is on it, and — at the bottom
 * — the whole family side by side at ONE scale, which is the only view that
 * makes "a bike and a helicopter are both on this list" mean anything.
 *
 * Everything you see is generated from `lib/rideshare/cars.ts`. There is no
 * model file, no texture and no image: the 3D body, the picker's thumbnail and
 * the line-up's outline are three renderings of the same cross-sections, so a
 * change to a roofline moves all three and none of them can go stale against the
 * others.
 *
 * ## Why the copy is spelled out here rather than kept beside the geometry
 *
 * `i18next-parser` reads `defaultValue` **literally**. A `t(key, { defaultValue:
 * spec.blurb })` extracts as an empty default, lands in `locales/en/` as `""`,
 * and i18next then serves that empty string to every locale — English included.
 * So the fleet's prose is written out below as literal defaults, one key per
 * string, and the spec files stay pure geometry. It is more lines than a loop
 * over a data table and it is the only version that is actually translated.
 */

import { Suspense, lazy, useState } from 'react';
import { ArrowRight, Car, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { RIDE_CLASSES, type RideClassId, type RideClassInfo } from '@/lib/rideshare/classes';
import { getCarBody, type CarBodySpec } from '@/lib/rideshare/cars';
import { RIDE_CLASS_ICONS } from '@/components/rideshare/RideClassPicker';
import { CarSilhouette } from './CarSilhouette';
import './cars.css';

/**
 * The stage pulls in three.js — around a megabyte of vendor JS — so it is split
 * out and only fetched once somebody has opened this tab. Until it lands, the
 * same body is on screen as a silhouette, in the same box, so nothing moves when
 * it arrives.
 */
const LiquidCarStage = lazy(() =>
  import('./LiquidCarStage').then((m) => ({ default: m.LiquidCarStage })),
);

/** Only ride classes with a body appear — the fleet is what is being shown. */
const FLEET: { info: RideClassInfo; body: CarBodySpec }[] = RIDE_CLASSES.flatMap((info) => {
  const body = getCarBody(info.id);
  return body ? [{ info, body }] : [];
});

interface FleetCopy {
  /** Three or four words under the name. */
  tagline: string;
  /** A sentence on what it is. */
  blurb: string;
  /** What drives it. */
  drivetrain: string;
}

function useFleetCopy(): Record<RideClassId, FleetCopy> {
  const { t } = useTranslation('c-rideshare');
  return {
    RMH_X: {
      tagline: t('cars-x-tagline', { defaultValue: 'The everyday one' }),
      blurb: t('cars-x-blurb', {
        defaultValue:
          'A five-door hatchback for up to four people — and the shape the rest of the family is drawn from.',
      }),
      drivetrain: t('cars-x-drivetrain', { defaultValue: 'Petrol or hybrid · front-wheel drive' }),
    },
    RMH_BIKE: {
      tagline: t('cars-bike-tagline', { defaultValue: 'Beat the traffic' }),
      blurb: t('cars-bike-blurb', {
        defaultValue:
          'A single-rider e-bike: a frame, a saddle and two wheels, for a quick solo hop across town.',
      }),
      drivetrain: t('cars-bike-drivetrain', { defaultValue: 'Pedal-assist electric' }),
    },
    RMH_XL: {
      tagline: t('cars-xl-tagline', { defaultValue: 'Room for the crew' }),
      blurb: t('cars-xl-blurb', {
        defaultValue:
          'A three-row people carrier with a squared-off tail — the tallest, widest body on the road fleet.',
      }),
      drivetrain: t('cars-xl-drivetrain', { defaultValue: 'Hybrid · all-wheel drive' }),
    },
    RMH_COMFORT: {
      tagline: t('cars-comfort-tagline', { defaultValue: 'Extra legroom' }),
      blurb: t('cars-comfort-blurb', {
        defaultValue:
          'A long-wheelbase saloon: low nose, a cabin set well back, and a real boot behind it.',
      }),
      drivetrain: t('cars-comfort-drivetrain', { defaultValue: 'Hybrid · rear-wheel drive' }),
    },
    RMH_GREEN: {
      tagline: t('cars-green-tagline', { defaultValue: 'Ride electric' }),
      blurb: t('cars-green-blurb', {
        defaultValue:
          'A one-box electric. With no engine bay to leave room for, the cabin starts at the nose.',
      }),
      drivetrain: t('cars-green-drivetrain', { defaultValue: 'Battery electric' }),
    },
    RMH_BLACK: {
      tagline: t('cars-black-tagline', { defaultValue: 'Premium luxury' }),
      blurb: t('cars-black-blurb', {
        defaultValue:
          'An executive saloon with the longest bonnet in the fleet and the lowest roofline over it.',
      }),
      drivetrain: t('cars-black-drivetrain', { defaultValue: 'Electric · all-wheel drive' }),
    },
    RMH_HELI: {
      tagline: t('cars-heli-tagline', { defaultValue: 'Skip the ground' }),
      blurb: t('cars-heli-blurb', {
        defaultValue:
          'A four-seat light helicopter — a glass pod, a tail boom, and the only member of the family that never touches the road.',
      }),
      drivetrain: t('cars-heli-drivetrain', { defaultValue: 'Turbine · five-blade main rotor' }),
    },
  };
}

export function CarFamily() {
  const { t } = useTranslation('c-rideshare');
  const copy = useFleetCopy();
  const [selected, setSelected] = useState<RideClassId>(FLEET[0].info.id);
  const active = FLEET.find((v) => v.info.id === selected) ?? FLEET[0];
  const ActiveIcon: LucideIcon = RIDE_CLASS_ICONS[active.info.icon] ?? Car;
  const fleetLabel = t('cars-fleet-heading', { defaultValue: 'The fleet' });

  const description = t('cars-stage-description', {
    defaultValue: '{{name}}, drawn as a glass wireframe on a turntable. {{blurb}}',
    name: active.info.name,
    blurb: copy[active.info.id].blurb,
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
          {t('cars-title', { defaultValue: 'The RMH family of cars' })}
        </h2>
        <p className="max-w-prose text-site-text-muted">
          {t('cars-lede', {
            defaultValue:
              'Every vehicle RMH Rideshare dispatches, built from one shape. Each body is a glass shell with a wireframe stretched over it — the same material the site’s navigation globe is made of, told what to be. Turn one, poke it, and watch the wave cross it.',
          })}
        </p>
      </header>

      <section aria-label={t('cars-stage-label', { defaultValue: 'Vehicle viewer' })}>
        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              <div className="rmhcar-stage glass-pane glass-bevel-sm rounded-site">
                <CarSilhouette
                  spec={active.body}
                  frame="body"
                  title={description}
                  className="size-full p-6 text-site-text"
                />
              </div>
              <p className="px-1 text-xs text-site-text-dim">
                {t('cars-loading', { defaultValue: 'Preparing the turntable…' })}
              </p>
            </div>
          }
        >
          <LiquidCarStage spec={active.body} name={active.info.name} description={description} />
        </Suspense>
      </section>

      {/* The picker. Buttons, not a second tab strip: the stage is not one panel
          per option, it is one stage whose contents change — and a tab strip
          inside a tab panel reads as a page inside a page. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-site-text-dim">
          {fleetLabel}
        </h3>
        <div
          role="group"
          aria-label={fleetLabel}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {FLEET.map(({ info, body }) => {
            const on = info.id === selected;
            return (
              <button
                key={info.id}
                type="button"
                onClick={() => setSelected(info.id)}
                aria-pressed={on}
                data-fluid-press=""
                // Selection is marked twice on purpose. The accent tint is the
                // obvious cue and the only one a screenshot shows, but colour
                // alone is not a cue under the colour-vision modes (§13) — so
                // the chosen card also carries a visibly heavier outline, which
                // is a change in WEIGHT rather than in hue. `aria-pressed`
                // carries the same fact to assistive tech.
                className={`glass-fill flex flex-col gap-1 rounded-site p-3 text-left transition-colors ${
                  on
                    ? 'text-site-accent ring-2 ring-site-accent'
                    : 'text-site-text-muted hover:text-site-text'
                }`}
              >
                <CarSilhouette spec={body} frame="body" className="h-12 w-full" />
                <span
                  className={`text-sm font-semibold ${on ? 'text-site-accent' : 'text-site-text'}`}
                >
                  {info.name}
                </span>
                <span className="text-xs">{copy[info.id].tagline}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* What is on the stage. */}
      <section className="glass-pane rounded-site p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="glass-fill glass-bevel-sm flex size-12 shrink-0 items-center justify-center rounded-site text-site-accent">
            <ActiveIcon className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-site-text">
              {active.info.name}
            </h3>
            <p className="text-sm text-site-accent">{copy[active.info.id].tagline}</p>
            <p className="mt-2 max-w-prose text-site-text-muted">{copy[active.info.id].blurb}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Spec
            term={t('cars-spec-seats', { defaultValue: 'Seats' })}
            value={String(active.info.seats)}
            icon={Users}
          />
          <Spec
            term={t('cars-spec-length', { defaultValue: 'Length' })}
            value={t('cars-spec-length-value', {
              defaultValue: '{{metres}} m',
              metres: active.body.length.toFixed(1),
            })}
          />
          <Spec
            term={t('cars-spec-pickup', { defaultValue: 'Typical pickup' })}
            value={t('cars-spec-pickup-value', {
              defaultValue: '{{from}}–{{to}} min',
              from: active.info.etaMinutes[0],
              to: active.info.etaMinutes[1],
            })}
          />
          <Spec
            term={t('cars-spec-fare', { defaultValue: 'Fare index' })}
            value={t('cars-spec-fare-value', {
              defaultValue: '×{{index}}',
              index: fareIndex(active.info.fareMultiplier),
            })}
          />
        </dl>

        <p className="mt-4 text-sm text-site-text-muted">{copy[active.info.id].drivetrain}</p>

        <div className="mt-5">
          <Button asChild variant="accent">
            <Link to="/rideshare">
              {t('cars-cta', { defaultValue: 'Request a ride' })}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      {/* The line-up. One viewBox for all seven, which is the whole point of it. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-site-text-dim">
          {t('cars-lineup-heading', { defaultValue: 'The family, to scale' })}
        </h3>
        <div className="glass-fill rounded-site p-4">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
            {FLEET.map(({ info, body }) => (
              <li key={info.id} className="flex flex-col items-center gap-1">
                <CarSilhouette
                  spec={body}
                  frame="fleet"
                  className={`h-14 w-full ${
                    info.id === selected ? 'text-site-accent' : 'text-site-text-muted'
                  }`}
                />
                <span className="text-center text-[11px] text-site-text-dim">{info.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-prose text-xs text-site-text-dim">
          {t('cars-lineup-note', {
            defaultValue:
              'Drawn at one scale, in metres, from the same measurements the 3D bodies are lofted from.',
          })}
        </p>
      </section>
    </div>
  );
}

/** `1` rather than `1.00`, `1.6` rather than `1.60` — a multiplier, not money. */
function fareIndex(multiplier: number): string {
  return String(Math.round(multiplier * 100) / 100);
}

function Spec({ term, value, icon: Icon }: { term: string; value: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-[0.06em] text-site-text-dim">{term}</dt>
      <dd className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
        {Icon && <Icon className="size-3.5 text-site-text-muted" aria-hidden />}
        {value}
      </dd>
    </div>
  );
}
