/**
 * Massive March — the thing only you can see.
 *
 * This panel is the visible end of the entire design. Whatever is in it arrived
 * addressed to this socket alone, because this player is standing somewhere that
 * entitles them to it — inside the booth, on the lookout, holding the finder.
 * Nobody else's client was sent it.
 *
 * Which means the only way the information gets to the person who can act on it
 * is out of somebody's mouth, or onto a whiteboard, or through a radio. That is
 * the game.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import type { Reveal } from '@/lib/massive-march/net/events';
import { TOY } from '@/lib/massive-march/palette';
import { Glyph } from '../Glyph';
import { BOARD, INK, Panel } from '../ui';

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function RevealPanel({ reveal }: { reveal: Reveal }) {
  const { t } = useTranslation('c-massive-march');
  if (reveal.kind === 'clear') return null;

  return (
    <Panel className="pointer-events-none w-[min(20rem,60vw)] space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
        <Eye aria-hidden className="size-3.5" />
        {t('reveal-only-you', { defaultValue: 'Only you can see this' })}
      </p>

      {reveal.kind === 'booth' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {reveal.symbols.map((symbol, index) => (
              <span
                key={`${symbol}-${index}`}
                className="grid size-11 place-items-center border-[3px]"
                style={{ borderColor: INK, background: BOARD, borderRadius: 3 }}
              >
                <Glyph symbol={symbol} size={26} color={INK} />
              </span>
            ))}
          </div>
          <p className="text-xs leading-snug opacity-75">
            {reveal.offset === 0
              ? t('reveal-booth', {
                  defaultValue: 'Painted on the wall in here. The console is outside.',
                })
              : t('reveal-booth-half', {
                  defaultValue:
                    'Your half of the sequence. The other booth has the marks that go between yours.',
                })}
          </p>
        </div>
      ) : null}

      {reveal.kind === 'totems' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {reveal.facings.map((facing, index) => (
              <span
                key={index}
                className="grid size-11 place-items-center border-[3px] text-sm font-black"
                style={{ borderColor: INK, background: BOARD, borderRadius: 3 }}
              >
                <span aria-hidden style={{ transform: `rotate(${(facing / 8) * 360}deg)` }}>
                  ↑
                </span>
                <span className="sr-only">{COMPASS[facing % 8]}</span>
              </span>
            ))}
          </div>
          <p className="text-xs leading-snug opacity-75">
            {t('reveal-totems', {
              defaultValue:
                'Painted on the hillside, in order left to right as you look at them from here.',
            })}
          </p>
        </div>
      ) : null}

      {reveal.kind === 'plate' ? (
        <div className="space-y-1">
          <p className="text-2xl font-black">
            {t('reveal-plate', { defaultValue: 'Plate {{n}}', n: reveal.index + 1 })}
          </p>
          <p className="text-xs leading-snug opacity-75">
            {t('reveal-plate-hint', {
              defaultValue:
                'It is lit for you and not for them. Say which way to walk from where they are, not from where you are.',
            })}
          </p>
        </div>
      ) : null}

      {reveal.kind === 'finder' ? (
        <div className="space-y-1">
          <p className="text-3xl font-black" style={{ color: reveal.distance < 6 ? TOY.red : INK }}>
            {reveal.distance < 6
              ? t('finder-here', { defaultValue: 'Right here' })
              : t('finder-distance', { defaultValue: '{{m}} m', m: Math.round(reveal.distance) })}
          </p>
          <p className="text-xs leading-snug opacity-75">
            {t('finder-hint', {
              defaultValue: 'To the nearest one. It will not tell you which way.',
            })}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
