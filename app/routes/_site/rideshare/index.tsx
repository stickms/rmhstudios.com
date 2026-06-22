/**
 * RMH Rideshare — landing (/rideshare)
 *
 * Marketing hub linking the rider request flow and the driver application,
 * plus the ride-class catalogue. Rides are currently free.
 */
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Car,
  MapPin,
  ShieldCheck,
  Users,
  Sparkles,
  Leaf,
  Crown,
  CircleDollarSign,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { FareBreakdown } from '@/components/rideshare/FareBreakdown';
import { RIDE_CLASSES, type RideClassId } from '@/lib/rideshare/classes';

export const Route = createFileRoute('/_site/rideshare/')({
  head: () => ({
    meta: [
      { title: 'RMH Rideshare — Free rides across the community' },
      {
        name: 'description',
        content:
          'Request a free ride or sign up to drive with RMH Rideshare. Map your trip with OpenStreetMap and choose from RMH-X, RMH-XL, RMH-Comfort and more.',
      },
    ],
  }),
  component: RideshareLanding,
});

const CLASS_ICONS: Record<string, LucideIcon> = { Car, Users, Sparkles, Leaf, Crown };

const RIDER_STEPS = [
  { icon: MapPin, title: 'Map your trip', text: 'Set pickup and drop-off with OpenStreetMap search.' },
  { icon: Car, title: 'Pick a ride', text: 'Choose RMH-X, XL, Comfort, Green or Black.' },
  { icon: ShieldCheck, title: 'Get matched', text: 'A vetted RMH driver claims your request.' },
  { icon: CircleDollarSign, title: 'Ride free', text: 'No fares while RMH Rideshare is in preview.' },
];

export function RideshareLanding() {
  return (
    <PageLayout title="RMH Rideshare" wide>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-site-border bg-gradient-to-b from-site-surface to-site-bg p-8 md:p-12"
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: 'var(--site-accent)' }}
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent">
              <Sparkles className="h-3.5 w-3.5" /> Free during preview
            </span>
            <h1
              className="mt-4 text-4xl font-bold tracking-tight text-site-text md:text-5xl"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              Getting around, on the house.
            </h1>
            <p className="mt-3 max-w-xl text-lg text-site-text-muted">
              RMH Rideshare connects riders with community drivers. Map your trip with
              OpenStreetMap, pick the ride that fits, and go — no fares for now.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/rideshare/ride"
                className="inline-flex items-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105 hover:bg-(--site-accent-hover)"
              >
                <MapPin className="h-4 w-4" /> Request a ride
              </Link>
              <Link
                to="/rideshare/drive"
                className="inline-flex items-center gap-2 rounded-xl border border-site-border bg-site-surface px-6 py-3 text-sm font-semibold text-site-text transition-all hover:scale-105 hover:border-site-border-bright"
              >
                <Car className="h-4 w-4" /> Become a driver
              </Link>
            </div>
          </div>
        </motion.section>

        {/* Ride classes */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
            Choose your ride
          </h2>
          <p className="mt-1 text-site-text-muted">A ride for every trip — from everyday to extra-special.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RIDE_CLASSES.map((cls, i) => {
              const Icon = CLASS_ICONS[cls.icon] ?? Car;
              return (
                <motion.article
                  key={cls.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="group flex flex-col rounded-2xl border border-site-border bg-site-surface/40 p-5 transition-all hover:border-site-accent/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-site-accent/15 text-site-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="flex items-center gap-1 text-xs text-site-text-muted">
                      <Users className="h-3.5 w-3.5" /> up to {cls.seats}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-site-text">{cls.name}</h3>
                  <p className="text-xs font-medium text-site-accent">{cls.tagline}</p>
                  <p className="mt-2 flex-1 text-sm text-site-text-muted">{cls.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-site-text-dim">
                    <Clock className="h-3.5 w-3.5" /> {cls.etaMinutes[0]}–{cls.etaMinutes[1]} min away
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* Price visualizer */}
        <PriceEstimator />

        {/* How it works (riders) */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
            How it works
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RIDER_STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-site-surface-hover text-site-accent">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-xs font-semibold text-site-text-dim">Step {i + 1}</div>
                <h3 className="font-semibold text-site-text">{step.title}</h3>
                <p className="mt-1 text-sm text-site-text-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Driver CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 overflow-hidden rounded-3xl border border-site-border bg-site-surface/40 p-8 md:flex md:items-center md:justify-between md:gap-8"
        >
          <div className="max-w-lg">
            <div className="flex items-center gap-2 text-site-accent">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wide">Drive with RMH</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
              Earn your wings as an RMH driver
            </h2>
            <p className="mt-2 text-site-text-muted">
              Tell us about your vehicle and upload your license for a quick review. We delete
              your license the moment it’s approved — your documents are never kept on file.
            </p>
          </div>
          <Link
            to="/rideshare/drive"
            className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-xl bg-site-accent px-6 py-3 text-sm font-semibold text-(--site-accent-fg) transition-all hover:scale-105 hover:bg-(--site-accent-hover) md:mt-0"
          >
            Start your application <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.section>
      </div>
    </PageLayout>
  );
}

/**
 * Interactive fare visualizer. Lets visitors see what a trip would normally
 * cost across classes — and that every one of them is free right now.
 */
function PriceEstimator() {
  const [km, setKm] = useState(8);
  const [classId, setClassId] = useState<RideClassId>('RMH_X');

  const distanceMeters = km * 1000;
  // Assume ~30 km/h average city speed for the time component.
  const durationSeconds = Math.round((km / 30) * 3600);

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-site-text" style={{ fontFamily: 'var(--site-font-display)' }}>
        See what you’re saving
      </h2>
      <p className="mt-1 text-site-text-muted">
        Drag to estimate any trip. Every fare is fully waived during the preview.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-site-border bg-site-surface/40 p-5">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="estimator-distance" className="text-sm font-medium text-site-text">
              Trip distance
            </label>
            <span className="text-sm font-bold text-site-accent">{km} km</span>
          </div>
          <input
            id="estimator-distance"
            type="range"
            min={1}
            max={60}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            className="w-full accent-(--site-accent)"
          />
          <div className="mt-1 flex justify-between text-[11px] text-site-text-dim">
            <span>1 km</span>
            <span>60 km</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RIDE_CLASSES.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => setClassId(cls.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  classId === cls.id
                    ? 'border-site-accent bg-site-accent/10 text-site-accent'
                    : 'border-site-border bg-site-surface text-site-text hover:border-site-border-bright'
                }`}
              >
                {cls.name}
              </button>
            ))}
          </div>
        </div>

        <FareBreakdown distanceMeters={distanceMeters} durationSeconds={durationSeconds} classId={classId} />
      </div>
    </section>
  );
}
