/**
 * The Ladder — what Grace buys.
 *
 * Grouped by tier, and a rung stays hidden until everything below it is
 * bought, so the tree reads as a ladder rather than as a wishlist. The
 * Communion rungs sit first because until one of them is bought, Grace does
 * nothing at all, and a player who has not worked that out will wonder why
 * their first ascension made them poorer.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { LEGACY } from '@/lib/temple-of-joy/data/legacy';
import {
  computeAscensionGrace,
  computeGraceEarned,
  computeLegacyAffordable,
  computeLegacyVisible,
  computeKeepsakeSlots,
} from '@/lib/temple-of-joy/engine';
import { useFlash, useTempleSnapshot } from '../hooks';
import { TempleRow, TempleSection, Glyph } from '../ui';

const TIER_NAMES: Record<number, string> = {
  0: 'The First Rung',
  1: 'Communion — turning Grace into rate',
  2: 'What you carry with you',
  3: 'What happens while you are gone',
  4: 'The slow bread',
  5: 'Providence',
  6: 'Plain multipliers',
};

export function LadderPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const [flashed, flash] = useFlash();

  const ladder = useTempleSnapshot((s) => {
    const share = LEGACY.filter((l) => s.legacy.has(l.id) && l.graceShare).reduce(
      (sum, l) => sum + (l.graceShare ?? 0),
      0,
    );
    return {
      format: s.numberFormat,
      grace: s.grace,
      spent: s.graceSpent,
      lifetime: computeGraceEarned(s.lifetimeJoy),
      waiting: computeAscensionGrace(s),
      keepsakes: computeKeepsakeSlots(s),
      share,
      rungs: LEGACY.filter((rung) => computeLegacyVisible(s, rung.id)).map((rung) => ({
        id: rung.id,
        owned: s.legacy.has(rung.id),
        affordable: computeLegacyAffordable(s, rung.id),
      })),
    };
  }, 500);

  const visible = new Map(ladder.rungs.map((r) => [r.id, r]));
  const tiers = [...new Set(LEGACY.map((l) => l.tier))].sort((a, b) => a - b);

  return (
    <>
      <p className="toj-panel-note">
        {ladder.share === 0
          ? t('ladder-warn', {
              defaultValue:
                'Grace does nothing until a Communion rung unlocks it. Buy First Communion before anything else.',
            })
          : t('ladder-share', {
              percent: Math.round(Math.min(1, ladder.share) * 100),
              bonus: (Math.min(1, ladder.share) * ladder.grace).toFixed(0),
              defaultValue:
                '{{percent}}% of your Grace counts, for +{{bonus}}% to everything, permanently.',
            })}
      </p>

      <div className="toj-setting">
        <span className="toj-setting-label">
          <span className="toj-setting-name">
            {t('grace-held', { defaultValue: 'Grace held' })}
          </span>
          <span className="toj-setting-note">
            {t('grace-spent', {
              spent: ladder.spent,
              defaultValue: '{{spent}} spent on the Ladder so far.',
            })}
          </span>
        </span>
        <span className="toj-setting-value">{fmt(ladder.grace, ladder.format)}</span>
      </div>

      {ladder.waiting > 0 && (
        <div className="toj-setting">
          <span className="toj-setting-label">
            <span className="toj-setting-name">
              {t('grace-waiting', { defaultValue: 'Grace waiting' })}
            </span>
            <span className="toj-setting-note">
              {t('grace-waiting-note', { defaultValue: 'Yours the moment you ascend.' })}
            </span>
          </span>
          <span className="toj-setting-value">+{fmt(ladder.waiting, ladder.format)}</span>
        </div>
      )}

      {ladder.keepsakes > 0 && (
        <div className="toj-setting">
          <span className="toj-setting-label">
            <span className="toj-setting-name">
              {t('keepsake-slots', { defaultValue: 'Blessings you may carry' })}
            </span>
          </span>
          <span className="toj-setting-value">{ladder.keepsakes}</span>
        </div>
      )}

      {tiers.map((tier) => {
        const rungs = LEGACY.filter((rung) => rung.tier === tier && visible.has(rung.id));
        if (rungs.length === 0) return null;

        return (
          <div key={tier}>
            <TempleSection>
              {t(`ladder-tier-${tier}`, { defaultValue: TIER_NAMES[tier] ?? `Tier ${tier}` })}
            </TempleSection>
            {rungs.map((rung) => {
              const row = visible.get(rung.id)!;
              return (
                <TempleRow
                  key={rung.id}
                  className="toj-rung"
                  icon={<Glyph>{rung.icon}</Glyph>}
                  name={rung.name}
                  note={rung.description}
                  price={row.owned ? '✓' : `${fmt(rung.cost, ladder.format)} ☁️`}
                  affordable={row.affordable}
                  flash={flashed === rung.id}
                  disabled={row.owned || !row.affordable}
                  onClick={
                    row.owned
                      ? undefined
                      : () => {
                          templeAudio.play('blessing');
                          flash(rung.id);
                          useTempleStore.getState().buyLegacy(rung.id);
                        }
                  }
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
