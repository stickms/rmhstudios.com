/**
 * SongList — `/rmhmusic/songs`: the songbook, one link per song in a list on rules: its title (a
 * proper name, shown as written), its composer ("Traditional" translated, a composer's name as
 * written) and the learner's bests in a plain sentence. The songs are static data, so the rows
 * render at once; only the third line waits for the bests, and it keeps its height while it does
 * (two lines on a phone, where the two modes' sentence wraps; one from `sm`), so nothing moves.
 */
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SONGS } from '@/lib/rmhmusic/learn/songs/catalog';
import {
  createApiSongSaver,
  type SongBest,
} from '@/lib/rmhmusic/learn/songs/saver';
import type { Song } from '@/lib/rmhmusic/learn/songs/score';
import { Shell } from '../LessonScreen';
import { useInputRelease } from '../useLearnInput';
import { composerName } from './song-text';

type T =
  ReturnType<
    typeof useTranslation
  >['t'];

const ROW =
  'flex min-h-20 w-full flex-col items-start justify-center px-4 py-2 text-start';

export function SongList() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const saver =
    useMemo(
      () =>
        createApiSongSaver(),
      [],
    );
  const [
    bests,
    setBests,
  ] =
    useState<
      | SongBest[]
      | null
    >(
      null,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  useInputRelease();

  useEffect(() => {
    let live = true;
    saver
      .bests()
      .then(
        (
          b,
        ) =>
          live &&
          setBests(
            b,
          ),
      )
      .catch(
        () => {
          if (
            !live
          )
            return;
          setBests(
            [],
          );
          setFailed(
            true,
          );
        },
      );
    return () => {
      live = false;
    };
  }, [
    saver,
  ]);

  return (
    <Shell
      title={t(
        'songs-title',
        {
          defaultValue:
            'Songs',
        },
      )}
      busy={
        bests ===
        null
      }
    >
      <p className="text-sm leading-6 text-app-text-muted">
        {t(
          'songs-intro',
          {
            defaultValue:
              'Read a melody from its score and play it: the cursor can wait for you, or keep time.',
          },
        )}
      </p>
      <ul className="rmm-sheet divide-y divide-app-border">
        {SONGS.map(
          (
            song,
          ) => (
            <li
              key={
                song.id
              }
            >
              <Link
                to="/rmhmusic/songs/$songId"
                params={{
                  songId:
                    song.id,
                }}
                className={`${ROW} rounded-app-sm transition-colors hover:bg-app-surface-hover`}
              >
                <span className="text-base leading-6 text-app-text">
                  {
                    song.title
                  }
                </span>
                <span className="text-sm leading-5 text-app-text-muted">
                  {composerName(
                    t,
                    song.composer,
                  )}
                </span>
                <span className="min-h-10 text-sm leading-5 text-app-text-muted sm:min-h-5">
                  {bests ===
                  null
                    ? ''
                    : failed
                      ? ''
                      : bestsSentence(
                          t,
                          song,
                          bests,
                        )}
                </span>
              </Link>
            </li>
          ),
        )}
      </ul>
      <p
        role="status"
        className="min-h-6 text-sm leading-6 text-app-text-muted"
      >
        {failed
          ? t(
              'songs-bests-failed',
              {
                defaultValue:
                  "Couldn't load your best scores.",
              },
            )
          : ''}
      </p>
    </Shell>
  );
}

function bestsSentence(
  t: T,
  song: Song,
  bests: readonly SongBest[],
): string {
  const wait =
    bests.find(
      (
        b,
      ) =>
        b.songId ===
          song.id &&
        b.mode ===
          'wait',
    )?.bestScore;
  const play =
    bests.find(
      (
        b,
      ) =>
        b.songId ===
          song.id &&
        b.mode ===
          'play',
    )?.bestScore;
  if (
    wait ===
      undefined &&
    play ===
      undefined
  )
    return t(
      'songs-row-new',
      {
        defaultValue:
          'Not played yet.',
      },
    );
  if (
    play ===
    undefined
  )
    return t(
      'songs-row-best-wait',
      {
        wait,
        defaultValue:
          'Wait for me: best {{wait}}.',
      },
    );
  if (
    wait ===
    undefined
  )
    return t(
      'songs-row-best-play',
      {
        play,
        defaultValue:
          'Play along: best {{play}}.',
      },
    );
  return t(
    'songs-row-best-both',
    {
      wait,
      play,
      defaultValue:
        'Wait for me: best {{wait}}. Play along: best {{play}}.',
    },
  );
}
