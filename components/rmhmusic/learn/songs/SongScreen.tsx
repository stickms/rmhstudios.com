/**
 * SongScreen — `/rmhmusic/songs/$songId`: one song of the songbook, read from its score and played.
 * Two ways to play, switched with the sanctioned `<Tabs dense>`:
 *
 * - **Wait for me:** the cursor waits on each note until the right one is played.
 * - **Play along:** a bar of metronome clicks counts in, then the cursor moves in time and every
 *   note is scored by pitch and timing.
 *
 * The run is the pure machine `lib/rmhmusic/learn/songs/machine.ts` (held by `useMachine`); this
 * file carries out its effects. **Time:** note events carry the input adapters' own
 * `performance.now()` stamps, and the metronome's `onBeat` gives each click's time on the same
 * clock; the first click fixes the beat grid (`begin`). The screen sends `tick` at the machine's
 * `nextDue` with one `setTimeout` at a time while a play-along run is under way, so nothing runs at
 * rest and there is no animation frame. A play-along run is dropped (Start again) when the tab is
 * hidden or the window is away long enough for timers to be throttled (`watchAway`), when the
 * Change input dialog opens, or when sound stops; the metronome stops with it, on unmount too.
 *
 * The version follows the learner's instrument: piano plays the staff as written; guitar reads the
 * same staff with the octave clef, sounds an octave lower and shows the tab. "Hear it" plays the
 * four-bar phrase the cursor is in through the learner's sound; notes are not taken while it
 * sounds (and its echo tail, for the microphone). "Slower" plays at two thirds of the tempo.
 *
 * **Spot practice** (`songs/spot.ts`): a finished run's result offers "Practice these bars", the weakest bars
 * (up to three segments, each with a lead-in bar) drilled on their own. A segment is played as a song of
 * its own through the same machine, so everything above applies; it loops (after each pass the next starts
 * by itself after a short pause while "Keep looping" is on) at 60% of the song's tempo in Play along,
 * 10 points faster after each clean pass and a step slower after a bad one, with "Next bars" and "Play the
 * whole song" in the bar over it. It is never scored or saved: its run is given the saver that keeps
 * nothing, sees no best, and starts no practice-log clock (`spot-integrity.test.ts` guards that).
 *
 * Every box keeps one height through loading, every state and the result: the score window
 * (`.rmm-score`), the two text lines under it, the controls row, and the input region. A polite live
 * region says the note to play (Wait for me) or the bar (Play along), once per change.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { History, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { createMetronome, type Metronome } from '@/lib/rmhmusic/learn/audio/metronome';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { playSequence, type PlayingSequence } from '@/lib/rmhmusic/learn/audio/sequence';
import { onSoundChange, soundStatus, wakeSound } from '@/lib/rmhmusic/learn/audio/voice';
import { beginSoundSession } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import { resolveSound } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { setMicReattack } from '@/lib/rmhmusic/learn/input/mic';
import { watchAway } from '@/lib/rmhmusic/learn/input/away-watch';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import { effectiveLatencyMs } from '@/lib/rmhmusic/learn/scoring/timing';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { songById } from '@/lib/rmhmusic/learn/songs/catalog';
import { songForRange, versionFor } from '@/lib/rmhmusic/learn/songs/transpose';
import { resolveVoiceRange } from '@/lib/rmhmusic/learn/voice/range';
import { inputBlockedUntil, takesNote, type Hearing } from '@/lib/rmhmusic/learn/songs/hear-gate';
import {
  createSongMachine,
  cursorOf,
  marksOf,
  nextDue,
  type SongEffect,
  type SongState,
} from '@/lib/rmhmusic/learn/songs/machine';
import {
  createApiSongSaver,
  createMemorySongSaver,
  type SongBest,
  type SongSaver,
} from '@/lib/rmhmusic/learn/songs/saver';
import {
  notesOf,
  phraseAt,
  songBeats,
  soundingPitch,
  spelledName,
  type Song,
  type SongVersion,
} from '@/lib/rmhmusic/learn/songs/score';
import type { SongMode, SongRunRecord } from '@/lib/rmhmusic/learn/songs/scoring';
import {
  autoLoops,
  segmentSong,
  spotBpm,
  spotReducer,
  spotSegments,
  type SpotSegment,
  type SpotState,
} from '@/lib/rmhmusic/learn/songs/spot';
import { getAudioContext } from '@/lib/shared/platform';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import { ShareButton } from '../social/ShareDialog';
import { songPayload, type SharePayload } from '@/lib/rmhmusic/learn/social/share';
import { InputSetup } from '../InputSetup';
import { DeviceRegion } from '../LessonParts';
import { Shell } from '../LessonScreen';
import { Notehead } from '../Notehead';
import { OnScreenKeyboard } from '../OnScreenKeyboard';
import { useMachine } from '../useMachine';
import { useInputPhases, useInputRelease, useLessonInputStart, useNoteEvents, useNoteSound } from '../useLearnInput';
import { ScoreView } from './ScoreView';
import { composerName } from './song-text';
import { segmentName, spotHeading, spotIntro, spotResultLine, spotTempoLine } from './spot-text';
import { beginActivity } from '@/lib/rmhmusic/learn/activity-clock';

const TABS_ID = 'rmm-song';
const LOCKED_ID = 'rmm-song-locked';
/** Wait for me offers "Skip this note" after this long on one note (ms). */
export const SKIP_AFTER_MS = 6000;
/** Slower plays at this share of the song's tempo. */
export const SLOW_TEMPO = 2 / 3;
/** Spot practice: after a finished pass the next one starts by itself this long after (ms), while looping. */
export const SPOT_LOOP_PAUSE_MS = 2000;

