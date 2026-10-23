/**
 * RMH Rideshare — landing (/rideshare)
 *
 * Marketing hub linking the rider request flow and the driver application,
 * plus the ride-class catalogue. Riders aren't charged to request a ride.
 */
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import {
  ArrowRight,
  Car,
  MapPin,
  ShieldCheck,
  Users,
  Sparkles,
  Leaf,
  Crown,
  Bike,
  Helicopter,
  CircleDollarSign,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { FareBreakdown } from '@/components/rideshare/FareBreakdown';
import { RIDE_CLASSES, type RideClassId } from '@/lib/rideshare/classes';

export const Route = createFileRoute('/_site/rideshare/')({
  head: () => ({
    meta: buildMeta({
      title: 'RMH Rideshare — Rides across the community',
      description:
        'Request a ride or sign up to drive with RMH Rideshare. Map your trip with OpenStreetMap and choose from RMH-X, RMH-XL, RMH-Comfort and more.',
      path: '/rideshare',
    }),
    links: [buildCanonical('/rideshare')],
  }),
  component: RideshareLanding,
});

const CLASS_ICONS: Record<string, LucideIcon> = {
  Car,
  Users,
  Sparkles,
  Leaf,
  Crown,
  Bike,
  Helicopter,
};

const RIDER_STEPS_KEYS = [
  {
    icon: MapPin,
    titleKey: 'step-map-title',
    titleDefault: 'Map your trip',
    textKey: 'step-map-text',
    textDefault: 'Set pickup and drop-off with OpenStreetMap search.',
  },
  {
    icon: Car,
    titleKey: 'step-pick-title',
    titleDefault: 'Pick a ride',
    textKey: 'step-pick-text',
    textDefault: 'Choose RMH-X, XL, Comfort, Green or Black.',
  },
  {
    icon: ShieldCheck,
    titleKey: 'step-match-title',
    titleDefault: 'Get matched',
    textKey: 'step-match-text',
    textDefault: 'A vetted RMH driver claims your request.',
  },
  {
    icon: CircleDollarSign,
    titleKey: 'step-hopin-title',
    titleDefault: 'Hop in',
    textKey: 'step-hopin-text',
    textDefault: 'See an upfront fare, pay after the trip, and tip if you loved it.',
  },
];

function RideshareLanding() {
  const { t } = useTranslation('rideshare');
  return (
    <PageLayout title="RMH Rideshare" wide>
      <div className="flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-12">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-pane flex flex-col items-start gap-4 rounded-site p-5 md:p-8"
        >
          <Badge variant="accent" size="lg" icon={<Sparkles aria-hidden />}>
            {t('community-rideshare', { defaultValue: 'Community rideshare' })}
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-site-text md:text-4xl">
            {t('hero-heading', { defaultValue: 'Getting around, together.' })}
          </h2>
          <p className="max-w-xl text-base text-site-text-muted">
            {t('hero-body', {
              defaultValue:
                'RMH Rideshare connects riders with community drivers. Map your trip with OpenStreetMap, see your route and an upfront estimate, then request a ride.',
            })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/rideshare/ride">
                <MapPin aria-hidden /> {t('request-a-ride', { defaultValue: 'Request a ride' })}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/rideshare/drive">
                <Car aria-hidden /> {t('become-a-driver', { defaultValue: 'Become a driver' })}
              </Link>
            </Button>
          </div>
        </motion.section>

        {/* Ride classes */}
        <section className="space-y-4">
          <h2 className="site-section-label">
            {t('choose-your-ride', { defaultValue: 'Choose your ride' })}
          </h2>
          <p className="text-sm text-site-text-muted">
            {t('ride-classes-subtitle', {
              defaultValue: 'A ride for every trip — from everyday to extra-special.',
            })}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RIDE_CLASSES.map((cls, i) => {
              const Icon = CLASS_ICONS[cls.icon] ?? Car;
              return (
                <motion.article
                  key={cls.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-fill flex flex-col rounded-site p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-site bg-site-accent/15 text-site-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="flex items-center gap-2 text-xs text-site-text-muted">
                      <Users className="h-3.5 w-3.5" aria-hidden />{' '}
                      {t('up-to-seats', { seats: cls.seats, defaultValue: 'up to {{seats}}' })}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-site-text">{cls.name}</h3>
                  <p className="text-xs font-medium text-site-accent">{cls.tagline}</p>
                  <p className="mt-2 flex-1 text-sm text-site-text-muted">{cls.description}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-site-text-dim">
                    <Clock className="h-3.5 w-3.5" />{' '}
                    {t('eta-minutes-away', {
                      min: cls.etaMinutes[0],
                      max: cls.etaMinutes[1],
                      defaultValue: '{{min}}–{{max}} min away',
                    })}
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* Price visualizer */}
        <PriceEstimator />

        {/* How it works (riders) */}
        <section className="space-y-4">
          <h2 className="site-section-label">
            {t('how-it-works', { defaultValue: 'How it works' })}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RIDER_STEPS_KEYS.map((step, i) => (
              <div key={step.titleKey} className="glass-fill rounded-site p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-site-sm bg-site-surface-hover text-site-accent">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-xs font-semibold text-site-text-dim">
                  {t('step-number', { number: i + 1, defaultValue: 'Step {{number}}' })}
                </div>
                <h3 className="font-semibold text-site-text">
                  {t(step.titleKey, { defaultValue: step.titleDefault })}
                </h3>
                <p className="mt-1 text-sm text-site-text-muted">
                  {t(step.textKey, { defaultValue: step.textDefault })}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Driver CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-fill flex flex-col gap-4 rounded-site p-5 md:flex-row md:items-center md:justify-between md:gap-8 md:p-8"
        >
          <div className="max-w-lg space-y-2">
            <div className="flex items-center gap-2 text-site-accent">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <span className="text-xs font-semibold">
                {t('drive-with-rmh', { defaultValue: 'Drive with RMH' })}
              </span>
            </div>
            <h2 className="site-section-label">
              {t('driver-cta-heading', { defaultValue: 'Earn your wings as an RMH driver' })}
            </h2>
            <p className="text-sm text-site-text-muted">
              {t('driver-cta-body', {
                defaultValue:
                  'Tell us about your vehicle and upload your license for a quick review. We delete your license the moment it’s approved — your documents are never kept on file.',
              })}
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/rideshare/drive">
              {t('start-your-application', { defaultValue: 'Start your application' })}{' '}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </motion.section>
      </div>
    </PageLayout>
  );
}

/**
 * Interactive fare visualizer. Lets visitors estimate what a trip would cost
 * across the ride classes before they request one.
 */
function PriceEstimator() {
  const { t } = useTranslation('rideshare');
  const [km, setKm] = useState(8);
  const [classId, setClassId] = useState<RideClassId>('RMH_X');

  const distanceMeters = km * 1000;
  // Assume ~30 km/h average city speed for the time component.
  const durationSeconds = Math.round((km / 30) * 3600);

  return (
    <section className="space-y-4">
      <h2 className="site-section-label">
        {t('estimate-your-trip', { defaultValue: 'Estimate your trip' })}
      </h2>
      <p className="text-sm text-site-text-muted">
        {t('estimator-subtitle', {
          defaultValue: 'Drag to estimate any trip across the ride classes.',
        })}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="glass-fill flex flex-col gap-4 rounded-site p-4">
          <div className="flex items-center justify-between">
            <label htmlFor="estimator-distance" className="text-sm font-medium text-site-text">
              {t('trip-distance', { defaultValue: 'Trip distance' })}
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
          <div className="-mt-2 flex justify-between text-xs text-site-text-dim">
            <span>1 km</span>
            <span>60 km</span>
          </div>

          <LiquidTabs
            size="sm"
            tabs={RIDE_CLASSES.map((cls) => ({ id: cls.id, label: cls.name }))}
            value={classId}
            onChange={(id) => setClassId(id as RideClassId)}
            aria-label={t('ride-class', { defaultValue: 'Ride class' })}
          />
        </div>

        <FareBreakdown
          distanceMeters={distanceMeters}
          durationSeconds={durationSeconds}
          classId={classId}
        />
      </div>
    </section>
  );
}
