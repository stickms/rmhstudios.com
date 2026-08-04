/**
 * "You have two saves. Which one is the real one?"
 *
 * Shown only when the copy on this device and the copy on the account have
 * genuinely diverged — each is ahead of the other on something, so neither is a
 * continuation of the other and no rule can pick without throwing away a run
 * somebody played. See `lib/game-saves/conflict.ts` for why every automatic rule
 * is worse than asking.
 *
 * Two decisions shape this component:
 *
 * 1. **It cannot be dismissed.** No Escape, no scrim click, no close button.
 *    Every exit from this dialog is a choice, because the alternative — letting
 *    someone tap past it — drops them into a game that is autosaving over one of
 *    the two saves within thirty seconds, and they never find out which.
 * 2. **It says what is lost, in figures.** "Local" and "Cloud" mean nothing to a
 *    player; "40 hours, 12 ascensions, saved 3 days ago" is the same choice
 *    made possible. The game supplies those lines — see `SaveSummary`.
 *
 * Painted with `--app-*` tokens and literal fallbacks, so it works inside an
 * `.app-theme` app and equally inside a game with its own palette and no app
 * chrome (Temple of Joy renders it over its own ground).
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, HardDrive } from 'lucide-react';
import type { SaveOrigin, SaveSummary } from '@/lib/game-saves/conflict';

export interface SaveConflictDialogProps {
  /** What is on this device. */
  local: SaveSummary;
  /** What is on the account. */
  cloud: SaveSummary;
  /** Called with the side the player kept. The other is overwritten. */
  onChoose: (origin: SaveOrigin) => void;
  /** The game's name, for the explanation. */
  gameName?: string;
}

export function SaveConflictDialog({ local, cloud, onChoose, gameName }: SaveConflictDialogProps) {
  const { t } = useTranslation('shared');
  const ref = useRef<HTMLDivElement>(null);
  /** Latches on the first choice: two taps must not fire two commits. */
  const [chosen, setChosen] = useState<SaveOrigin | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  const choose = (origin: SaveOrigin) => {
    if (chosen) return;
    setChosen(origin);
    onChoose(origin);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-conflict-title"
      className="app-overlay fixed inset-0 z-50 flex items-center-safe justify-center-safe overflow-y-auto p-4"
      style={{ background: 'var(--app-scrim, rgb(0 0 0 / 0.72))' }}
    >
      <div
        ref={ref}
        className="app-modal w-full max-w-2xl p-5 sm:p-6"
        style={{
          background: 'var(--app-surface, #27282c)',
          color: 'var(--app-text, #e8e8ec)',
          border: '1px solid var(--app-border, #3a3b42)',
          borderRadius: 'var(--app-radius-lg, 16px)',
          boxShadow: 'var(--app-shadow, 0 24px 60px rgb(0 0 0 / 0.45))',
          fontFamily: 'var(--app-font-body, inherit)',
        }}
      >
        <h2
          id="save-conflict-title"
          className="text-lg font-semibold sm:text-xl"
          style={{ fontFamily: 'var(--app-font-display, inherit)' }}
        >
          {/* Deliberately not naming the game: this string is shared by every
              game on the site, and the game's own name is in the sentence
              below where it can be interpolated. */}
          {t('save-conflict-title', { defaultValue: 'You have two saves' })}
        </h2>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
          {gameName
            ? t('save-conflict-text-named', {
                game: gameName,
                defaultValue:
                  'This device and your account each hold a different {{game}} save, and neither one contains the other — you played in both places. Pick the one to keep. The other is replaced and cannot be recovered.',
              })
            : t('save-conflict-text', {
                defaultValue:
                  'This device and your account each hold a different save, and neither one contains the other — you played in both places. Pick the one to keep. The other is replaced and cannot be recovered.',
              })}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SaveCard
            summary={cloud}
            origin="cloud"
            title={t('save-conflict-cloud', { defaultValue: 'On your account' })}
            note={t('save-conflict-cloud-note', {
              defaultValue: 'Follows you to every device.',
            })}
            busy={chosen != null}
            picked={chosen === 'cloud'}
            onChoose={choose}
          />
          <SaveCard
            summary={local}
            origin="local"
            title={t('save-conflict-local', { defaultValue: 'On this device' })}
            note={t('save-conflict-local-note', {
              defaultValue: 'Played here, signed out or offline.',
            })}
            busy={chosen != null}
            picked={chosen === 'local'}
            onChoose={choose}
          />
        </div>
      </div>
    </div>
  );
}

function SaveCard({
  summary,
  origin,
  title,
  note,
  busy,
  picked,
  onChoose,
}: {
  summary: SaveSummary;
  origin: SaveOrigin;
  title: string;
  note: string;
  busy: boolean;
  picked: boolean;
  onChoose: (origin: SaveOrigin) => void;
}) {
  const { t } = useTranslation('shared');
  const Icon = origin === 'cloud' ? CloudDownload : HardDrive;

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        background: 'var(--app-bg-subtle, #202124)',
        border: `1px solid ${picked ? 'var(--app-accent, #6ea8d9)' : 'var(--app-border, #3a3b42)'}`,
        borderRadius: 'var(--app-radius, 12px)',
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden style={{ color: 'var(--app-accent, #6ea8d9)' }} />
        <span className="text-sm font-semibold">{title}</span>
      </div>

      <p className="text-2xl font-semibold tabular-nums" style={{ fontFamily: 'var(--app-font-display, inherit)' }}>
        {summary.headline}
      </p>

      <dl className="flex flex-col gap-1 text-sm">
        {summary.lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3">
            <dt style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>{line.label}</dt>
            <dd className="font-medium tabular-nums">{line.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3">
          <dt style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
            {t('save-conflict-saved', { defaultValue: 'Last saved' })}
          </dt>
          <dd className="font-medium">
            <RelativeTime at={summary.savedAt} />
          </dd>
        </div>
      </dl>

      <p className="text-xs" style={{ color: 'var(--app-text-dim, #6a6b74)' }}>
        {note}
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose(origin)}
        className="mt-auto w-full px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
        style={{
          background: 'var(--app-accent, #6ea8d9)',
          color: 'var(--app-accent-fg, #06121c)',
          borderRadius: 'var(--app-radius-sm, 8px)',
        }}
      >
        {picked
          ? t('save-conflict-keeping', { defaultValue: 'Keeping this one…' })
          : t('save-conflict-keep', { defaultValue: 'Keep this one' })}
      </button>
    </div>
  );
}

/**
 * "3 days ago", in the player's own locale.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled ladder of if-statements,
 * because this string is one of two things a person is comparing and the
 * comparison has to survive translation. An unknown timestamp (a save format
 * with no clock in it, read before this device ever wrote one) says so rather
 * than claiming the epoch.
 */
function RelativeTime({ at }: { at: number }) {
  const { t, i18n } = useTranslation('shared');
  if (!at) return <>{t('save-conflict-unknown', { defaultValue: 'unknown' })}</>;

  const seconds = Math.round((at - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  const format = new Intl.RelativeTimeFormat(i18n.language || 'en', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return <>{format.format(Math.round(seconds / size), unit)}</>;
  }
  return <>{format.format(seconds, 'second')}</>;
}
