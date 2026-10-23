/**
 * PipelineLadder — the signature page structure.
 *
 * Application stages are rungs on a full-height two-rail ladder, climbed
 * bottom→top; Offer is the top rung and carries the app's only celebratory
 * treatment. Rejected/withdrawn cards rest in a quiet side gutter,
 * off the ladder. Arrow-up/down on a focused card moves it a rung.
 */

import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

type AnyRow = Record<string, unknown>;

/** Bottom → top climb order. */
export const CLIMB_STAGES = [
  'not_applied',
  'planning',
  'applied',
  'networking',
  'interviewing',
  'final_round',
  'offer',
] as const;

export type ClimbStage = (typeof CLIMB_STAGES)[number];
export const OFF_LADDER = ['rejected', 'withdrawn'] as const;

export const STAGE_LABELS: Record<string, string> = {
  not_applied: 'Not applied',
  planning: 'Planning',
  applied: 'Applied',
  networking: 'Networking',
  interviewing: 'Interviewing',
  final_round: 'Final round',
  offer: '※ Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function nextStage(current: string, direction: 1 | -1): ClimbStage | null {
  const idx = CLIMB_STAGES.indexOf(current as ClimbStage);
  if (idx === -1) return null;
  const next = idx + direction;
  if (next < 0 || next >= CLIMB_STAGES.length) return null;
  return CLIMB_STAGES[next];
}

function ApplicationCard({
  app,
  selected,
  onSelect,
  onMove,
}: {
  app: AnyRow;
  selected: boolean;
  onSelect: (app: AnyRow) => void;
  onMove: (app: AnyRow, direction: 1 | -1) => void;
}) {
  const job = app.job as AnyRow | undefined;
  const { t } = useTranslation('site');
  const company = (job?.company as AnyRow | undefined)?.name as string | undefined;

  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMove(app, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMove(app, -1);
    }
  }

  return (
    <button
      type="button"
      className={`rl-app-card glass-fill rounded-site-sm${selected ? ' rl-app-card--selected' : ''}`}
      data-app-id={app.id as string}
      onClick={() => onSelect(app)}
      onKeyDown={handleKey}
      aria-label={t('ladder.pipeline.cardLabel', {
        defaultValue: '{{title}}{{company}} — {{stage}}. Arrow up or down moves stage.',
        title: (job?.title as string) ?? t('ladder.pipeline.application', { defaultValue: 'Application' }),
        company: company ? ` ${t('ladder.pipeline.at', { defaultValue: 'at' })} ${company}` : '',
        stage: STAGE_LABELS[app.status as string],
      })}
    >
      <span className="rl-app-card__company">{company ?? '—'}</span>
      <span className="rl-app-card__title">{(job?.title as string) ?? t('ladder.pipeline.untitled', { defaultValue: 'Untitled role' })}</span>
      {app.appliedDate ? (
        <span className="rl-mono rl-app-card__date">
          {new Date(app.appliedDate as Date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      ) : null}
    </button>
  );
}

export function PipelineLadder({
  applications,
  selectedId,
  onSelect,
  onMove,
}: {
  applications: AnyRow[];
  selectedId: string | null;
  onSelect: (app: AnyRow) => void;
  onMove: (app: AnyRow, direction: 1 | -1) => void;
}) {
  const { t } = useTranslation('site');
  const byStage = new Map<string, AnyRow[]>();
  for (const app of applications) {
    const key = app.status as string;
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key)!.push(app);
  }
  const offLadder = OFF_LADDER.flatMap((s) => byStage.get(s) ?? []);
  // Render top→bottom so Offer sits at the top of the ladder
  const stagesTopDown = [...CLIMB_STAGES].reverse();

  return (
    <div className="rl-pipeline">
      <div className="rl-ladder" role="list" aria-label={t('ladder.pipeline.ladderLabel', { defaultValue: 'Application ladder, bottom to top' })}>
        {stagesTopDown.map((stage) => {
          const apps = byStage.get(stage) ?? [];
          const isOffer = stage === 'offer';
          return (
            <div
              key={stage}
              role="listitem"
              className={`rl-ladder__rung${isOffer ? ' rl-ladder__rung--offer' : ''}`}
            >
              <span className={`rl-ladder__label${isOffer ? ' rl-ladder__label--offer' : ' rl-label'}`}>
                {STAGE_LABELS[stage]}
                {apps.length > 0 && (
                  <span className="rl-mono rl-ladder__count"> · {apps.length}</span>
                )}
              </span>
              <div className="rl-ladder__cards">
                {apps.map((app) => (
                  <ApplicationCard
                    key={app.id as string}
                    app={app}
                    selected={selectedId === app.id}
                    onSelect={onSelect}
                    onMove={onMove}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <aside
        className="rl-off-ladder rounded-site"
        aria-label={t('ladder.pipeline.offLadder', { defaultValue: 'Off the ladder' })}
      >
        <p className="rl-label">{t('ladder.pipeline.offLadderTitle', { defaultValue: 'Off the ladder' })}</p>
        {offLadder.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('ladder.pipeline.offLadderEmpty', { defaultValue: 'Nothing here. Keep climbing.' })}
          </p>
        ) : (
          offLadder.map((app) => (
            <ApplicationCard
              key={app.id as string}
              app={app}
              selected={selectedId === app.id}
              onSelect={onSelect}
              onMove={onMove}
            />
          ))
        )}
      </aside>
    </div>
  );
}