/**
 * Spot practice, as the run sees it (`SongScreen` builds it from the reducer's state). The run it is
 * given is of the segment's own bars; it is never saved (the screen gives it the saver that keeps
 * nothing) and starts no practice-log timer.
 */
export interface SpotRunProps {
  /** The tempo of the next pass (percent of the song's); null in Wait for me. */
  tempoPct: number | null;
  /** The line before a pass is started. */
  intro: string;
  /** The line under the score: tempo and pass number. */
  tempoLine: string;
  /** What the last finished pass said; null before the first. */
  result: string | null;
  /** The next pass starts by itself after a short pause. */
  autoLoop: boolean;
  /** The number of the segment's first bar as the score numbers bars (0 is an opening pickup). */
  fromNumber: number;
  /** The song's bars, for "Bar 5 of 12". */
  totalBars: number;
  /** A pass finished: its record, to follow the tempo. Called once per run. */
  onPass: (record: SongRunRecord) => void;
}

type T = ReturnType<typeof useTranslation>['t'];

export function SongScreen({ songId }: { songId: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const { t: ts } = useTranslation('music-history');
  const written = songById(songId);
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const profile = useLearnStore((s) => s.profile);
  // A singer reads the song moved into their range (by octaves, or into a nearby key).
  const singerRange = profile?.instrument === 'voice' ? resolveVoiceRange(profile.voiceRange) : null;
  const song = useMemo(
    () => (written && singerRange ? songForRange(written, singerRange).song : written),
    [written, singerRange],
  );
  // A song moved into another key for a singer says so, in one plain line with the composer.
  const movedKey = written && song && song.key !== written.key ? song.key.replace('b', '♭') : null;
  const [mode, setMode] = useState<SongMode>('wait');
  const [slow, setSlow] = useState(false);
  const [running, setRunning] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  const [bests, setBests] = useState<SongBest[] | null>(null);
  const saver = useMemo<SongSaver>(() => createApiSongSaver(), []);
  // Spot practice: a few bars of the song, looped. Its runs get the saver that keeps nothing (`spotSaver`)
  // and never see a best, so nothing about them reaches the server or the learner's bests.
  const [spot, dispatchSpot] = useReducer(spotReducer, null);
  const spotSaver = useMemo<SongSaver>(() => createMemorySongSaver(), []);
  const spotSegment = spot?.segments[spot.index];
  const spotSong = useMemo(() => (song && spotSegment ? segmentSong(song, spotSegment) : null), [song, spotSegment]);

  useInputRelease();
  useLessonInputStart({
    mic: true,
  });
  // A song repeats notes: the microphone starts a held pitch again when it is struck again, on
  // this screen only (the other lessons count a try per note-on).
  useEffect(() => {
    setMicReattack(true);
    return () => setMicReattack(false);
  }, []);

  useEffect(() => {
    void useLearnStore.getState().load();
  }, []);
  useEffect(() => {
    let live = true;
    saver
      .bests()
      .then((b) => live && setBests(b))
      .catch(() => live && setBests([]));
    return () => {
      live = false;
    };
  }, [saver]);

  const ready = status === 'ready' && !!profile;
  const loading = !ready && status !== 'error';
  const arrival = useArrival(!loading);
  const version: SongVersion = versionFor(profile?.instrument ?? 'piano', singerRange ?? undefined);
  const sound = profile ? resolveSound(profile) : null;

  // One sound session for the page, before anything can sound (as in a lesson).
  useLayoutEffect(() => {
    if (!sound) return;
    return beginSoundSession(sound);
  }, [sound]);
  const voicing = useMemo(
    () =>
      sound
        ? {
            instrument: sound,
          }
        : undefined,
    [sound],
  );
  useNoteSound(!setupOpen, voicing);

  if (!song) {
    return (
      <Shell
        title={t('song-missing-title', {
          defaultValue: 'Song not found',
        })}
        back={{
          to: '/rmhmusic/songs',
          label: t('song-back', {
            defaultValue: 'All songs',
          }),
        }}
      >
        <p className="text-app-text">
          {t('song-missing', {
            defaultValue: "This song isn't in the songbook.",
          })}
        </p>
        <Link to="/rmhmusic/songs" className={TEXT_BUTTON}>
          {t('song-choose', {
            defaultValue: 'Choose another song',
          })}
        </Link>
      </Shell>
    );
  }

  const bestOf = (m: SongMode) => bests?.find((b) => b.songId === song.id && b.mode === m)?.bestScore ?? null;
  const best = bests === null ? undefined : bestOf(mode);

  let body: ReactNode;
  if (status === 'error') {
    body = (
      <div role="alert" className={`rmm-sheet space-y-3 p-4 ${arrival ?? ''}`}>
        <p className="text-app-text">
          {error === 'unauthorized'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('sprint-load-failed', {
                defaultValue: "Couldn't load your settings.",
              })}
        </p>
        {error === 'unauthorized' ? (
          <Link
            to="/login"
            search={{
              callbackURL: `/rmhmusic/songs/${song.id}`,
            }}
            className={PRIMARY_BUTTON}
          >
            {t('sign-in', {
              defaultValue: 'Sign in',
            })}
          </Link>
        ) : (
          <button type="button" onClick={() => void useLearnStore.getState().load()} className={PRIMARY_BUTTON}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="min-h-6 text-sm leading-6 text-app-text-muted">
          {composerName(t, song.composer)}
          {movedKey
            ? ` · ${t('song-moved-key', {
                name: movedKey,
                defaultValue: 'Moved to {{name}} major for your voice.',
              })}`
            : null}
        </p>
        <p id={LOCKED_ID} className="sr-only">
          {running
            ? t('song-locked', {
                defaultValue: 'Stop the run to change how you play or your input.',
              })
            : ''}
        </p>
        {spot && spotSong && spotSegment && ready && profile && sound ? (
          <>
            <SpotBar spot={spot} dispatch={dispatchSpot} />
            <div className={arrival}>
              <SongRun
                key={`spot:${spot.index}:${version}`}
                song={spotSong}
                version={version}
                mode={spot.mode}
                input={profile.input}
                latencyMs={effectiveLatencyMs(profile.latencyMs)}
                calibrated={Number.isFinite(profile.latencyMs) && profile.latencyMs !== 0}
                sound={sound}
                slow={false}
                onSlow={() => undefined}
                paused={setupOpen}
                onRunning={setRunning}
                best={undefined}
                saver={spotSaver}
                onBest={() => undefined}
                spot={{
                  tempoPct: spot.tempoPct,
                  intro: spotIntro(t, spot.mode, segmentName(t, spotSegment)),
                  tempoLine: spotTempoLine(t, spot),
                  result: spot.last ? spotResultLine(t, spot.last) : null,
                  autoLoop: autoLoops(spot),
                  fromNumber: spotSegment.fromNumber,
                  totalBars: song.bars.length - (song.pickup > 0 ? 1 : 0),
                  onPass: (record) => dispatchSpot({ type: 'pass', record }),
                }}
              />
            </div>
          </>
        ) : (
          <>
            <Tabs
              dense
              idBase={TABS_ID}
              tabs={[
                {
                  id: 'wait',
                  label: t('song-mode-wait', {
                    defaultValue: 'Wait for me',
                  }),
                  disabled: running || loading,
                },
                {
                  id: 'play',
                  label: t('song-mode-play', {
                    defaultValue: 'Play along',
                  }),
                  disabled: running || loading,
                },
              ]}
              value={mode}
              onChange={(id) => setMode(id === 'play' ? 'play' : 'wait')}
              aria-label={t('song-modes', {
                defaultValue: 'How to play',
              })}
            />
            <div
              role="tabpanel"
              id={`${TABS_ID}-panel-${mode}`}
              aria-labelledby={`${TABS_ID}-tab-${mode}`}
              className={arrival}
            >
              {ready && profile && sound ? (
                <SongRun
                  key={`${mode}:${version}`}
                  song={song}
                  version={version}
                  mode={mode}
                  input={profile.input}
                  latencyMs={effectiveLatencyMs(profile.latencyMs)}
                  calibrated={Number.isFinite(profile.latencyMs) && profile.latencyMs !== 0}
                  sound={sound}
                  slow={slow}
                  onSlow={setSlow}
                  paused={setupOpen}
                  onRunning={setRunning}
                  best={best}
                  saver={saver}
                  onSpot={(segments) => dispatchSpot({ type: 'open', segments, mode })}
                  onBest={(score) =>
                    setBests((prev) => [
                      ...(prev ?? []).filter((b) => !(b.songId === song.id && b.mode === mode)),
                      {
                        songId: song.id,
                        mode,
                        bestScore: score,
                      },
                    ])
                  }
                />
              ) : (
                <RunSkeleton song={song} />
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Shell
      title={song.title}
      busy={loading}
      back={{
        to: '/rmhmusic/songs',
        label: t('song-back', {
          defaultValue: 'All songs',
        }),
      }}
      action={
        <>
          <Link
            to="/rmhmusic/history"
            search={{
              song: song.id,
            }}
            className={`${SECONDARY_BUTTON} max-[399px]:px-3`}
          >
            <History className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {ts('song-history-link', {
                defaultValue: 'History',
              })}
            </span>
          </Link>
          <button
            ref={setupButton}
            type="button"
            disabled={loading || running}
            aria-describedby={running ? LOCKED_ID : undefined}
            onClick={() => setSetupOpen(true)}
            aria-label={t('change-input', {
              defaultValue: 'Change input',
            })}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span aria-hidden="true" className="max-[399px]:hidden">
              {t('change-input', {
                defaultValue: 'Change input',
              })}
            </span>
          </button>
        </>
      }
    >
      {body}
      <InputSetup open={setupOpen} onOpenChange={setSetupOpen} returnFocus={setupButton} />
    </Shell>
  );
}

/**
 * The bar over a spot-practice run: which bars, the loop switch, and the way on (the next segment, or
 * back to the whole song). One row at every width (it wraps, never scrolls), native buttons, so every
 * control is reachable and operable by keyboard. Next bars and the whole song work mid-run: leaving the
 * run stops its metronome.
 */
function SpotBar({
  spot,
  dispatch,
}: {
  spot: SpotState;
  dispatch: (action: { type: 'next' } | { type: 'toggle-loop' } | { type: 'exit' }) => void;
}) {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="text-base leading-6 text-app-text">{spotHeading(t, spot)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => dispatch({ type: 'toggle-loop' })}
          aria-pressed={spot.looping}
          className={TEXT_BUTTON}
        >
          {spot.looping
            ? t('spot-loop-on', {
                defaultValue: 'Keep looping: on',
              })
            : t('spot-loop-off', {
                defaultValue: 'Keep looping: off',
              })}
        </button>
        {spot.segments.length > 1 ? (
          <button type="button" onClick={() => dispatch({ type: 'next' })} className={SECONDARY_BUTTON}>
            {t('spot-next', {
              defaultValue: 'Next bars',
            })}
          </button>
        ) : null}
        <button type="button" onClick={() => dispatch({ type: 'exit' })} className={TEXT_BUTTON}>
          {t('spot-whole', {
            defaultValue: 'Play the whole song',
          })}
        </button>
      </div>
    </div>
  );
}

/** The run's boxes: the score sheet (window, two lines, controls) and the input region. */
function RunFrame({
  score,
  line,
  sub,
  controls,
  answers,
  said,
}: {
  score: ReactNode;
  line: string;
  /** The second line: a sentence, or Wait for me's "Skip this note". */
  sub: ReactNode;
  controls: ReactNode;
  answers: ReactNode;
  said: string;
}) {
  return (
    <div className="space-y-4">
      <section className="rmm-sheet space-y-2 p-3 sm:p-5">
        {score}
        {/* Keyed by their text: a changed line is a new node, never the old one re-laid. */}
        <p key={`line:${line}`} className="min-h-12 text-center text-sm leading-6 text-app-text">
          {line}
        </p>
        {/* Two lines tall at every width: room for a wrapped sentence or the 44px Skip button. */}
        <div
          key={typeof sub === 'string' ? `sub:${sub}` : 'sub:control'}
          className="flex min-h-12 items-center justify-center text-center text-sm leading-6 text-app-text-muted"
        >
          {sub}
        </div>
        <div className="flex h-11 items-center justify-center gap-3">{controls}</div>
        <p role="status" className="sr-only">
          {said}
        </p>
      </section>
      <div className="rmm-input-region">{answers}</div>
    </div>
  );
}

function RunSkeleton({ song }: { song: Song }) {
  return (
    <div aria-hidden="true">
      <RunFrame
        score={
          <div className="rmm-score" data-song={song.id}>
            <div className="app-skeleton h-full w-full" />
          </div>
        }
        line=""
        sub=""
        controls={<div className="app-skeleton h-11 w-48" />}
        answers={<div className="app-skeleton h-full w-full" />}
        said=""
      />
    </div>
  );
}

function SongRun({
  song,
  version,
  mode,
  input,
  latencyMs,
  calibrated,
  sound,
  slow,
  onSlow,
  paused,
  onRunning,
  best,
  saver,
  onBest,
  onSpot,
  spot,
}: {
  song: Song;
  version: SongVersion;
  mode: SongMode;
  input: LearnInput;
  latencyMs: number;
  /** The learner measured their latency (it holds that input's delay). */
  calibrated: boolean;
  sound: InstrumentId;
  slow: boolean;
  onSlow: (slow: boolean) => void;
  paused: boolean;
  onRunning: (running: boolean) => void;
  /** This mode's best: undefined while loading, null when there is none. */
  best: number | null | undefined;
  saver: SongSaver;
  onBest: (score: number) => void;
  /** A finished run's weakest bars can be drilled: open spot practice on them (not in a spot run). */
  onSpot?: (segments: SpotSegment[]) => void;
  /** This is a spot-practice run: the segment's bars, looped, never saved. */
  spot?: SpotRunProps;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const [state, send, getState] = useMachine(
    createSongMachine({
      song,
      version,
      mode,
    }),
  );
  const phases = useInputPhases();
  const notes = useMemo(() => notesOf(song), [song]);
  const needsBlackKeys = notes.some((n) => n.alter !== 0);
  // A spot run plays at the tempo the passes have earned; otherwise the song's, or two thirds of it.
  const bpm =
    spot && spot.tempoPct !== null ? spotBpm(song, spot.tempoPct) : Math.round(song.bpm * (slow ? SLOW_TEMPO : 1));
  const beatMs = 60_000 / bpm;
  const metronome = useRef<Metronome | null>(null);
  const hearing = useRef<{
    seq: PlayingSequence;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  /** The last phrase heard, kept after it ends: the note gate and Start's wait read it. */
  const heard = useRef<Hearing | null>(null);
  const [hearingNow, setHearingNow] = useState(false);
  /** Start waits for the input's echo tail after a phrase (the microphone only). */
  const [startHeld, setStartHeld] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [noSound, setNoSound] = useState(false);
  const mounted = useRef(true);

  /** The phrase has stopped (cancelled, or at its end): Start waits out the mic's echo tail. */
  const endHearing = useCallback(
    (cancelled: boolean) => {
      const h = hearing.current;
      if (!h) return;
      if (cancelled) h.seq.cancel();
      clearTimeout(h.timer);
      hearing.current = null;
      setHearingNow(false);
      const now = performance.now();
      if (cancelled && heard.current)
        heard.current = {
          ...heard.current,
          cancelledAt: now,
        };
      const wait = inputBlockedUntil(heard.current, input === 'mic' ? 'mic' : 'keys') - now;
      clearTimeout(holdTimer.current);
      if (wait > 0) {
        setStartHeld(true);
        holdTimer.current = setTimeout(() => setStartHeld(false), wait);
      } else setStartHeld(false);
    },
    [input],
  );
  const stopHearing = useCallback(() => endHearing(true), [endHearing]);

  // The effects, carried out with the current props.
  const latest = useRef({
    beatMs,
    bpm,
    latencyMs,
    calibrated,
    saver,
    onBest,
  });
  useEffect(() => {
    latest.current = {
      beatMs,
      bpm,
      latencyMs,
      calibrated,
      saver,
      onBest,
    };
  });
  const carry = useCallback(
    (effects: SongEffect[]): void => {
      for (const fx of effects) {
        if (fx.type === 'halt') {
          metronome.current?.stop();
          metronome.current = null;
        } else if (fx.type === 'save') {
          void latest.current.saver
            .save(song.id, fx.run)
            .catch(() => ({
              outcome: 'failed' as const,
            }))
            .then((res) => {
              if (res.outcome === 'saved' && res.bestScore !== undefined) latest.current.onBest(res.bestScore);
              if (mounted.current)
                carry(
                  send({
                    type: 'answered',
                    attempt: fx.attempt,
                    outcome: res.outcome,
                  }),
                );
            });
        } else if (fx.type === 'prepare') {
          void prepare(fx.token);
        }
      }
    },
    // `send` is the runner's, stable for the screen's life; `prepare` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, song.id],
  );

  /**
   * Play along: wake sound and start the count-in; the first click fixes the beat grid. `token` is
   * the run this is for: a run stopped and started again while sound woke has a newer token, and
   * this one gives up, so there is never a second metronome.
   */
  async function prepare(token: number) {
    const ctx = getAudioContext();
    const awake = ctx ? await resumeAudio(ctx) : false;
    const now = getState();
    if (!mounted.current || now.kind !== 'counting' || now.token !== token) return;
    if (!ctx || !awake || document.hidden) {
      carry(
        send({
          type: 'stop',
          why: document.hidden ? 'away' : 'sound',
        }),
      );
      return;
    }
    const { beatMs: ms, bpm: tempo, latencyMs: latency, calibrated: measured } = latest.current;
    const countIn = song.beatsPerBar + (song.pickup > 0 ? song.beatsPerBar - song.pickup : 0);
    let first = true;
    const m = createMetronome(ctx, {
      bpm: tempo,
      beatsPerBar: song.beatsPerBar,
      count: countIn + Math.ceil(songBeats(song)),
      onBeat: (_beat, _bar, at) => {
        if (!first) return;
        first = false;
        carry(
          send({
            type: 'begin',
            token,
            t0: at + countIn * ms,
            beatMs: ms,
            latencyMs: latency,
            calibrated: measured,
          }),
        );
      },
    });
    metronome.current?.stop();
    metronome.current = m;
    m.start();
  }

  // Notes: every note-on goes to the machine with its own time, except while "Hear it" sounds
  // (and, for the microphone, its echo tail: `hear-gate.ts`).
  useNoteEvents((e) => {
    if (paused || !takesNote(heard.current, e)) return;
    carry(
      send({
        type: 'note',
        note: e,
      }),
    );
  });

  // Play along: one tick at the next due time.
  const due = nextDue(state);
  useEffect(() => {
    if (due === null) return;
    // A timer may fire a fraction of a millisecond before its time on this clock: the tick is for
    // `due` at least, or the cursor would stay put and nothing would ask again.
    const id = setTimeout(
      () =>
        carry(
          send({
            type: 'tick',
            at: Math.max(due, performance.now()),
          }),
        ),
      Math.max(0, due - performance.now()),
    );
    return () => clearTimeout(id);
  }, [due, carry, send]);

  const live = state.kind === 'counting' || state.kind === 'playing';
  const inRun = live || state.kind === 'waiting';
  // Wait for me too: switching the mode or the input would discard the run.
  useEffect(() => {
    onRunning(inRun);
  }, [inRun, onRunning]);

  // Dropped: a dialog over a play-along run, the tab hidden or away, sound stopped.
  useEffect(() => {
    if (paused && live)
      carry(
        send({
          type: 'stop',
          why: 'dialog',
        }),
      );
  }, [paused, live, carry, send]);
  useEffect(() => {
    if (!live) return;
    return watchAway({
      doc: document,
      win: window,
      onAway: () =>
        carry(
          send({
            type: 'stop',
            why: 'away',
          }),
        ),
    });
  }, [live, carry, send]);
  useEffect(
    () =>
      onSoundChange(() => {
        const k = getState().kind;
        if ((k === 'counting' || k === 'playing') && soundStatus() !== 'ready')
          carry(
            send({
              type: 'stop',
              why: 'sound',
            }),
          );
      }),
    [carry, send, getState],
  );

  // Leaving: the metronome and "Hear it" stop.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      metronome.current?.stop();
      metronome.current = null;
      stopHearing();
      clearTimeout(holdTimer.current);
    };
  }, [stopHearing]);

  async function hear() {
    if (hearing.current) {
      stopHearing();
      return;
    }
    setNoSound(false);
    if (soundStatus() !== 'ready' && !(await wakeSound())) {
      setNoSound(true);
      return;
    }
    const { from, to } = phraseAt(song, Math.max(0, cursorOf(getState())));
    const phrase = notes.slice(from, to);
    const ms = latest.current.beatMs;
    const total = phrase.reduce((sum, n) => sum + n.beats * ms, 0);
    const seq = playSequence(
      phrase.map((n) => soundingPitch(n.written, version)),
      phrase.slice(0, -1).map((n) => n.beats * ms),
      {
        instrument: sound,
        holdsMs: phrase.map((n) => n.beats * ms * 0.92),
      },
    );
    if (!seq.started) {
      setNoSound(true);
      return;
    }
    const now = performance.now();
    heard.current = {
      startedAt: now,
      endsAt: now + total,
      cancelledAt: null,
    };
    const timer = setTimeout(() => endHearing(false), total);
    hearing.current = {
      seq,
      timer,
    };
    setHearingNow(true);
  }

  // Focus: the sheet's first control stays put; at the end, Play again.
  const againButton = useRef<HTMLButtonElement>(null);
  const finished = 'record' in state;
  // Once the save has settled (Start again is disabled while saving): the control that had focus
  // (Stop, or a key the learner played on screen) is gone.
  const settled = finished && state.kind !== 'saving';
  useEffect(() => {
    if (settled)
      againButton.current?.focus({
        preventScroll: true,
      });
  }, [settled]);

  /** Start a run (again, if one is over): the Start / Play again button, and a spot run's loop. */
  function startRun() {
    if (state.kind !== 'ready')
      carry(
        send({
          type: 'again',
        }),
      );
    // The run's length, for the practice log, counts from Start. A spot run is not logged, so it neither
    // starts the clock nor, when it ends, stops one a whole-song run started.
    if (!spot) beginActivity();
    carry(
      send({
        type: 'start',
        at: performance.now(),
      }),
    );
  }
  const startLatest = useRef(startRun);
  useEffect(() => {
    startLatest.current = startRun;
  });

  // Spot practice: tell the screen each pass's record once (before paint, so the line it earns is the
  // one drawn), which follows the tempo.
  const reportedRun = useRef(0);
  useLayoutEffect(() => {
    if (!spot || !('record' in state) || reportedRun.current === state.runs) return;
    reportedRun.current = state.runs;
    spot.onPass(state.record);
  });
  // ... and, while looping, start the next pass after a pause the learner can read the result in. Any
  // press of Stop, Hear it, or the settings dialog cancels it (the state is no longer a settled result).
  const autoLoop = spot?.autoLoop === true;
  useEffect(() => {
    if (!autoLoop || !settled || paused || hearingNow || startHeld) return;
    const id = setTimeout(() => startLatest.current(), SPOT_LOOP_PAUSE_MS);
    return () => clearTimeout(id);
  }, [autoLoop, settled, paused, hearingNow, startHeld, state.runs]);

  const cursor = cursorOf(state);
  const marks = marksOf(state);
  // "Skip this note" after a while on one note (Wait for me).
  const waitingOn = state.kind === 'waiting' ? state.index : -1;
  const [skipFor, setSkipFor] = useState(-1);
  useEffect(() => {
    if (waitingOn < 0) return;
    const id = setTimeout(() => setSkipFor(waitingOn), SKIP_AFTER_MS);
    return () => clearTimeout(id);
  }, [waitingOn]);
  const canSkip = waitingOn >= 0 && skipFor === waitingOn;
  const current = cursor >= 0 ? notes[cursor] : undefined;
  // Bar numbers count full bars; the opening partial bar of a song with a pickup is "Pickup" (0). A spot
  // run plays a few bars of the song, and says the numbers they have in the whole score.
  const barOf = (i: number) => (notes[i]?.bar ?? 0) + (spot ? spot.fromNumber : song.pickup > 0 ? 0 : 1);
  const bars = song.bars.length - (song.pickup > 0 ? 1 : 0);
  const want = state.kind === 'waiting' ? (state.pitches[state.index] ?? -1) : -1;
  const lastWrong = state.kind === 'waiting' ? state.lastWrong : null;

  const described = describe(t, state, {
    current: current ? spelledName(current) : '',
    index: cursor,
    total: notes.length,
    bar: cursor >= 0 ? barOf(cursor) : 0,
    bars: spot ? spot.totalBars : bars,
    wrongName: lastWrong !== null ? pitchName(lastWrong) : '',
    octaveOff: lastWrong !== null && pitchName(lastWrong) === pitchName(want),
    // Guitar sounds an octave under its staff: a MIDI learner who plays the written pitch is told so.
    guitarWritten: version === 'guitar' && lastWrong !== null && lastWrong === want + 12,
  });
  // A spot run's own lines: what to expect before it starts, and what each pass earned (which the live
  // region says too, so a tempo change is announced).
  let { line, said } = described;
  if (spot) {
    if (state.kind === 'ready' && state.stopped === null) {
      line = spot.intro;
      said = '';
    } else if (finished && spot.result !== null) {
      line = spot.result;
      said = spot.result;
    }
  }
  // The microphone hears a repeated pitch only once it stops or is struck clearly again.
  const micRepeat =
    input === 'mic' &&
    state.kind === 'waiting' &&
    state.index > 0 &&
    state.pitches[state.index] === state.pitches[state.index - 1];
  const sub = noSound
    ? t('song-no-sound', {
        defaultValue: "Sound isn't playing.",
      })
    : micRepeat
      ? t('song-mic-repeat', {
          defaultValue: 'Stop the string or take a breath between repeated notes.',
        })
      : spot
        ? spot.tempoLine
        : saveLine(t, state, best);

  const label = t('song-score-label', {
    title: song.title,
    bars,
    beats: song.beatsPerBar,
    defaultValue: 'The score of {{title}}: {{bars}} bars, {{beats}} beats to a bar.',
  });

  // Start and Stop take one width (min-w-24), so swapping them never moves the centred row.
  const controls = (
    <>
      {inRun ? (
        <button
          type="button"
          onClick={() =>
            carry(
              send({
                type: 'again',
              }),
            )
          }
          className={`${SECONDARY_BUTTON} min-w-24`}
        >
          {t('song-stop', {
            defaultValue: 'Stop',
          })}
        </button>
      ) : (
        <button
          ref={againButton}
          type="button"
          disabled={hearingNow || startHeld || state.kind === 'saving'}
          onClick={startRun}
          className={`${PRIMARY_BUTTON} min-w-24`}
        >
          {spot && finished
            ? t('spot-again', {
                defaultValue: 'Play again',
              })
            : t('sprint-start', {
                defaultValue: 'Start',
              })}
        </button>
      )}
      <button
        type="button"
        disabled={live}
        onClick={() => void hear()}
        aria-pressed={hearingNow}
        className={SECONDARY_BUTTON}
      >
        {t('song-hear', {
          defaultValue: 'Hear it',
        })}
      </button>
      {spot ? null : (
        <button type="button" disabled={live} onClick={() => onSlow(!slow)} aria-pressed={slow} className={TEXT_BUTTON}>
          {t('song-slower', {
            defaultValue: 'Slower',
          })}
        </button>
      )}
    </>
  );

  // The weakest bars of a finished run, to drill on their own (not offered inside a spot run, which keeps
  // the input in front of the learner between passes).
  const segments = useMemo(
    () => (finished && !spot && onSpot ? spotSegments(song, state.record) : []),
    [finished, spot, onSpot, song, state],
  );
  const firstSegment = segments[0];

  let answers: ReactNode;
  if (finished && !spot) {
    answers = (
      <div className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-4 text-center">
        <p
          className="flex justify-center gap-1"
          role="img"
          aria-label={t('lesson-stars', {
            count: state.summary.stars,
            defaultValue_one: '{{count}} star',
            defaultValue: '{{count}} stars',
          })}
        >
          {[0, 1, 2].map((i) => (
            <Notehead key={i} kind={i < state.summary.stars ? 'filled' : 'open'} className="h-5 w-7 text-app-accent" />
          ))}
        </p>
        {state.kind === 'failed' ? (
          <button
            type="button"
            onClick={() =>
              carry(
                send({
                  type: 'retry',
                }),
              )
            }
            className={SECONDARY_BUTTON}
          >
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </button>
        ) : state.kind === 'signed-out' ? (
          <Link
            to="/login"
            search={{
              callbackURL: `/rmhmusic/songs/${song.id}`,
            }}
            className={SECONDARY_BUTTON}
          >
            {t('sign-in', {
              defaultValue: 'Sign in',
            })}
          </Link>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {firstSegment && onSpot && state.kind !== 'saving' ? (
              <div className="flex w-full flex-col items-center gap-1">
                <p className="text-sm leading-6 text-app-text-muted">
                  {t('spot-weakest', {
                    bars: segmentName(t, firstSegment),
                    defaultValue: 'Worth another go: {{bars}}.',
                  })}
                </p>
                <button type="button" onClick={() => onSpot(segments)} className={SECONDARY_BUTTON}>
                  {t('spot-practice', {
                    defaultValue: 'Practice these bars',
                  })}
                </button>
              </div>
            ) : null}
            <Link to="/rmhmusic/songs" className={TEXT_BUTTON}>
              {t('song-choose', {
                defaultValue: 'Choose another song',
              })}
            </Link>
            {typeof best === 'number' && sharePreview(song.id, mode, best, version) ? (
              <ShareButton
                target={{
                  kind: 'song',
                  songId: song.id,
                  mode,
                }}
                preview={sharePreview(song.id, mode, best, version)!}
                label={t('share-best', {
                  defaultValue: 'Share best',
                })}
              />
            ) : null}
          </div>
        )}
      </div>
    );
  } else if (input === 'mic' || input === 'midi') {
    answers = (
      <div className="h-full">
        <DeviceRegion input={input} on={phases[input] === 'active'} />
      </div>
    );
  } else if (input === 'keys') {
    answers = (
      <div className="rmm-sheet flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm leading-6 text-app-text-muted">
          {t('flash-keys-region', {
            defaultValue: 'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
          })}
        </p>
        {needsBlackKeys ? (
          <p className="text-sm leading-6 text-app-text-muted">
            {t('song-keys-black', {
              defaultValue: 'For sharps: W, E, T, Y and U play C♯, D♯, F♯, G♯ and A♯.',
            })}
          </p>
        ) : null}
      </div>
    );
  } else {
    answers = <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />;
  }

  const subSlot = canSkip ? (
    <button
      type="button"
      onClick={() =>
        carry(
          send({
            type: 'skip',
          }),
        )
      }
      className={TEXT_BUTTON}
    >
      {t('song-skip', {
        defaultValue: 'Skip this note',
      })}
    </button>
  ) : (
    sub
  );

  return (
    <RunFrame
      score={<ScoreView song={song} version={version} cursor={cursor} marks={marks} label={label} />}
      line={line}
      sub={subSlot}
      controls={controls}
      answers={answers}
      said={said}
    />
  );
}

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function pitchName(midi: number): string {
  return PITCH_NAMES[((Math.round(midi) % 12) + 12) % 12] ?? '';
}

/** The sheet's line and what the live region says. */
function describe(
  t: T,
  state: SongState,
  at: {
    current: string;
    index: number;
    total: number;
    bar: number;
    bars: number;
    wrongName: string;
    octaveOff: boolean;
    guitarWritten: boolean;
  },
): {
  line: string;
  said: string;
} {
  switch (state.kind) {
    case 'ready': {
      if (state.stopped !== null) {
        const line =
          state.stopped === 'sound'
            ? t('song-stopped-sound', {
                defaultValue: 'Sound stopped, so this run was dropped. Start again.',
              })
            : state.stopped === 'dialog'
              ? t('song-stopped-dialog', {
                  defaultValue: 'The run stopped while the settings were open. Start again.',
                })
              : t('song-stopped-away', {
                  defaultValue: 'You left the page, so this run was dropped. Start again.',
                });
        return {
          line,
          said: line,
        };
      }
      const line =
        state.mode === 'wait'
          ? t('song-intro-wait', {
              defaultValue: 'Play each note when you are ready. The cursor waits for you.',
            })
          : t('song-intro-play', {
              defaultValue: 'One bar of clicks counts you in. Then play along in time.',
            });
      return {
        line,
        said: '',
      };
    }
    case 'waiting': {
      const line = at.guitarWritten
        ? t('song-wait-guitar-octave', {
            note: at.current,
            defaultValue: 'Guitar sounds an octave below the staff: play the {{note}} one octave lower.',
          })
        : at.octaveOff
          ? t('song-wait-octave', {
              note: at.current,
              defaultValue: 'That {{note}} is in another octave. Play the one written.',
            })
          : at.wrongName
            ? t('song-wait-wrong', {
                played: at.wrongName,
                note: at.current,
                defaultValue: 'That was {{played}}. Play {{note}}.',
              })
            : t('song-wait-play', {
                note: at.current,
                defaultValue: 'Play {{note}}.',
              });
      // Each note is said with its number, so a repeated name is said again; a wrong note says the line.
      const said = at.wrongName
        ? line
        : at.bar === 0
          ? t('song-wait-said-pickup', {
              n: at.index + 1,
              total: at.total,
              note: at.current,
              defaultValue: 'Note {{n}} of {{total}}, pickup: {{note}}',
            })
          : t('song-wait-said-note', {
              n: at.index + 1,
              total: at.total,
              bar: at.bar,
              note: at.current,
              defaultValue: 'Note {{n}} of {{total}}, bar {{bar}}: {{note}}',
            });
      return {
        line,
        said,
      };
    }
    case 'counting': {
      const line = t('rhythm-tap-listen', {
        defaultValue: 'Listen to the count.',
      });
      return {
        line,
        said: line,
      };
    }
    case 'playing': {
      if (state.cursor < 0) {
        const line = t('rhythm-tap-listen', {
          defaultValue: 'Listen to the count.',
        });
        return {
          line,
          said: line,
        };
      }
      const line =
        at.bar === 0
          ? t('song-play-pickup', {
              defaultValue: 'Pickup',
            })
          : t('song-play-bar', {
              bar: at.bar,
              bars: at.bars,
              defaultValue: 'Bar {{bar}} of {{bars}}',
            });
      return {
        line,
        said: line,
      };
    }
    default: {
      const s = state.summary;
      const line =
        state.mode === 'wait'
          ? t('song-result-wait', {
              right: s.right,
              total: s.total,
              defaultValue: 'Right first time: {{right}} of {{total}} notes.',
            })
          : t('song-result-play', {
              right: s.right,
              total: s.total,
              early: s.early,
              late: s.late,
              defaultValue: 'Notes right: {{right}} of {{total}}. Early: {{early}}. Late: {{late}}.',
            });
      return {
        line,
        said: line,
      };
    }
  }
}

function saveLine(t: T, state: SongState, best: number | null | undefined): string {
  switch (state.kind) {
    case 'saving':
      return t('lesson-saving', {
        defaultValue: 'Saving…',
      });
    case 'saved':
      return best === null || best === undefined
        ? t('song-saved', {
            score: state.summary.score,
            defaultValue: 'Saved. Score {{score}}.',
          })
        : t('song-saved-best', {
            score: state.summary.score,
            best,
            defaultValue: 'Saved. Score {{score}}, your best {{best}}.',
          });
    case 'failed':
      return t('song-save-failed', {
        defaultValue: "Couldn't save this run.",
      });
    case 'signed-out':
      return t('sprint-signed-out', {
        defaultValue: 'Not saved: sign in again to keep your results.',
      });
    case 'unsaved':
      return t('song-unsaved', {
        score: state.summary.score,
        defaultValue: 'Score {{score}}. Not saved.',
      });
    default:
      return best === undefined
        ? ''
        : best === null
          ? t('song-best-none', {
              defaultValue: 'No best yet.',
            })
          : t('song-best', {
              score: best,
              defaultValue: 'Your best: {{score}}',
            });
  }
}

/** A song best's lines for the Share dialog (the link shows the server's stored copy). */
function sharePreview(songId: string, mode: SongMode, best: number, version: SongVersion): SharePayload | null {
  return songPayload(
    {
      songId,
      mode,
      bestScore: best,
    },
    version.startsWith('voice') ? 'voice' : version === 'guitar' ? 'guitar' : 'piano',
  );
}
