/**
 * The Daily result's board line (RMH Music Phase 6, plan 1.2 and 1.8): once the scored run is
 * saved, one plain sentence says where it stands on the board (place, would place, not on the
 * board and why, hidden), with "Show it on the board" when the learner's board switch is off and
 * "See today's board". The line is the daily save's own `board` field (`initial`); nothing else is
 * requested. It mounts at the end of the result page once the save answers and fades in (M9), so
 * nothing above it moves.
 *
 * Nothing is asked unprompted: the switch changes only on the learner's tap, and the button says
 * beside it what the switch does (every Daily board, not only this one) and where it lives (the
 * board page and the Privacy page), so turning it on is never a surprise.
 */
import {
  useId,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ARRIVE } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import {
  setMusicSocialApi,
  type DailyBoardMe,
} from '@/lib/music-social/social.contract';
import { TEXT_BUTTON } from '../buttons';
import { boardStatusSentence } from './board-text';

export function DailyBoardLine({
  date,
  today,
  initial,
}: {
  date: string;
  today: string;
  /** The daily save's `board` field. */
  initial: DailyBoardMe;
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
    useState<DailyBoardMe>(
      initial,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const helpId =
    useId();
  const isToday =
    date ===
    today;

  function showOnBoard() {
    setBusy(
      true,
    );
    setFailed(
      false,
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
        (
          social,
        ) => {
          // A private line already carries where the run places with the learner counted: turning
          // the switch on puts it there.
          if (
            social.board &&
            me.state ===
              'private'
          )
            setMe(
              {
                state:
                  'ranked',
                rank: me.rank,
                total:
                  me.total,
                score:
                  me.score,
              },
            );
        },
      )
      .catch(
        () =>
          setFailed(
            true,
          ),
      )
      .finally(
        () =>
          setBusy(
            false,
          ),
      );
  }

  return (
    // Mounted once the save has answered, after the result painted: it arrives (M9).
    <div
      className={`space-y-1 ${ARRIVE}`}
    >
      <p
        role="status"
        className="text-base leading-6 text-app-text"
      >
        {boardStatusSentence(
          t,
          me,
          {
            day: isToday
              ? 'today'
              : 'yesterday',
            scope:
              'everyone',
          },
        )}
      </p>
      {me.state ===
      'private' ? (
        <div className="space-y-1">
          <button
            type="button"
            disabled={
              busy
            }
            aria-describedby={
              helpId
            }
            onClick={
              showOnBoard
            }
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
          <p
            id={
              helpId
            }
            className="text-sm leading-5 text-app-text-muted"
          >
            {t(
              'board-show-mine-help',
              {
                defaultValue:
                  'Shows your name, picture and score on every Daily board. Turn it off any time.',
              },
            )}{' '}
            <Link
              to="/settings/privacy"
              className="underline"
            >
              {t(
                'board-show-mine-where',
                {
                  defaultValue:
                    'Privacy settings',
                },
              )}
            </Link>
          </p>
          {failed ? (
            <p
              role="status"
              className="text-sm leading-5 text-app-danger"
            >
              {t(
                'board-switch-failed',
                {
                  defaultValue:
                    "Couldn't save. Try again.",
                },
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-5">
        <Link
          to="/rmhmusic/daily"
          search={
            isToday
              ? {}
              : {
                  day: 'yesterday',
                }
          }
          className={
            TEXT_BUTTON
          }
        >
          {isToday
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
