'use client';

/**
 * GlobeSet over your camera — the iOS room view.
 *
 * `GlobeSetXr` is the real one and cannot run here: no browser on iPhone or
 * iPad exposes `navigator.xr`, because they are all WebKit underneath and
 * WebKit ships no WebXR. This mode is what is left that is honest — the rear
 * camera as a full-bleed background with the ordinary gyroscope globe standing
 * in front of it. `lib/globeset/room.ts` carries the full comparison; the one
 * line that matters is that this is **3DoF**: it knows which way you are
 * pointing, not where you are standing. Turning works. Walking does not.
 *
 * ## It is the same run
 *
 * This renders the SAME `GlobeSetGlobe` the page renders, with the same
 * `onToggle`, so a set claimed here lands in the same run, the same clock and
 * the same leaderboard entry. Nothing about the game is re-implemented for
 * this mode — only the backdrop changes — which is the difference between a
 * view and a second copy of the game that drifts.
 *
 * ## The camera is released, every way out
 *
 * A stream whose tracks are not stopped keeps the camera powered and the
 * platform's recording dot lit after the player has left, which looks exactly
 * like a site that kept watching. `closeRoomCamera` runs in the effect's
 * cleanup, so every exit — the button, an unmount, a navigation, the component
 * erroring — goes through it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Compass } from 'lucide-react';
import type { RefObject } from 'react';
import type { Card } from '@/lib/globeset/cards';
import type { Quat } from '@/lib/device-attitude';
import { formatDuration } from '@/lib/globeset/game';
import { closeRoomCamera, openRoomCamera, type RoomCameraError } from '@/lib/globeset/room';
import { GlobeSetGlobe } from './GlobeSetGlobe';

export interface GlobeSetRoomProps {
  board: readonly Card[];
  selected: readonly Card[];
  hinted: readonly Card[];
  solving: readonly Card[];
  locked: boolean;
  shapes: boolean;
  attitudeRef: RefObject<Quat | null>;
  gyroActive: boolean;
  /** True once the sensor is genuinely feeding the globe, for the hint line. */
  tiltLive: boolean;
  elapsedSeconds: number;
  cardsLeft: number;
  sets: number;
  onToggle: (card: Card) => void;
  onClear: () => void;
  onExit: () => void;
}

export function GlobeSetRoom(props: GlobeSetRoomProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);

  // Exit is read from a ref inside the mount effect so that opening the camera
  // is armed exactly once. Re-running it on a changed callback would request
  // the camera again mid-session, which on iOS re-prompts.
  const onExitRef = useRef(props.onExit);
  onExitRef.current = props.onExit;

  const message = useCallback(
    (reason: RoomCameraError) => {
      if (reason === 'denied') {
        return t('globeset-room-denied', {
          defaultValue:
            'Camera access was declined, so the room view has nothing to stand in front of. The globe is still on the page.',
        });
      }
      if (reason === 'in-use') {
        return t('globeset-room-busy', {
          defaultValue:
            'Another app is using the camera. Close it and try the room view again.',
        });
      }
      return t('globeset-room-unavailable', {
        defaultValue: 'This device would not open its camera — the globe is still on the page.',
      });
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    // Captured once, rather than read again in the cleanup. The element is
    // rendered unconditionally, so this reference is good for the whole life of
    // the component — and reading `videoRef.current` during teardown is the
    // classic way to find it already null and leave a stream attached.
    const video = videoRef.current;

    void (async () => {
      const result = await openRoomCamera();
      if (cancelled) {
        // Left before the permission prompt resolved. The stream still has to
        // be released, or we leak a camera nobody is looking at.
        if (result.ok) closeRoomCamera(result.stream);
        return;
      }
      if (!result.ok) {
        toast.error(message(result.reason));
        onExitRef.current();
        return;
      }
      streamRef.current = result.stream;
      if (video) {
        video.srcObject = result.stream;
        // iOS will not start a stream without this gesture-free combination,
        // and `play()` rejects if the element is torn down first — which is a
        // normal race on a fast exit, not an error worth surfacing.
        void video.play().catch(() => {});
      }
      setLive(true);
    })();

    return () => {
      cancelled = true;
      if (video) video.srcObject = null;
      closeRoomCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [message]);

  return (
    <div className="fixed inset-0 z-[400] overflow-hidden bg-site-bg">
      {/* The room. `playsInline` keeps iOS from stealing it into its own
          fullscreen player; `muted` is what makes autoplay legal at all. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        aria-hidden
      />

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="glass-overlay flex items-center justify-between gap-4 rounded-site px-4 py-2">
          <dl className="flex items-center gap-5 text-site-text">
            <Figure label={t('globeset-stat-time', { defaultValue: 'Time' })}>
              {formatDuration(props.elapsedSeconds)}
            </Figure>
            <Figure label={t('globeset-stat-cards-left', { defaultValue: 'Cards left' })}>
              {props.cardsLeft}
            </Figure>
            <Figure label={t('globeset-stat-sets', { defaultValue: 'Sets' })}>{props.sets}</Figure>
          </dl>
          <button
            type="button"
            onClick={props.onExit}
            className="inline-flex items-center gap-1.5 rounded-full bg-site-surface px-3 py-1.5 text-sm font-medium text-site-text"
          >
            <X className="h-4 w-4" aria-hidden />
            {t('globeset-ar-exit', { defaultValue: 'Leave' })}
          </button>
        </div>

        {live && (
          <div className="flex items-center justify-center">
            <GlobeSetGlobe
              board={props.board}
              selected={props.selected}
              hinted={props.hinted}
              solving={props.solving}
              locked={props.locked}
              shapes={props.shapes}
              attitudeRef={props.attitudeRef}
              gyroActive={props.gyroActive}
              ledgerOnGlass
              onToggle={props.onToggle}
              onClear={props.onClear}
            />
          </div>
        )}

        {/* Says what this mode actually does. An iPhone cannot anchor the globe
            to the room, and a player who walks around it expecting the back of
            it deserves to have been told, not to conclude it is broken. */}
        <p className="glass-overlay mx-auto rounded-site px-4 py-2 text-center text-sm text-site-text">
          {props.tiltLive ? (
            <span className="inline-flex items-center gap-1.5">
              <Compass className="h-4 w-4 shrink-0" aria-hidden />
              {t('globeset-room-hint-tilt', {
                defaultValue:
                  'Turn to look around the globe, and tap a card to pick it. It follows you if you walk — this phone can see which way you point, not where you stand.',
              })}
            </span>
          ) : (
            t('globeset-room-hint-drag', {
              defaultValue: 'Drag to spin the globe, and tap a card to pick it.',
            })
          )}
        </p>
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6rem] font-medium uppercase tracking-wide text-site-text-muted">
        {label}
      </dt>
      <dd className="font-mono text-base font-bold tabular-nums">{children}</dd>
    </div>
  );
}
