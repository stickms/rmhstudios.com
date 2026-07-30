/**
 * Blessings.
 *
 * Three hundred and sixty of them, of which perhaps twenty are on offer at any
 * moment — the rest are behind a source count, a trophy count, or another
 * blessing. The list is windowed anyway, because "on offer" grows past a
 * hundred in the deep game and a hundred DOM rows is a hundred DOM rows.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt, formatTimeTo } from '@/lib/temple-of-joy/numbers';
import type { BlessingKind } from '@/lib/temple-of-joy/types';
import { BLESSING_KINDS } from '@/lib/temple-of-joy/data/blessings';
import {
  computeAvailableBlessings,
  computeBestPurchase,
  computeJps,
} from '@/lib/temple-of-joy/engine';
import { useFlash, useTempleSnapshot, useTempleValue } from '../hooks';
import { TempleRow, TempleSegments, TempleEmpty, Glyph } from '../ui';

/** Rows rendered before the window grows. */
const PAGE = 40;

export function BlessingsPanel({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation('c-temple-of-joy');
  const filter = useTempleValue((s) => s.blessingFilter);
  const [flashed, flash] = useFlash();
  const [limit, setLimit] = useState(PAGE);

  const rows = useTempleSnapshot((s) => {
    const jps = computeJps(s);
    const best = computeBestPurchase(s);
    const bestId = best?.kind === 'blessing' ? best.id : null;

    return computeAvailableBlessings(s)
      .filter((b) => s.blessingFilter === 'all' || b.kind === s.blessingFilter)
      .map((b) => ({
        id: b.id,
        name: b.name,
        flavor: b.flavor,
        icon: b.icon,
        cost: fmt(b.cost, s.numberFormat),
        affordable: s.joy >= b.cost,
        wait: formatTimeTo(b.cost, s.joy, jps),
        recommended: b.id === bestId,
      }));
  }, 400);

  // A new filter is a new list, so the window collapses. Keyed on the filter
  // rather than on the length, which changes every time anything is bought.
  useEffect(() => {
    setLimit(PAGE);
  }, [filter]);

  // Grow the window as the player nears the end. Not a virtualiser: rows are
  // variable-height and read top-to-bottom, so "render 40, add 40" gets the
  // whole benefit for a fraction of the complexity — and keeps ⌘F working.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || limit >= rows.length) return;

    const onScroll = () => {
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining < 600) setLimit((current) => Math.min(rows.length, current + PAGE));
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    // Fire once: a short list in a tall panel never scrolls, so the handler
    // above would never run and the rest would never appear.
    onScroll();
    return () => node.removeEventListener('scroll', onScroll);
  }, [rows.length, limit, scrollRef]);

  const options = useMemo(
    () =>
      BLESSING_KINDS.map((kind) => ({
        value: kind.id,
        label: t(`filter-${kind.id}`, { defaultValue: kind.label }),
      })),
    [t],
  );

  return (
    <>
      <div className="toj-toolbar">
        <TempleSegments
          options={options}
          value={filter}
          onChange={(value) =>
            useTempleStore.getState().setBlessingFilter(value as BlessingKind | 'all')
          }
          label={t('blessing-filter', { defaultValue: 'Blessing kind' })}
        />
      </div>

      {rows.length === 0 ? (
        <TempleEmpty>
          {t('blessings-empty', {
            defaultValue: 'Nothing on offer. Build something, and something will be.',
          })}
        </TempleEmpty>
      ) : (
        rows.slice(0, limit).map((row) => (
          <TempleRow
            key={row.id}
            icon={<Glyph>{row.icon}</Glyph>}
            name={row.name}
            note={row.flavor}
            price={row.cost}
            meta={row.affordable ? undefined : row.wait ? `in ${row.wait}` : undefined}
            affordable={row.affordable}
            recommended={row.recommended}
            flash={flashed === row.id}
            disabled={!row.affordable}
            ariaLabel={t('buy-blessing', {
              name: row.name,
              cost: row.cost,
              defaultValue: 'Buy {{name}} for {{cost}} joy',
            })}
            onClick={() => {
              templeAudio.play('blessing');
              flash(row.id);
              useTempleStore.getState().buyBlessing(row.id);
            }}
          />
        ))
      )}
    </>
  );
}
