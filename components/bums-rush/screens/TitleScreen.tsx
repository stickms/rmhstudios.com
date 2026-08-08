'use client';

/**
 * The front door.
 *
 * Carries two jobs beyond "here are the buttons":
 *
 * **The gamepad user-gesture catch (§4.1).** Browsers do not admit a pad exists
 * until a button on it is pressed — `navigator.getGamepads()` returns holes,
 * and Chrome and Firefox disagree about whether `gamepadconnected` even fires
 * first. A title screen that silently shows nothing about controllers therefore
 * looks broken to the player who just plugged one in. So this screen says
 * "press any button", watches for one with `watchForGamepadPress`, and then
 * names the pad it found — which is also the moment we learn the BRAND, and
 * every glyph in the game re-labels itself accordingly.
 *
 * **The audio unlock (§14).** An `AudioContext` may only start inside a user
 * gesture. The first tap or button press here is that gesture, so this is where
 * the bus is initialised rather than at the moment the first sound is needed
 * (by which time it is too late and the level plays silently).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Hand, Keyboard, MousePointer2, Shirt, Sliders, Smartphone } from 'lucide-react';
import { initAudioBus } from '@/lib/bums-rush/audio';
import { resolvePadBrand, watchForGamepadPress, type PadBrand } from '@/lib/bums-rush/input';
import { PaperCard, StickyNote, Tape } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import { useCoarsePointerOnly, useMounted } from '../hooks';

interface TitleScreenProps {
  onPlay: () => void;
  onWardrobe: () => void;
  onSettings: () => void;
  onCredits: () => void;
  onJoinInvite: () => void;
  /** From `?room=` on the route — an invite the player arrived holding. */
  initialRoomCode: string | null;
  padBrand: PadBrand;
  padSeen: boolean;
  padBrandOverride: 'auto' | PadBrand;
  onPadDetected: (padId: string, brand: PadBrand) => void;
}

const BRAND_NAMES: Record<PadBrand, string> = {
  xbox: 'Xbox',
  playstation: 'PlayStation',
  nintendo: 'Nintendo',
  generic: 'Controller',
};

