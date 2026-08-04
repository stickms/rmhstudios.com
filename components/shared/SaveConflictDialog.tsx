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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, HardDrive } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  // Cards need BOTH dimensions: 26rem of width to sit side by side, and 30rem
  // of height to hold a heading, a headline, five figures, a note and a button
  // without the button falling off the bottom. A phone in landscape has the
  // width and not the height — measured, at 844x390 and 568x320, with both
  // "Keep" buttons below the fold — so it gets the table like a narrow phone
  // does. See the note at the call site.
  const wide = useMediaQuery('(min-width: 26rem) and (min-height: 30rem)');

  const cloudTitle = t('save-conflict-cloud', { defaultValue: 'On your account' });
  const localTitle = t('save-conflict-local', { defaultValue: 'On this device' });
  const cloudNote = t('save-conflict-cloud-note', {
    defaultValue: 'Follows you to every device.',
  });
  const localNote = t('save-conflict-local-note', {
    defaultValue: 'Played here, signed out or offline.',
  });

  useEffect(() => {
    // `preventScroll`, and it is load-bearing on a short screen: the body below
    // scrolls, and focusing the first button scrolled it into view — which on a
    // 320px-tall landscape phone dragged both cards' headings off the top, so
    // the dialog opened showing two unlabelled columns of figures.
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
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
      className="app-overlay fixed inset-0 z-50 flex items-center-safe justify-center-safe p-3 sm:p-4"
      style={{ background: 'var(--app-scrim, rgb(0 0 0 / 0.72))' }}
    >
      {/*
        A column with a fixed head and a scrolling body, capped to the viewport.
        It used to be one block inside a scrolling scrim, and on a phone that put
        the whole question off screen: at 320×568 the second card started below
        the fold, so the one dialog whose entire job is *comparing two things*
        showed one of them; at 568×320 the scrim scrolled the title away
        entirely and left two unlabelled cards. Capping the height and scrolling
        the body instead keeps the question visible whatever happens below it.

        `dvh`, so the box does not jump when mobile Safari rolls its toolbar
        away mid-scroll.
      */}
      <div
        ref={ref}
        className="app-modal flex w-full max-w-2xl flex-col overflow-hidden"
        style={{
          maxHeight: 'calc(100dvh - 1.5rem)',
          background: 'var(--app-surface, #27282c)',
          color: 'var(--app-text, #e8e8ec)',
          border: '1px solid var(--app-border, #3a3b42)',
          borderRadius: 'var(--app-radius-lg, 16px)',
          boxShadow: 'var(--app-shadow, 0 24px 60px rgb(0 0 0 / 0.45))',
          fontFamily: 'var(--app-font-body, inherit)',
        }}
      >
        <div
          className={
            wide ? 'shrink-0 p-4 pb-3 sm:p-6 sm:pb-4' : 'shrink-0 px-3 pt-3 pb-2 sm:px-4'
          }
        >
          <h2
            id="save-conflict-title"
            className={wide ? 'text-base font-semibold sm:text-xl' : 'text-sm font-semibold'}
            style={{ fontFamily: 'var(--app-font-display, inherit)' }}
          >
            {/* Deliberately not naming the game: this string is shared by every
                game on the site, and the game's own name is in the sentence
                below where it can be interpolated. */}
            {t('save-conflict-title', { defaultValue: 'You have two saves' })}
          </h2>

          <p
            className={
              wide
                ? 'mt-2 text-xs leading-relaxed sm:text-sm'
                : 'mt-1 text-[0.7rem] leading-snug'
            }
            style={{ color: 'var(--app-text-muted, #9a9ba4)' }}
          >
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
        </div>

        {/*
          Two shapes for one question, chosen by how much width there is.

          Wide enough for two cards (26rem — every phone in landscape, and a
          tablet), they are cards: each save reads as an object you pick up.
          Narrower than that — which is most phones held upright — two cards
          stack, and a comparison you have to scroll between is not a
          comparison. So below 26rem it becomes a table: one row per figure,
          one column per save, both values on the same line where the eye can
          actually do the subtraction.
        */}
        <div
          className={
            wide
              ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6'
              : 'min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4'
          }
        >
          {wide ? (
            <div className="grid grid-cols-2 gap-3">
              <SaveCard
                summary={cloud}
                origin="cloud"
                title={cloudTitle}
                note={cloudNote}
                busy={chosen != null}
                picked={chosen === 'cloud'}
                onChoose={choose}
              />
              <SaveCard
                summary={local}
                origin="local"
                title={localTitle}
                note={localNote}
                busy={chosen != null}
                picked={chosen === 'local'}
                onChoose={choose}
              />
            </div>
          ) : (
            <CompareTable
              cloud={cloud}
              local={local}
              cloudTitle={cloudTitle}
              localTitle={localTitle}
              busy={chosen != null}
              chosen={chosen}
              onChoose={choose}
            />
          )}
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
      className="flex flex-col gap-2 p-3 sm:gap-3 sm:p-4"
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

      {/*
        `break-words` and no `whitespace-nowrap`: the headline is a game's own
        figure, and some of them are long ("4.000 Qa joy, all time") in a column
        that is 175px wide on a small phone. It wraps rather than overflowing the
        card, which is why the card is a column and not a fixed-height box.
      */}
      <p
        className="text-xl font-semibold tabular-nums break-words sm:text-2xl"
        style={{ fontFamily: 'var(--app-font-display, inherit)' }}
      >
        <bdi>{summary.headline}</bdi>
      </p>

      <dl className="flex flex-col gap-1 text-xs sm:text-sm">
        {summary.lines.map((line) => (
          <Figure key={line.label} label={line.label} value={line.value} />
        ))}
        <Figure
          label={t('save-conflict-saved', { defaultValue: 'Last saved' })}
          value={<RelativeTime at={summary.savedAt} />}
        />
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
 * The narrow-screen shape: one row per figure, one column per save.
 *
 * The two summaries come from the same game's builder, so their lines are the
 * same fields in the same order — but this zips by INDEX and takes the label
 * from whichever side has one, rather than assuming both do. A game whose
 * summary is conditional (a line that only appears once a mechanic exists)
 * would otherwise line up "Ascensions" against "Trophies" and read as a
 * comparison of two different things, which is worse than showing nothing.
 */
function CompareTable({
  cloud,
  local,
  cloudTitle,
  localTitle,
  busy,
  chosen,
  onChoose,
}: {
  cloud: SaveSummary;
  local: SaveSummary;
  cloudTitle: string;
  localTitle: string;
  busy: boolean;
  chosen: SaveOrigin | null;
  onChoose: (origin: SaveOrigin) => void;
}) {
  const { t } = useTranslation('shared');
  const rows = Math.max(cloud.lines.length, local.lines.length);

  const head =
    'pb-2 text-start text-xs font-semibold align-bottom';
  const cell = 'py-0.5 text-end text-xs font-medium tabular-nums';
  const muted = { color: 'var(--app-text-muted, #9a9ba4)' };

  return (
    <div
      className="p-3"
      style={{
        background: 'var(--app-bg-subtle, #202124)',
        border: '1px solid var(--app-border, #3a3b42)',
        borderRadius: 'var(--app-radius, 12px)',
      }}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td />
            <th scope="col" className={`${head} text-end`}>
              <span className="inline-flex items-center gap-1">
                <CloudDownload
                  className="size-3.5 shrink-0"
                  aria-hidden
                  style={{ color: 'var(--app-accent, #6ea8d9)' }}
                />
                {cloudTitle}
              </span>
            </th>
            <th scope="col" className={`${head} text-end`}>
              <span className="inline-flex items-center gap-1">
                <HardDrive
                  className="size-3.5 shrink-0"
                  aria-hidden
                  style={{ color: 'var(--app-accent, #6ea8d9)' }}
                />
                {localTitle}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="py-0.5 text-start text-xs font-normal" style={muted}>
              {t('save-conflict-progress', { defaultValue: 'Progress' })}
            </th>
            <td className={`${cell} font-semibold`}>
              <bdi>{cloud.headline}</bdi>
            </td>
            <td className={`${cell} font-semibold`}>
              <bdi>{local.headline}</bdi>
            </td>
          </tr>

          {Array.from({ length: rows }, (_, i) => {
            const label = cloud.lines[i]?.label ?? local.lines[i]?.label ?? '';
            return (
              <tr key={label || i}>
                <th scope="row" className="py-0.5 text-start text-xs font-normal" style={muted}>
                  {label}
                </th>
                <td className={cell}>
                  <bdi>{cloud.lines[i]?.value ?? '—'}</bdi>
                </td>
                <td className={cell}>
                  <bdi>{local.lines[i]?.value ?? '—'}</bdi>
                </td>
              </tr>
            );
          })}

          <tr>
            <th scope="row" className="py-0.5 text-start text-xs font-normal" style={muted}>
              {t('save-conflict-saved', { defaultValue: 'Last saved' })}
            </th>
            <td className={cell}>
              <RelativeTime at={cloud.savedAt} />
            </td>
            <td className={cell}>
              <RelativeTime at={local.savedAt} />
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <KeepButton
          origin="cloud"
          label={cloudTitle}
          busy={busy}
          picked={chosen === 'cloud'}
          onChoose={onChoose}
        />
        <KeepButton
          origin="local"
          label={localTitle}
          busy={busy}
          picked={chosen === 'local'}
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

/**
 * "Keep" for one side.
 *
 * The visible word is the column's own name rather than "Keep this one",
 * because under a table there is no "this" — the button is not inside the thing
 * it refers to. The full sentence goes to `aria-label` so the two buttons are
 * still distinguishable read out of context.
 */
function KeepButton({
  origin,
  label,
  busy,
  picked,
  onChoose,
}: {
  origin: SaveOrigin;
  label: string;
  busy: boolean;
  picked: boolean;
  onChoose: (origin: SaveOrigin) => void;
}) {
  const { t } = useTranslation('shared');
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onChoose(origin)}
      aria-label={t('save-conflict-keep-named', {
        which: label,
        defaultValue: 'Keep the save {{which}}',
      })}
      className="w-full px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
      style={{
        background: 'var(--app-accent, #6ea8d9)',
        color: 'var(--app-accent-fg, #06121c)',
        borderRadius: 'var(--app-radius-sm, 8px)',
      }}
    >
      {picked ? t('save-conflict-keeping', { defaultValue: 'Keeping this one…' }) : label}
    </button>
  );
}

/**
 * One label/value row.
 *
 * The label is allowed to wrap and the value is not: "Time in the temple" is
 * three words in English and routinely five or a compound noun elsewhere, in a
 * column that can be 175px wide. Letting the label take two lines keeps the
 * figure beside it whole, which is the half a person is actually comparing.
 *
 * `justify-between` and logical padding do the mirroring for free in `ar`/`ur` —
 * there is no `left`/`right` anywhere in this component.
 */
function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="min-w-0" style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
        {label}
      </dt>
      <dd className="shrink-0 font-medium tabular-nums">
        <bdi>{value}</bdi>
      </dd>
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
