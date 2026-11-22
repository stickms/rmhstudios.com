/**
 * The Rounds view of a bracket (sprint 08, feature 16): one section per round, one row per match, on rules.
 *
 * Reads the same match data the tree reads (`roundsView` in `lib/tournaments/rounds-view.ts`). The viewer's own
 * matches come first in a section of their own. Each row is one sentence for a screen reader ("Round 2, match 3: Ada
 * against Bo, Ada won"); the players' names are never truncated and every control wraps below them.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchResultControls } from '@/components/tournaments/MatchResultControls';
import { MatchSchedule } from '@/components/tournaments/MatchSchedule';
import {
  matchStatus,
  roundsView,
  viewerEntrantId,
  type RoundLabel,
  type SectionId,
} from '@/lib/tournaments/rounds-view';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

type Entrant = NonNullable<SerializedTournament['entrants']>[number];
type Match = NonNullable<SerializedTournament['matches']>[number];

interface Props {
  tournament: SerializedTournament;
  canReport: boolean;
  reportingId: string | null;
  onReport: (matchId: string, winnerEntrantId: string) => void;
  viewerId?: string | null;
  onChanged?: () => Promise<void> | void;
}

export function RoundsView({ tournament, canReport, reportingId, onReport, viewerId = null, onChanged }: Props) {
  const { t } = useTranslation('bracket-list');
  const matches = useMemo(() => tournament.matches ?? [], [tournament.matches]);
  const entrants = useMemo(() => tournament.entrants ?? [], [tournament.entrants]);
  const byId = useMemo(() => new Map<string, Entrant>(entrants.map((e) => [e.id, e])), [entrants]);
  const mine = viewerEntrantId(entrants, viewerId);
  const data = useMemo(() => roundsView(matches, tournament.format, mine), [matches, tournament.format, mine]);
  // Where each match sits: its round's place in its section and its place in the round.
  const places = useMemo(() => {
    const map = new Map<string, { round: number; match: number }>();
    for (const s of data.sections)
      for (const r of s.rounds) r.matches.forEach((m, i) => map.set(m.id, { round: r.index, match: i + 1 }));
    return map;
  }, [data]);
  const showSeeds = tournament.format === 'SINGLE_ELIM' || tournament.format === 'DOUBLE_ELIM';

  if (matches.length === 0) {
    return (
      <p className="t-body text-site-text-muted py-6 text-center">
        {t('pending', { defaultValue: 'The bracket appears here once the host starts.' })}
      </p>
    );
  }

  const nameOf = (id: string | null) =>
    id ? (byId.get(id)?.user?.name ?? t('unknown', { defaultValue: 'TBD' })) : null;

  const labelText = (label: RoundLabel): string => {
    switch (label.kind) {
      case 'matches':
        return t('matches', { ns: 'c-tournaments', defaultValue: 'Matches' });
      case 'final':
        return t('final', { ns: 'c-tournaments', defaultValue: 'Final' });
      case 'semis':
        return t('semis', { ns: 'c-tournaments', defaultValue: 'Semifinals' });
      case 'quarters':
        return t('quarters', { ns: 'c-tournaments', defaultValue: 'Quarterfinals' });
      case 'round-n':
        return t('round-n', { ns: 'c-tournaments', defaultValue: 'Round {{n}}', n: label.n });
      case 'winners-final':
        return t('winners-final', { ns: 'double-elimination', defaultValue: 'Winners final' });
      case 'grand-final':
        return t('grand-final', { ns: 'double-elimination', defaultValue: 'Grand final' });
      case 'bracket-reset':
        return t('bracket-reset', { ns: 'double-elimination', defaultValue: 'Bracket reset' });
      case 'losers-round':
        return t('losers-round', { ns: 'double-elimination', defaultValue: 'Losers round {{n}}', n: label.n });
    }
  };

  const sectionTitle = (id: SectionId): string | null => {
    switch (id) {
      case 'W':
        return t('winners', { ns: 'double-elimination', defaultValue: 'Winners' });
      case 'L':
        return t('losers', { ns: 'double-elimination', defaultValue: 'Losers' });
      case 'F':
        return t('final', { ns: 'double-elimination', defaultValue: 'Final' });
      default:
        return null;
    }
  };

  const statusText = (m: Match): string => {
    switch (matchStatus(m)) {
      case 'bye':
        return t('status-bye', { defaultValue: 'Bye' });
      case 'cancelled':
        return t('status-cancelled', { defaultValue: 'Cancelled' });
      case 'done':
        return t('status-done', { defaultValue: 'Done' });
      case 'disputed':
        return t('status-disputed', { defaultValue: 'Disputed' });
      case 'waiting-result':
        return t('status-waiting-result', { defaultValue: 'Waiting for result' });
      case 'live':
        return t('status-live', { defaultValue: 'Live' });
      case 'ready':
        return t('status-ready', { defaultValue: 'Ready' });
      default:
        return t('status-waiting', { defaultValue: 'Waiting for players' });
    }
  };

  /** "Ada won", "Not played" or nothing yet. */
  const resultText = (m: Match): string => {
    if (m.winnerEntrantId && (m.state === 'COMPLETE' || m.state === 'BYE')) {
      return t('result-won', { defaultValue: '{{name}} won', name: nameOf(m.winnerEntrantId) });
    }
    if (m.state === 'CANCELLED') return t('result-not-played', { defaultValue: 'Not played' });
    return t('result-none', { defaultValue: 'Not played yet' });
  };

  const renderRow = (m: Match, scope: string) => {
    const place = places.get(m.id) ?? { round: m.round, match: m.slot + 1 };
    const byeWord = t('bye', { defaultValue: 'bye' });
    const sentence = t('match-sentence', {
      defaultValue: 'Round {{round}}, match {{match}}: {{a}} against {{b}}, {{result}}',
      round: place.round,
      match: place.match,
      a: nameOf(m.entrantAId) ?? byeWord,
      b: nameOf(m.entrantBId) ?? byeWord,
      result: resultText(m),
    });
    const ready = (m.state === 'READY' || m.state === 'LIVE') && !!m.entrantAId && !!m.entrantBId;
    const sideRow = (id: string | null) => {
      const won = !!m.winnerEntrantId && m.winnerEntrantId === id;
      const e = id ? byId.get(id) : undefined;
      return (
        <div className={`flex items-baseline gap-2 ${won ? 'font-semibold' : ''}`}>
          {showSeeds && e?.seed != null && <span className="t-meta tabular-nums">{e.seed}</span>}
          <span className={`t-body min-w-0 break-words ${id ? '' : 'text-site-text-muted italic'}`}>
            {id ? nameOf(id) : byeWord}
          </span>
          {won && <Trophy className="size-3.5 shrink-0 self-center" aria-hidden />}
          {e?.checkedIn && <span className="t-meta">{t('checked-in', { defaultValue: 'Checked in' })}</span>}
        </div>
      );
    };
    return (
      <li key={m.id} data-match-id={m.id} className="flex min-w-0 flex-col gap-2 border-b border-site-border py-3">
        <span className="sr-only">{sentence}</span>
        <div aria-hidden className="flex flex-col gap-1">
          {sideRow(m.entrantAId)}
          {sideRow(m.entrantBId)}
        </div>
        <p className="t-meta" aria-hidden>
          {statusText(m)} · {resultText(m)}
        </p>
        {canReport && ready && (
          <div className="flex flex-wrap gap-2">
            {[m.entrantAId, m.entrantBId].map((id) => (
              <Button
                key={id}
                size="xs"
                variant="default"
                className="h-auto min-h-7 min-w-0 max-w-full whitespace-normal py-1 text-start break-words"
                loading={reportingId === m.id}
                aria-label={t('report-winner-round', {
                  defaultValue: 'Report {{name}} won, round {{round}}, match {{match}}',
                  name: nameOf(id),
                  round: place.round,
                  match: place.match,
                })}
                onClick={() => id && onReport(m.id, id)}
              >
                {nameOf(id)}
              </Button>
            ))}
          </div>
        )}
        {onChanged && (
          <div className="flex min-w-0 flex-col gap-2">
            <MatchSchedule
              tournamentId={tournament.id}
              tournamentStatus={tournament.status}
              match={m}
              entrants={entrants}
              viewerId={viewerId}
              isManager={canReport}
              onChanged={onChanged}
              idScope={scope}
            />
            <MatchResultControls
              tournamentId={tournament.id}
              match={m}
              entrants={entrants}
              viewerId={viewerId}
              isManager={canReport}
              onChanged={onChanged}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="rounds-view">
      {data.yours.length > 0 && (
        <section aria-labelledby="rounds-yours" className="flex flex-col">
          <h3 id="rounds-yours" className="t-heading">
            {t('your-matches', { defaultValue: 'Your matches' })}
          </h3>
          <ul className="flex flex-col">{data.yours.map((m) => renderRow(m, 'rounds-yours-'))}</ul>
        </section>
      )}
      {data.sections.map((section) => {
        const title = sectionTitle(section.id);
        return (
          <section key={section.id} className="flex min-w-0 flex-col gap-6">
            {title && (
              <h2 id={`rounds-section-${section.id}`} className="t-heading">
                {title}
              </h2>
            )}
            {section.rounds.map((round) => {
              const label = labelText(round.label);
              const heading =
                round.numbered && round.label.kind !== 'round-n'
                  ? t('round-heading', { defaultValue: 'Round {{n}} · {{label}}', n: round.index, label })
                  : label;
              const id = `rounds-${section.id}-${round.round}`;
              return (
                <section key={round.round} aria-labelledby={id} className="flex min-w-0 flex-col">
                  <h3 id={id} className="t-label">
                    {heading}
                  </h3>
                  <ul className="flex flex-col">{round.matches.map((m) => renderRow(m, 'rounds-'))}</ul>
                </section>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
