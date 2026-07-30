/**
 * The Book of Hours.
 *
 * Mana refills on its own, prayers spend it, and every prayer can go wrong.
 * The backfire odds are shown up front — a gamble you cannot price is not a
 * gamble, it is a trap — and the last outcome stays on the page so a prayer
 * that failed while you were reading something else is not silently lost.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { formatDuration } from '@/lib/temple-of-joy/numbers';
import type { PrayerId } from '@/lib/temple-of-joy/types';
import {
  PRAYERS,
  PRAYER_MAP,
  backfireChance,
  prayerCost,
  refillSeconds,
} from '@/lib/temple-of-joy/minigames/hours';
import { useTempleSnapshot } from '../hooks';
import { TempleRow, TempleSection, Glyph } from '../ui';

export function HoursPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const book = useTempleSnapshot((s) => {
    const level = s.sourceLevels.scriptorium ?? 0;
    return {
      mana: Math.floor(s.hours.mana),
      maxMana: s.hours.maxMana,
      level,
      said: s.hours.said,
      backfired: s.hours.backfired,
      last: s.hours.last ? `${s.hours.last.good ? '1' : '0'}:${s.hours.last.outcome}` : '',
      // Seconds until full, which is the number a player actually plans around.
      full: ((s.hours.maxMana - s.hours.mana) / s.hours.maxMana) * refillSeconds(s.hours.maxMana),
      prayers: PRAYERS.map((prayer) => ({
        id: prayer.id,
        cost: prayerCost(prayer.id, s.hours.maxMana),
        locked: level < prayer.requiresLevel,
        risk: backfireChance(prayer.id, s.hours.said, s.rapture),
        affordable: s.hours.mana >= prayerCost(prayer.id, s.hours.maxMana),
      })),
    };
  }, 500);

  const [lastGood, lastText] = book.last ? book.last.split(/:(.*)/s) : ['', ''];

  return (
    <>
      <div className="toj-toolbar">
        <span className="toj-panel-sub">
          <Glyph>🔮</Glyph> {book.mana} / {book.maxMana}
        </span>
        <span className="toj-panel-sub">
          {book.mana >= book.maxMana
            ? t('mana-full', { defaultValue: 'Full — spend some' })
            : t('mana-full-in', {
                time: formatDuration(book.full),
                defaultValue: 'full in {{time}}',
              })}
        </span>
      </div>

      <div className="toj-mana">
        <div
          className="toj-mana-fill"
          style={{ width: `${Math.min(100, (book.mana / book.maxMana) * 100)}%` }}
        />
      </div>

      {lastText && (
        <p className="toj-panel-note" role="status">
          <Glyph>{lastGood === '1' ? '✨' : '🕯️'}</Glyph> {lastText}
        </p>
      )}

      <TempleSection>{t('hours-prayers', { defaultValue: 'Prayers' })}</TempleSection>

      {book.prayers.map((row) => {
        const def = PRAYER_MAP[row.id as PrayerId];
        return (
          <TempleRow
            key={row.id}
            icon={<Glyph>{def.icon}</Glyph>}
            name={def.name}
            note={
              row.locked
                ? t('prayer-locked', {
                    level: def.requiresLevel,
                    defaultValue: 'Needs Scriptorium level {{level}}.',
                  })
                : def.description
            }
            price={
              <>
                {row.cost} <Glyph>🔮</Glyph>
              </>
            }
            meta={
              row.locked
                ? undefined
                : t('prayer-risk', {
                    percent: Math.round(row.risk * 100),
                    defaultValue: '{{percent}}% goes wrong',
                  })
            }
            affordable={row.affordable && !row.locked}
            disabled={row.locked || !row.affordable}
            ariaLabel={t('say-prayer', {
              name: def.name,
              cost: row.cost,
              defaultValue: 'Say {{name}} for {{cost}} mana',
            })}
            onClick={() => {
              const before = useTempleStore.getState().hours.backfired;
              useTempleStore.getState().pray(row.id as PrayerId);
              const after = useTempleStore.getState().hours.backfired;
              templeAudio.play(after > before ? 'backfire' : 'prayer');
            }}
          />
        );
      })}

      <TempleSection>{t('hours-record', { defaultValue: 'The record' })}</TempleSection>
      <div className="toj-setting">
        <span className="toj-setting-label">
          <span className="toj-setting-name">
            {t('prayers-said', { defaultValue: 'Prayers said' })}
          </span>
          <span className="toj-setting-note">
            {t('prayers-said-note', {
              defaultValue: 'Every prayer raises your mana ceiling and steadies your hand.',
            })}
          </span>
        </span>
        <span className="toj-setting-value">{book.said}</span>
      </div>
      <div className="toj-setting">
        <span className="toj-setting-label">
          <span className="toj-setting-name">
            {t('prayers-backfired', { defaultValue: 'Answered otherwise' })}
          </span>
        </span>
        <span className="toj-setting-value">{book.backfired}</span>
      </div>
    </>
  );
}
