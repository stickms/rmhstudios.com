/**
 * The trophy case.
 *
 * Four hundred rows, so it is windowed and filtered. The header states the
 * Devotion total up front, because the point of this list is not completionism
 * — it is that every row is worth 4% on everything you own, and a player who
 * has not made that connection is leaving the late game on the table.
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TROPHIES, TROPHY_MAP } from '@/lib/temple-of-joy/data/trophies';
import { computeDevotion } from '@/lib/temple-of-joy/engine';
import { useTempleSnapshot } from '../hooks';
import { TempleRow, TempleSegments, TempleSection, Glyph } from '../ui';

const PAGE = 60;

type Filter = 'all' | 'earned' | 'locked';

export function TrophiesPanel({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation('c-temple-of-joy');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);

  const state = useTempleSnapshot(
    (s) => ({
      // Joined rather than kept as a Set so the shallow compare works.
      earned: [...s.trophies].join(','),
      devotion: computeDevotion(s),
    }),
    1_000,
  );

  const earned = new Set(state.earned.split(',').filter(Boolean));

  const rows = TROPHIES.filter((trophy) => {
    const has = earned.has(trophy.id);
    if (filter === 'earned') return has;
    if (filter === 'locked') return !has;
    return true;
  });

  useEffect(() => {
    setLimit(PAGE);
  }, [filter]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || limit >= rows.length) return;

    const onScroll = () => {
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining < 600) setLimit((current) => Math.min(rows.length, current + PAGE));
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => node.removeEventListener('scroll', onScroll);
  }, [rows.length, limit, scrollRef]);

  return (
    <>
      <div className="toj-toolbar">
        <TempleSegments
          options={[
            { value: 'all' as const, label: t('filter-all', { defaultValue: 'All' }) },
            { value: 'earned' as const, label: t('filter-earned', { defaultValue: 'Earned' }) },
            {
              value: 'locked' as const,
              label: t('filter-locked', { defaultValue: 'Still to come' }),
            },
          ]}
          value={filter}
          onChange={setFilter}
          label={t('trophy-filter', { defaultValue: 'Trophy filter' })}
        />
        <span className="toj-panel-sub">
          {earned.size} / {TROPHIES.length}
        </span>
      </div>

      <p className="toj-panel-note">
        {t('devotion-note', {
          percent: Math.round(state.devotion * 100),
          defaultValue:
            'Devotion: +{{percent}}%. Every trophy is worth 4%, and the Cherubim turn all of it into income — this list is the late game.',
        })}
      </p>

      <TempleSection>{t('trophies', { defaultValue: 'Trophies' })}</TempleSection>

      {rows.slice(0, limit).map((trophy) => {
        const has = earned.has(trophy.id);
        const def = TROPHY_MAP[trophy.id]!;
        // A secret trophy the player has not earned shows nothing but its
        // silhouette — spoiling them would remove the only reason they exist.
        const hidden = def.secret && !has;

        return (
          <TempleRow
            key={trophy.id}
            icon={<Glyph>{has ? '🏆' : hidden ? '❔' : '◦'}</Glyph>}
            name={hidden ? t('trophy-secret', { defaultValue: 'Something unspoken' }) : def.name}
            note={
              hidden
                ? t('trophy-secret-note', {
                    defaultValue: 'You will know it when you do it.',
                  })
                : has
                  ? def.flavor
                  : def.description
            }
            meta={
              def.shadow && has
                ? t('trophy-shadow', { defaultValue: 'no Devotion' })
                : has
                  ? '+4%'
                  : undefined
            }
            affordable={has}
          />
        );
      })}
    </>
  );
}
