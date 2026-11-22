/**
 * The host's Disputes section (s06-20), at the top of the bracket: every match
 * whose result is disputed, with both claims and notes, and "Decide: X won / Y
 * won"; and every claim still waiting for confirmation past its window (the ones
 * the job leaves alone because settling them would finish the tournament).
 * Rows on rules; nothing here ticks.
 */
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { api } from '@/lib/contract/client';
import { decideMatchResultApi } from '@/lib/tournaments/match-results.contract';
import { DISPUTE_NOTE_MAX, claimExpired } from '@/lib/tournaments/match-results';
import { useClaimWhen } from '@/components/tournaments/MatchResultControls';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

interface Props {
  tournament: SerializedTournament;
  onChanged: () => Promise<void> | void;
}

export function DisputesPanel({ tournament, onChanged }: Props) {
  const { t } = useTranslation('match-results');
  const refusalText = useRefusalText();
  const prompt = usePrompt();
  const claimWhen = useClaimWhen();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (tournament.status !== 'LIVE') return null;

  const entrants = tournament.entrants ?? [];
  const nameOf = (id: string | null) =>
    entrants.find((e) => e.id === id)?.user?.name ??
    t('someone', {
      defaultValue: 'Someone',
    });
  const nameOfUser = (userId: string | null) =>
    entrants.find((e) => e.user?.id === userId)?.user?.name ??
    t('someone', {
      defaultValue: 'Someone',
    });

  const now = new Date();
  const rows = (tournament.matches ?? []).filter((m) => {
    if (m.state !== 'READY' && m.state !== 'LIVE') return false;
    if (m.disputed) return true;
    return !!m.claimedAt && !!m.claimedWinnerId && claimExpired(new Date(m.claimedAt), now);
  });
  if (rows.length === 0) return null;

  const decide = async (matchId: string, winnerEntrantId: string) => {
    const note = await prompt({
      title: t('decide-title', {
        defaultValue: 'Decide: {{name}} won',
        name: nameOf(winnerEntrantId),
      }),
      label: t('decide-note', {
        defaultValue: 'Note for the players (optional)',
      }),
      confirmLabel: t('decide-submit', {
        defaultValue: 'Decide',
      }),
      validate: (v) =>
        v.length > DISPUTE_NOTE_MAX
          ? t('dispute-too-long', {
              count: Number(DISPUTE_NOTE_MAX),
              defaultValue_one: 'Keep it to {{max}} character.',
              defaultValue: 'Keep it to {{max}} characters.',
              max: DISPUTE_NOTE_MAX,
            })
          : null,
    });
    if (note === null) return;
    setBusyId(matchId);
    try {
      await api(decideMatchResultApi, {
        params: {
          id: tournament.id,
          matchId,
        },
        body: {
          winnerEntrantId,
          note: note.trim() || undefined,
        },
      });
      toast.success(
        t('decided', {
          defaultValue: 'Result decided',
        }),
      );
      await onChanged();
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ??
          t('failed', {
            defaultValue: 'Something went wrong',
          }),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="disputes-heading" className="mb-6">
      <h2 id="disputes-heading" className="t-heading border-b border-site-border pb-2">
        {t('disputes', {
          defaultValue: 'Disputes',
        })}
      </h2>
      <ul>
        {rows.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 border-b border-site-border py-3">
            <p className="t-body">
              {t('versus', {
                defaultValue: '{{a}} vs {{b}}',
                a: nameOf(m.entrantAId),
                b: nameOf(m.entrantBId),
              })}
            </p>
            {m.claimedWinnerId && m.claimedAt && (
              <p className="t-meta">
                {t('claim-detail', {
                  defaultValue: '{{reporter}} reported {{winner}} won ({{when}})',
                  reporter: nameOfUser(m.claimedByUserId),
                  winner: nameOf(m.claimedWinnerId),
                  when: claimWhen(m.claimedAt),
                })}
              </p>
            )}
            {m.disputed ? (
              <p className="t-meta">
                {m.disputeNote
                  ? t('dispute-detail-note', {
                      defaultValue: '{{name}} disputed: {{note}}',
                      name: nameOfUser(m.disputedByUserId),
                      note: m.disputeNote,
                    })
                  : t('dispute-detail', {
                      defaultValue: '{{name}} disputed',
                      name: nameOfUser(m.disputedByUserId),
                    })}
              </p>
            ) : (
              <p className="t-meta">
                {t('waiting-for-confirmation-label', {
                  defaultValue: 'Waiting for confirmation',
                })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {[m.entrantAId, m.entrantBId].map((id) => (
                <Button
                  key={id}
                  size="xs"
                  variant="default"
                  loading={busyId === m.id}
                  onClick={() => id && decide(m.id, id)}
                >
                  {t('decide-won', {
                    defaultValue: 'Decide: {{name}} won',
                    name: nameOf(id),
                  })}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