export function TitleScreen({
  onPlay,
  onWardrobe,
  onSettings,
  onCredits,
  onJoinInvite,
  initialRoomCode,
  padBrand,
  padSeen,
  padBrandOverride,
  onPadDetected,
}: TitleScreenProps) {
  const { t } = useTranslation('c-bums-rush');
  const mounted = useMounted();
  const coarseOnly = useCoarsePointerOnly();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const onPadDetectedRef = useRef(onPadDetected);
  onPadDetectedRef.current = onPadDetected;

  useEffect(() => {
    // The watcher polls AND listens, because neither alone is reliable across
    // engines. It is cheap (4 buttons × 250ms) and lives only on this screen.
    return watchForGamepadPress((pad) => {
      onPadDetectedRef.current(pad.id, resolvePadBrand(pad.id, padBrandOverride));
    });
  }, [padBrandOverride]);

  /**
   * The audio unlock (§14).
   *
   * An `AudioContext` may only start inside a user gesture, and the FIRST
   * gesture on this screen is whichever of a tap, a key or a button press
   * happens — not necessarily a click on anything in particular. So it is a
   * pair of one-shot window listeners rather than handlers on a `<div>`: a
   * container with pointer and key handlers is a non-interactive element
   * pretending to be interactive, which is both a lint failure and a real
   * accessibility problem (it is not focusable, so a keyboard user never
   * reaches it).
   */
  useEffect(() => {
    if (audioUnlocked) return undefined;
    const unlock = () => {
      setAudioUnlocked(true);
      initAudioBus();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audioUnlocked]);

  return (
    <div
      className="flex w-full flex-1 flex-col justify-center-safe"
      style={{
        paddingTop: 'calc(clamp(3.25rem, 7vmin, 4.5rem) + var(--safe-top))',
        paddingLeft: 'calc(clamp(0.75rem, 3vmin, 2rem) + var(--safe-left))',
        paddingRight: 'calc(clamp(0.75rem, 3vmin, 2rem) + var(--safe-right))',
        paddingBottom: 'clamp(1.5rem, 5vmin, 3rem)',
      }}
    >
      <div className="mx-auto grid w-full max-w-5xl gap-[clamp(1rem,3vmin,2rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
        <PaperCard tilt={-1.2} taped className="px-[clamp(1rem,4vmin,2.5rem)] py-[clamp(1.5rem,5vmin,3rem)]">
          <h1
            className="font-bold tracking-tight text-bum-ink"
            style={{ fontSize: 'clamp(2rem, 8vmin, 4.5rem)', lineHeight: 1 }}
          >
            {t('title', { defaultValue: "Bum's Rush" })}
          </h1>
          <p className="mt-3 max-w-prose text-sm text-bum-graphite sm:text-base">
            {t('tagline', {
              defaultValue:
                'You are a head with two enormous arms and no legs whatsoever. Grab, swing, and let go at exactly the wrong moment.',
            })}
          </p>

          {initialRoomCode ? (
            <StickyNote tone="highlight" className="mt-6 rotate-[-1.2deg]">
              <p className="font-medium">
                {t('invite.waiting', {
                  defaultValue: 'Someone sent you a room: {{code}}',
                  code: initialRoomCode,
                })}
              </p>
              <InkButton size="sm" variant="primary" className="mt-3" onClick={onJoinInvite}>
                {t('invite.join', { defaultValue: 'Join them' })}
              </InkButton>
            </StickyNote>
          ) : null}

          <div className="mt-[clamp(1.25rem,4vmin,2.5rem)] flex flex-wrap gap-3">
            <InkButton
              variant="primary"
              size="lg"
              onClick={onPlay}
            >
              <Hand className="size-5" aria-hidden="true" />
              {t('cta.play', { defaultValue: 'Get a Grip' })}
            </InkButton>
            <InkButton onClick={onWardrobe}>
              <Shirt className="size-4" aria-hidden="true" />
              {t('cta.wardrobe', { defaultValue: 'Scrapbook' })}
            </InkButton>
            <InkButton onClick={onSettings}>
              <Sliders className="size-4" aria-hidden="true" />
              {t('cta.settings', { defaultValue: 'Settings' })}
            </InkButton>
            <InkButton onClick={onCredits}>
              {t('cta.credits', { defaultValue: 'Credits' })}
            </InkButton>
          </div>
        </PaperCard>

        <PaperCard className="relative px-[clamp(1rem,3vmin,1.75rem)] py-[clamp(1rem,3vmin,1.75rem)]">
          <Tape className="-top-2 right-6" />
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('input.heading', { defaultValue: 'How you play' })}
          </h2>
          <p className="mt-1 text-sm text-bum-graphite">
            {t('input.blurb', {
              defaultValue:
                'All three are the real game — none of them is the fallback. Change any button in Settings.',
            })}
          </p>

          <ul className="mt-4 space-y-3">
            <InputRow
              icon={<Gamepad2 className="size-5" aria-hidden="true" />}
              title={t('input.pad', { defaultValue: 'Controller' })}
              // `mounted` gates this because gamepad state does not exist during
              // SSR, and rendering "no pad" on the server then swapping is a
              // hydration mismatch on every visit.
              detail={
                !mounted
                  ? t('input.pad-checking', { defaultValue: 'Checking…' })
                  : padSeen
                    ? t('input.pad-found', {
                        defaultValue: '{{brand}} connected — glyphs match your pad',
                        brand: BRAND_NAMES[padBrand],
                      })
                    : t('input.pad-press', {
                        defaultValue: 'Press any button on it — browsers hide pads until you do',
                      })
              }
              live={mounted && padSeen}
            />
            <InputRow
              icon={<Keyboard className="size-5" aria-hidden="true" />}
              title={t('input.keyboard', { defaultValue: 'Keyboard' })}
              detail={t('input.keyboard-detail', {
                defaultValue: 'WASD and arrows aim; Q and E grab. Grab assist is on by default.',
              })}
            />
            <InputRow
              icon={<MousePointer2 className="size-5" aria-hidden="true" />}
              title={t('input.mouse', { defaultValue: 'Keyboard + mouse' })}
              detail={t('input.mouse-detail', {
                defaultValue: 'The mouse aims your right arm; left click grabs with it.',
              })}
            />
            <InputRow
              icon={<Smartphone className="size-5" aria-hidden="true" />}
              title={t('input.touch', { defaultValue: 'Touch' })}
              detail={t('input.touch-detail', {
                defaultValue:
                  'One thumb per arm. Finger down reaches and holds, finger up lets go. Landscape works best.',
              })}
            />
          </ul>

          {/*
            Couch co-op is advertised only where it can actually happen. Two
            people cannot share one phone's touchscreen (§12.1), so on a
            touch-only device this line would be a lie — unless a pad has turned
            up, which is a second physical device and makes it true again.
          */}
          {mounted && (!coarseOnly || padSeen) ? (
            <p className="mt-4 text-xs text-bum-graphite">
              {t('input.couch', {
                defaultValue:
                  'Up to four on one screen: any spare controller can press a button mid-level to drop in.',
              })}
            </p>
          ) : null}
        </PaperCard>
      </div>
    </div>
  );
}

function InputRow({
  icon,
  title,
  detail,
  live,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  live?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-bum-ink">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-bum-ink">{title}</span>
        <span
          className="block text-xs text-bum-graphite"
          aria-live={live === undefined ? undefined : 'polite'}
        >
          {detail}
        </span>
      </span>
    </li>
  );
}
