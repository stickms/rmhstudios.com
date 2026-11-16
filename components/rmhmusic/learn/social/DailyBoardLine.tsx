/**
 * The Daily result's board line (RMH Music Phase 6, plan 1.2 and 1.8): once the scored run is
 * saved, one plain sentence says where it stands on the board (place, would place, not on the
 * board and why, hidden), with "Show it on the board" when the learner's board switch is off and
 * "See today's board". It sits at the end of the result page and fades in (M9), so nothing above it
 * moves. Nothing is asked unprompted: the switch changes only on the learner's tap.
 */
import {
  useEffect,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import {
  dailyBoardApi,
  setMusicSocialApi,
  type DailyBoardMe,
} from '@/lib/rmhmusic/learn/social/social.contract';
import { TEXT_BUTTON } from '../buttons';
import { boardStatusSentence } from './board-text';

export function DailyBoardLine({
  date,
  today,
}: {
  date: string;
  today: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const [
    me,
    setMe,
  ] =
    useState<DailyBoardMe | null>(
      null,
    );
  const [
    nonce,
    setNonce,
  ] =
    useState(
      0,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const arrival =
    useArrival(
      me !==
        null,
    );

  useEffect(() => {
    let live = true;
    api(
      dailyBoardApi,
      {
        query:
          {
            date,
            scope:
              'everyone',
          },
      },
    )
      .then(
        (
          b,
        ) => {
          if (
            live
          )
            setMe(
              b.me,
            );
        },
      )
      .catch(
        () => {
          // The result stands without the line; the board page says the rest.
        },
      );
    return () => {
      live = false;
    };
  }, [
    date,
    nonce,
  ]);

  if (
    !me
  )
    return null;
  return (
    <div
      className={`space-y-1 ${arrival ?? ''}`}
    >
      <p
        role="status"
        className="text-base leading-6 text-app-text"
      >
        {boardStatusSentence(
          t,
          me,
        )}
      </p>
      <div className="flex flex-wrap gap-x-5">
        {me.state ===
        'private' ? (
          <button
            type="button"
            disabled={
              busy
            }
            onClick={() => {
              setBusy(
                true,
              );
              api(
                setMusicSocialApi,
                {
                  body: {
                    board: true,
                  },
                },
              )
                .then(
                  () =>
                    setNonce(
                      (
                        n,
                      ) =>
                        n +
                        1,
                    ),
                )
                .catch(
                  () =>
                    setNonce(
                      (
                        n,
                      ) =>
                        n +
                        1,
                    ),
                )
                .finally(
                  () =>
                    setBusy(
                      false,
                    ),
                );
            }}
            className={
              TEXT_BUTTON
            }
          >
            {t(
              'board-show-mine',
              {
                defaultValue:
                  'Show it on the board',
              },
            )}
          </button>
        ) : null}
        <Link
          to="/rmhmusic/daily"
          search={
            date ===
            today
              ? {}
              : {
                  day: 'yesterday',
                }
          }
          className={
            TEXT_BUTTON
          }
        >
          {date ===
          today
            ? t(
                'board-see-today',
                {
                  defaultValue:
                    "See today's board",
                },
              )
            : t(
                'board-see-yesterday',
                {
                  defaultValue:
                    "See yesterday's board",
                },
              )}
        </Link>
      </div>
    </div>
  );
}
