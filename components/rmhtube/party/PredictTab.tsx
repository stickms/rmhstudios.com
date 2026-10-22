'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { usePartyStore } from '@/lib/rmhtube/party-store';
import { btn, btnPrimary, input, muted } from './ui';

export default function PredictTab() {
  const { t } = useTranslation('f-watch');
  const party = usePartyStore((s) => s.party);
  const me = useRmhTubeStore((s) => s.room?.myUserId ?? '');
  const isHost = useRmhTubeStore((s) => s.room?.hostUserId === s.room?.myUserId);
  const [question, setQuestion] = useState('');
  const [stake, setStake] = useState(10);

  const pred = party?.prediction ?? null;
  const balance = party?.points[me]?.points ?? 0;
  const myPick = pred?.picks[me];
  const totals = { yes: 0, no: 0 };
  for (const p of Object.values(pred?.picks ?? {})) totals[p.choice] += p.points;
  const board = Object.entries(party?.points ?? {}).sort((a, b) => b[1].points - a[1].points);

  return (
    <div className="space-y-4">
      <p className={muted}>
        {t('predict-hint', {
          defaultValue: 'Play with session points, not coins. Everyone starts with 100.',
        })}
      </p>

      {isHost && pred?.status !== 'open' && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length < 3) return;
            emit(C2S.PARTY_PREDICT_OPEN, { question: question.trim() });
            setQuestion('');
          }}
        >
          <input
            className={input}
            value={question}
            maxLength={120}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('predict-ask-placeholder', { defaultValue: 'Does the hero survive?' })}
            aria-label={t('predict-ask-label', { defaultValue: 'Yes/no question' })}
          />
          <button type="submit" className={btnPrimary}>
            {t('predict-ask', { defaultValue: 'Ask' })}
          </button>
        </form>
      )}

      {pred && (
        <div className="space-y-2 rounded-(--app-radius-sm) border border-(--app-border) p-3">
          <p className="font-medium">{pred.question}</p>
          <p className={muted}>
            {t('predict-totals', {
              defaultValue: 'Yes {{yes}} pts · No {{no}} pts',
              yes: totals.yes,
              no: totals.no,
            })}
          </p>
          {pred.status === 'open' && !myPick && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={balance}
                value={stake}
                onChange={(e) => setStake(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className={`${input} w-20`}
                aria-label={t('predict-stake', { defaultValue: 'Points to stake' })}
              />
              {(['yes', 'no'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={btn}
                  disabled={stake > balance}
                  onClick={() => emit(C2S.PARTY_PREDICT_PICK, { choice, points: stake })}
                >
                  {choice === 'yes'
                    ? t('yes', { defaultValue: 'Yes' })
                    : t('no', { defaultValue: 'No' })}
                </button>
              ))}
            </div>
          )}
          {myPick && (
            <p className={muted}>
              {t('predict-your-pick', {
                defaultValue: 'You picked {{choice}} for {{points}} pts.',
                choice:
                  myPick.choice === 'yes'
                    ? t('yes', { defaultValue: 'Yes' })
                    : t('no', { defaultValue: 'No' }),
                points: myPick.points,
              })}
            </p>
          )}
          {pred.status === 'resolved' && (
            <p className="font-medium">
              {pred.outcome === 'yes'
                ? t('predict-resolved-yes', { defaultValue: 'Result: Yes' })
                : t('predict-resolved-no', { defaultValue: 'Result: No' })}
            </p>
          )}
          {pred.status === 'cancelled' && (
            <p className={muted}>
              {t('predict-cancelled', { defaultValue: 'Cancelled — points refunded.' })}
            </p>
          )}
          {isHost && pred.status === 'open' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => emit(C2S.PARTY_PREDICT_RESOLVE, { outcome: 'yes' })}
              >
                {t('predict-resolve-yes', { defaultValue: 'Resolve Yes' })}
              </button>
              <button
                type="button"
                className={btnPrimary}
                onClick={() => emit(C2S.PARTY_PREDICT_RESOLVE, { outcome: 'no' })}
              >
                {t('predict-resolve-no', { defaultValue: 'Resolve No' })}
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => emit(C2S.PARTY_PREDICT_RESOLVE, { outcome: 'cancel' })}
              >
                {t('predict-cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          )}
        </div>
      )}
      {!pred && !isHost && (
        <p className={muted}>
          {t('predict-waiting', { defaultValue: 'Waiting for the host to ask a question.' })}
        </p>
      )}

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--app-text-dim)">
          {t('leaderboard', { defaultValue: 'Room leaderboard' })}
        </h4>
        <ol className="space-y-1">
          {board.map(([id, row], i) => (
            <li key={id} className="flex justify-between gap-2">
              <span className="truncate">
                {i + 1}. {row.name}
              </span>
              <span className="tabular-nums text-(--app-text-muted)">{row.points}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
