/**
 * The Choir of Saints.
 *
 * Three stalls, twelve saints, and a cooldown that grows every time you change
 * your mind. That cooldown is the mechanic: a choir is a shape you commit to
 * for an evening, not a dial you turn between purchases. Most saints cost you
 * something, so the panel shows the whole effect — gift and price — rather
 * than only the good half.
 */
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { formatDuration } from '@/lib/temple-of-joy/numbers';
import type { SaintId } from '@/lib/temple-of-joy/types';
import { SAINTS, SAINT_MAP, STALL_NAMES, STALL_SHARE } from '@/lib/temple-of-joy/minigames/choir';
import { useTempleSnapshot } from '../hooks';
import { TempleButton, TempleRow, TempleSection, Glyph } from '../ui';

export function ChoirPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  /** Which stall the player is filling. `null` = not choosing. */
  const [choosing, setChoosing] = useState<0 | 1 | 2 | null>(null);

  const choir = useTempleSnapshot(
    (s) => ({
      stalls: s.choir.stalls.join(','),
      cooldown: Math.ceil(s.choir.cooldown),
      swaps: s.choir.swaps,
    }),
    400,
  );

  const stalls = choir.stalls.split(',') as (SaintId | '')[];
  const locked = choir.cooldown > 0;

  return (
    <>
      <p className="toj-panel-note">
        {locked
          ? t('choir-cooldown', {
              time: formatDuration(choir.cooldown),
              defaultValue: 'The choir is mid-office. It can be re-seated in {{time}}.',
            })
          : t('choir-note', {
              defaultValue:
                'The nave grants a saint their full strength, the transept half, the apse a quarter — penalties soften the same way. Re-seating costs a silence that grows each time.',
            })}
      </p>

      <div className="toj-stalls">
        {[0, 1, 2].map((index) => {
          const saintId = stalls[index] || null;
          const saint = saintId ? SAINT_MAP[saintId as SaintId] : null;
          const share = STALL_SHARE[index]!;

          return (
            <div key={index} className="toj-stall" data-filled={saint ? 'true' : undefined}>
              <span className="toj-stall-icon">
                <Glyph>{saint?.icon ?? '➕'}</Glyph>
              </span>
              <span className="toj-stall-body">
                <span className="toj-stall-role">
                  {t(`stall-${index}`, { defaultValue: STALL_NAMES[index] })} ·{' '}
                  {Math.round(share * 100)}%
                </span>
                <span className="toj-stall-name">
                  {saint ? saint.name : t('stall-empty', { defaultValue: 'Empty' })}
                </span>
                <span className="toj-stall-effect">
                  {saint
                    ? saint.effects[index]!.description
                    : t('stall-choose', { defaultValue: 'Nobody is singing here.' })}
                </span>
              </span>
              <TempleButton
                size="sm"
                variant={saint ? 'quiet' : 'plain'}
                disabled={locked}
                onClick={() => setChoosing(choosing === index ? null : (index as 0 | 1 | 2))}
              >
                {choosing === index
                  ? t('cancel', { defaultValue: 'Not yet' })
                  : saint
                    ? t('replace', { defaultValue: 'Replace' })
                    : t('seat', { defaultValue: 'Seat' })}
              </TempleButton>
            </div>
          );
        })}
      </div>

      {choosing !== null && (
        <>
          <TempleSection>
            {t('choir-pick', {
              stall: t(`stall-${choosing}`, { defaultValue: STALL_NAMES[choosing] }),
              defaultValue: 'Who sings in the {{stall}}?',
            })}
          </TempleSection>

          {stalls[choosing] && (
            <TempleRow
              icon={<Glyph>🚪</Glyph>}
              name={t('stall-clear', { defaultValue: 'Leave it empty' })}
              note={t('stall-clear-note', {
                defaultValue: 'Costs the same silence as any other change.',
              })}
              onClick={() => {
                templeAudio.play('choir');
                useTempleStore.getState().seatSaint(choosing, null);
                setChoosing(null);
              }}
            />
          )}

          {SAINTS.map((saint) => {
            const seated = stalls.includes(saint.id);
            return (
              <TempleRow
                key={saint.id}
                icon={<Glyph>{saint.icon}</Glyph>}
                name={`${saint.name} ${saint.epithet}`}
                note={saint.effects[choosing]!.description}
                meta={seated ? t('already-seated', { defaultValue: 'will move here' }) : undefined}
                onClick={() => {
                  templeAudio.play('choir');
                  useTempleStore.getState().seatSaint(choosing, saint.id);
                  setChoosing(null);
                }}
              />
            );
          })}
        </>
      )}
    </>
  );
}
