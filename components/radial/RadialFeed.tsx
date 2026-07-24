'use client';

import { Suspense, useMemo, useState } from 'react';
import { Await, Link } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type InitialFeed } from '@/components/feed/FeedColumn';
import { RadialWheel, type RadialWheelItem } from './RadialWheel';
import { RmharkCard } from './RmharkCard';

function WheelCore({ active, total }: { active: number; total: number }) {
  return (
    <div className="radial-core" aria-hidden>
      <span className="radial-core__mark">RMH</span>
      <span className="radial-core__count">
        {total > 0 ? `${Math.min(active + 1, total)} / ${total}` : '—'}
      </span>
    </div>
  );
}

function FeedWheel({ data }: { data: InitialFeed }) {
  const { t } = useTranslation('feed');
  const [active, setActive] = useState(0);

  const items = useMemo<RadialWheelItem[]>(
    () => data.items.map((item) => ({ id: item.id, node: <RmharkCard item={item} /> })),
    [data.items],
  );

  if (items.length === 0) {
    return (
      <div className="radial-feed__empty">
        <WheelCore active={0} total={0} />
        <p>{t('feed-empty', { defaultValue: 'Nothing here yet. Be the first to post.' })}</p>
        <Link to="/create" className="radial-feed__compose">
          <PenLine aria-hidden />
          {t('compose', { defaultValue: 'Compose' })}
        </Link>
      </div>
    );
  }

  return (
    <RadialWheel
      items={items}
      center={<WheelCore active={active} total={items.length} />}
      onActiveChange={setActive}
      ariaLabel={t('feed', { defaultValue: 'Feed' })}
    >
      <p className="radial-feed__hint" aria-hidden>
        {t('spin-hint', { defaultValue: 'Scroll · drag · ↑↓ to spin' })}
      </p>
    </RadialWheel>
  );
}

function FeedWheelSkeleton() {
  return (
    <div className="radial-feed__skeleton" aria-hidden>
      <div className="radial-core">
        <span className="radial-core__mark">RMH</span>
      </div>
    </div>
  );
}

/**
 * The radial home feed. RMHarks orbit the central RMH core; spinning the wheel
 * rolls each into focus. The first page streams in from the route loader, so
 * the core paints instantly and the ring fills as the timeline resolves.
 */
export function RadialFeed({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');

  return (
    <section className="radial-feed" aria-label={t('feed', { defaultValue: 'Feed' })}>
      <header className="radial-feed__head">
        <p className="radial-feed__eyebrow">{t('the-feed', { defaultValue: 'The Feed' })}</p>
        <Link to="/create" className="radial-feed__compose">
          <PenLine aria-hidden />
          {t('compose', { defaultValue: 'Compose' })}
        </Link>
      </header>

      {initialFeed ? (
        <Suspense fallback={<FeedWheelSkeleton />}>
          <Await promise={initialFeed}>{(data) => <FeedWheel data={data} />}</Await>
        </Suspense>
      ) : (
        <FeedWheelSkeleton />
      )}
    </section>
  );
}
