/**
 * The three dialogs, and the toast rail.
 *
 * The vigil report is the important one: it is the first thing a returning
 * player sees, and it has to make an absence feel like it *paid*. So it
 * itemises — joy earned, what the Sinners are holding, what ripened, what grew
 * — rather than showing one number that could have come from anywhere.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import {
  computeAscensionGrace,
  computeKeepsMinigames,
  computeKeepsakeSlots,
  computeRateModifiers,
} from '@/lib/temple-of-joy/engine';
import { MANNA_KIND_MAP, ripenDuration, levelCost } from '@/lib/temple-of-joy/minigames/manna';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { TempleButton, TempleRow, Glyph } from './ui';

export function TempleDialogs() {
  return (
    <>
      <VigilDialog />
      <AscendDialog />
      <MannaDialog />
      <Toasts />
    </>
  );
}

/* ─── The vigil report ──────────────────────────────────────────────────── */

function VigilDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const open = useTempleValue((s) => s.showVigilDialog);
  const vigil = useTempleSnapshot(
    (s) => ({
      seconds: s.vigil.seconds,
      joy: fmt(s.vigil.joy, s.numberFormat),
      sinnerText: fmt(s.vigil.sinnerJoy, s.numberFormat),
      sinners: s.sinners.length,
      manna: s.vigil.manna,
      ripe: s.garden.plots.filter((p) => p.seed && p.growth >= 100).length,
    }),
    1_000,
  );

  if (!open) return null;

  return (
    <Scrim onClose={() => useTempleStore.getState().setShowVigilDialog(false)}>
      <div className="toj-dialog-body">
        <h2 className="toj-dialog-title">
          {t('vigil-title', { defaultValue: 'The night office' })}
        </h2>
        <p className="toj-dialog-text">
          {t('vigil-away', {
            time: formatDuration(vigil.seconds),
            defaultValue: 'The temple kept going for {{time}}.',
          })}
        </p>

        <p className="toj-dialog-figure">+{vigil.joy}</p>

        <ul className="toj-dialog-list">
          {vigil.sinners > 0 && (
            <li>
              <span>
                {t('vigil-sinners', {
                  count: vigil.sinners,
                  defaultValue: '{{count}} Sinners, holding',
                })}
              </span>
              <strong>{vigil.sinnerText}</strong>
            </li>
          )}
          {vigil.manna > 0 && (
            <li>
              <span>{t('vigil-manna', { defaultValue: 'Manna ripened' })}</span>
              <strong>{vigil.manna}</strong>
            </li>
          )}
          {vigil.ripe > 0 && (
            <li>
              <span>{t('vigil-garden', { defaultValue: 'Plants ready to harvest' })}</span>
              <strong>{vigil.ripe}</strong>
            </li>
          )}
        </ul>

        {vigil.sinners > 0 && (
          <p className="toj-dialog-text" style={{ marginTop: '0.9rem' }}>
            {t('vigil-sinner-note', {
              defaultValue:
                'Everything the Sinners are holding comes back, multiplied, the moment you strike them.',
            })}
          </p>
        )}
      </div>

      <div className="toj-dialog-actions">
        <TempleButton
          variant="gold"
          onClick={() => useTempleStore.getState().setShowVigilDialog(false)}
        >
          {t('vigil-return', { defaultValue: 'Come back in' })}
        </TempleButton>
      </div>
    </Scrim>
  );
}

/* ─── Ascension ─────────────────────────────────────────────────────────── */

function AscendDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const open = useTempleValue((s) => s.showAscendDialog);

  const plan = useTempleSnapshot(
    (s) => ({
      grace: computeAscensionGrace(s),
      have: s.grace,
      slots: computeKeepsakeSlots(s),
      keepsakes: s.keepsakes.length,
      keepsMinigames: computeKeepsMinigames(s),
      levels: SOURCES.reduce((sum, source) => sum + (s.sourceLevels[source.id] ?? 0), 0),
    }),
    600,
  );

  if (!open) return null;

  return (
    <Scrim onClose={() => useTempleStore.getState().setShowAscendDialog(false)}>
      <div className="toj-dialog-body">
        <h2 className="toj-dialog-title">{t('ascend-title', { defaultValue: 'Let it go' })}</h2>
        <p className="toj-dialog-text">
          {t('ascend-text', {
            defaultValue:
              'The temple, the blessings, everything you built this run — given back. What you receive for it never leaves you again.',
          })}
        </p>

        <p className="toj-dialog-figure">
          +{plan.grace} <Glyph>☁️</Glyph>
        </p>

        <ul className="toj-dialog-list">
          <li>
            <span>{t('ascend-kept-levels', { defaultValue: 'Manna levels kept' })}</span>
            <strong>{plan.levels}</strong>
          </li>
          <li>
            <span>{t('ascend-kept-blessings', { defaultValue: 'Blessings carried' })}</span>
            <strong>
              {Math.min(plan.keepsakes, plan.slots)} / {plan.slots}
            </strong>
          </li>
          <li>
            <span>
              {t('ascend-kept-minigames', { defaultValue: 'Garden, choir, market, book' })}
            </span>
            <strong>
              {plan.keepsMinigames
                ? t('ascend-kept', { defaultValue: 'kept' })
                : t('ascend-reset', { defaultValue: 'reset' })}
            </strong>
          </li>
          <li>
            <span>{t('ascend-total', { defaultValue: 'Grace after' })}</span>
            <strong>{plan.have + plan.grace}</strong>
          </li>
        </ul>
      </div>

      <div className="toj-dialog-actions">
        <TempleButton
          variant="quiet"
          onClick={() => useTempleStore.getState().setShowAscendDialog(false)}
        >
          {t('cancel', { defaultValue: 'Not yet' })}
        </TempleButton>
        <TempleButton
          variant="gold"
          tone={null}
          onClick={() => {
            templeAudio.play('ascend');
            templeAudio.buzz([20, 60, 20, 60, 40]);
            useTempleStore.getState().ascend();
          }}
        >
          {t('ascend-confirm', { defaultValue: 'Let it all go' })}
        </TempleButton>
      </div>
    </Scrim>
  );
}

/* ─── Manna ─────────────────────────────────────────────────────────────── */

/**
 * Spending manna. Deliberately a dialog rather than a panel: it is a decision
 * you make once every twenty hours, and it deserves to interrupt.
 */
function MannaDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const open = useTempleValue((s) => s.showMannaDialog);

  const manna = useTempleSnapshot((s) => {
    const speed = computeRateModifiers(s).mannaSpeed;
    const total = ripenDuration(s.manna.kind, speed);
    return {
      held: s.manna.held,
      gathered: s.manna.gathered,
      kind: s.manna.kind,
      left: Math.max(0, (total - s.manna.ripening) / 1000),
      rows: SOURCES.map((source) => {
        const level = s.sourceLevels[source.id] ?? 0;
        return {
          id: source.id,
          level,
          cost: levelCost(level),
          affordable: s.manna.held >= levelCost(level),
          owned: s.sources[source.id] ?? 0,
        };
      }),
    };
  }, 800);

  if (!open) return null;

  const kind = MANNA_KIND_MAP[manna.kind];

  return (
    <Scrim onClose={() => useTempleStore.getState().setShowMannaDialog(false)}>
      <div className="toj-dialog-body">
        <h2 className="toj-dialog-title">{t('manna-title', { defaultValue: 'Manna' })}</h2>
        <p className="toj-dialog-text">
          {t('manna-text', {
            defaultValue:
              'It ripens on its own, roughly once a day, and nothing you do with joy will hurry it. Spend it raising a source: +1% output per level, forever, through every ascension.',
          })}
        </p>

        <p className="toj-dialog-figure">
          {manna.held} <Glyph>🍞</Glyph>
        </p>
        <p className="toj-dialog-text">
          {t('manna-next', {
            kind: kind.name,
            time: formatDuration(manna.left),
            defaultValue: 'Next: {{kind}}, in {{time}}.',
          })}{' '}
          {kind.note}
        </p>

        <ul className="toj-dialog-list">
          <li>
            <span>{t('manna-gathered', { defaultValue: 'Gathered, all time' })}</span>
            <strong>{manna.gathered}</strong>
          </li>
        </ul>

        <div style={{ marginTop: '0.8rem' }}>
          {manna.rows
            .filter((row) => row.owned > 0 || row.level > 0)
            .map((row) => {
              const def = SOURCES.find((s) => s.id === row.id)!;
              return (
                <TempleRow
                  key={row.id}
                  icon={<Glyph>{def.icon}</Glyph>}
                  name={def.name}
                  note={
                    def.minigame && row.level === 0
                      ? t('raise-opens', { defaultValue: 'Raising this opens something.' })
                      : t('raise-level', {
                          level: row.level,
                          percent: row.level,
                          defaultValue: 'Level {{level}} · +{{percent}}% output',
                        })
                  }
                  price={
                    <>
                      {row.cost} <Glyph>🍞</Glyph>
                    </>
                  }
                  affordable={row.affordable}
                  disabled={!row.affordable}
                  onClick={() => {
                    templeAudio.play('level');
                    useTempleStore.getState().levelSource(row.id);
                  }}
                />
              );
            })}
        </div>
      </div>

      <div className="toj-dialog-actions">
        <TempleButton onClick={() => useTempleStore.getState().setShowMannaDialog(false)}>
          {t('close', { defaultValue: 'Close' })}
        </TempleButton>
      </div>
    </Scrim>
  );
}

/* ─── Shared scrim ──────────────────────────────────────────────────────── */

/**
 * Escape closes, the first button takes focus, and focus returns where it came
 * from. Three lines each, and the difference between a dialog and a div.
 */
function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="toj-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="toj-dialog" role="dialog" aria-modal="true" ref={ref}>
        {children}
      </div>
    </div>
  );
}

/* ─── Toasts ────────────────────────────────────────────────────────────── */

/**
 * Notices are packed into single strings so the snapshot's shallow compare can
 * tell two renders apart — an array of fresh objects never compares equal. The
 * separator is a unit separator because titles and bodies contain everything
 * else a person would reach for.
 */
const SEP = '\u001f';

/**
 * The notice rail. Notices are created by the tick and the actions; this only
 * renders them and plays the trophy sting, so nothing here can change state the
 * game did not already decide.
 */
function Toasts() {
  const notices = useTempleSnapshot(
    (s) => s.notices.slice(-4).map((n) => [n.id, n.kind, n.icon, n.title, n.body ?? ''].join(SEP)),
    300,
  );

  // A trophy gets the recorded sting; everything else already made a sound
  // when it happened.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const packed of notices) {
      const [id, kind] = packed.split(SEP);
      if (!id || seen.current.has(id)) continue;
      seen.current.add(id);
      if (kind === 'trophy') templeAudio.playTrophy();
    }
    // The set would grow without bound over a three-hundred-hour session.
    if (seen.current.size > 200) seen.current = new Set([...seen.current].slice(-50));
  }, [notices]);

  if (notices.length === 0) return null;

  return (
    <div className="toj-toasts" aria-live="polite">
      {notices.map((packed) => {
        const [id, kind, icon, title, body] = packed.split(SEP);
        return (
          <button
            key={id}
            type="button"
            className="toj-toast"
            data-kind={kind}
            onClick={() => useTempleStore.getState().dismissNotice(Number(id))}
          >
            <span className="toj-toast-icon">
              <Glyph>{icon || '✨'}</Glyph>
            </span>
            <span>
              <span className="toj-toast-title">{title}</span>
              {body && <span className="toj-toast-body">{body}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
