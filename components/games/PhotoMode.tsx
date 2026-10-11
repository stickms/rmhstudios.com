'use client';

/**
 * Photo mode (plan U14) — the shared panel. A game lazy-loads this only when
 * the player opens photo mode, pauses its sim, hides its HUD, and hands over a
 * `PhotoModeAdapter` (its renderer). Everything here is sliders and one
 * capture; the renderer does the camera and the pixels.
 *
 * The result is offered as a download and, where the browser can share files,
 * through the native share sheet — which on a phone is where people post from.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Download, RotateCcw, Share2, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_PHOTO_CAMERA,
  PHOTO_LIMITS,
  PHOTO_LOOKS,
  type PhotoCamera,
  type PhotoLook,
  type PhotoModeAdapter,
} from '@/lib/game/photo-mode';

const CONTROLS: Array<{ key: keyof PhotoCamera; step: number }> = [
  { key: 'yaw', step: 1 },
  { key: 'pitch', step: 1 },
  { key: 'roll', step: 1 },
  { key: 'fov', step: 1 },
  { key: 'rise', step: 0.05 },
  { key: 'back', step: 0.05 },
];

const LOOKS = Object.keys(PHOTO_LOOKS) as PhotoLook[];

export default function PhotoMode({
  adapter,
  gameName,
  onExit,
}: {
  adapter: PhotoModeAdapter;
  gameName: string;
  onExit: () => void;
}) {
  const { t } = useTranslation('c-game');
  const [cam, setCam] = useState<PhotoCamera>(DEFAULT_PHOTO_CAMERA);
  const [look, setLook] = useState<PhotoLook>('none');
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef(shot);
  shotRef.current = shot;

  // The camera follows the sliders; leaving photo mode hands it back.
  useEffect(() => {
    adapter.setPhotoCamera(cam);
  }, [adapter, cam]);
  useEffect(
    () => () => {
      adapter.setPhotoCamera(null);
      if (shotRef.current) URL.revokeObjectURL(shotRef.current.url);
    },
    [adapter],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const labels: Record<keyof PhotoCamera, string> = {
    yaw: t('photo-yaw', { defaultValue: 'Turn' }),
    pitch: t('photo-pitch', { defaultValue: 'Tilt up/down' }),
    roll: t('photo-roll', { defaultValue: 'Roll' }),
    fov: t('photo-fov', { defaultValue: 'Zoom (FOV)' }),
    rise: t('photo-rise', { defaultValue: 'Height' }),
    back: t('photo-back', { defaultValue: 'Pull back' }),
  };
  const lookLabels: Record<PhotoLook, string> = {
    none: t('photo-look-none', { defaultValue: 'Natural' }),
    noir: t('photo-look-noir', { defaultValue: 'Noir' }),
    warm: t('photo-look-warm', { defaultValue: 'Warm' }),
    vivid: t('photo-look-vivid', { defaultValue: 'Vivid' }),
  };

  async function capture() {
    setBusy(true);
    const blob = await adapter.capturePhoto(PHOTO_LOOKS[look]).catch(() => null);
    setBusy(false);
    if (!blob) return;
    if (shot) URL.revokeObjectURL(shot.url);
    setShot({ blob, url: URL.createObjectURL(blob) });
  }

  const fileName = `${gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.webp`;
  const canShareFile =
    !!shot &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([shot.blob], fileName, { type: shot.blob.type })] });

  return (
    <div
      className="glass-overlay pointer-events-auto absolute bottom-[calc(var(--safe-bottom,0px)+0.75rem)] left-1/2 z-50 w-[min(94vw,26rem)] -translate-x-1/2 space-y-3 rounded-site p-4"
      role="dialog"
      aria-label={t('photo-mode', { defaultValue: 'Photo mode' })}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-site-text">
          <Camera className="h-4 w-4" aria-hidden />
          {t('photo-mode', { defaultValue: 'Photo mode' })}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCam(DEFAULT_PHOTO_CAMERA)}
            aria-label={t('photo-reset', { defaultValue: 'Reset camera' })}
            className="flex h-8 w-8 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label={t('photo-exit', { defaultValue: 'Leave photo mode' })}
            className="flex h-8 w-8 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {shot ? (
        <div className="space-y-2">
          <img
            src={shot.url}
            alt={t('photo-preview', { defaultValue: 'Captured photo' })}
            className="w-full rounded-site-sm"
          />
          <div className="flex gap-2">
            <a
              href={shot.url}
              download={fileName}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-site-accent text-sm font-medium text-site-accent-fg transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t('photo-download', { defaultValue: 'Download' })}
            </a>
            {canShareFile ? (
              <button
                type="button"
                onClick={() =>
                  void navigator
                    .share({
                      files: [new File([shot.blob], fileName, { type: shot.blob.type })],
                      title: gameName,
                    })
                    .catch(() => {})
                }
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-site-border text-sm font-medium text-site-text transition-colors hover:bg-site-surface-hover"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                {t('photo-share', { defaultValue: 'Share' })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(shot.url);
                setShot(null);
              }}
              className="flex h-9 items-center justify-center rounded-full px-3 text-sm text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
            >
              {t('photo-again', { defaultValue: 'Again' })}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {CONTROLS.map(({ key, step }) => {
              const [min, max] = PHOTO_LIMITS[key];
              return (
                <label key={key} className="space-y-1 text-xs text-site-text-muted">
                  <span>{labels[key]}</span>
                  <Slider
                    value={[cam[key]]}
                    min={min}
                    max={max}
                    step={step}
                    onValueChange={(v) => setCam((c) => ({ ...c, [key]: v[0] ?? c[key] }))}
                    aria-label={labels[key]}
                  />
                </label>
              );
            })}
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label={t('photo-look', { defaultValue: 'Look' })}
          >
            {LOOKS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={look === id}
                onClick={() => setLook(id)}
                className={
                  look === id
                    ? 'rounded-full bg-site-accent px-3 py-1 text-xs font-medium text-site-accent-fg'
                    : 'rounded-full border border-site-border px-3 py-1 text-xs text-site-text-muted transition-colors hover:text-site-text'
                }
              >
                {lookLabels[id]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void capture()}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-site-accent text-sm font-semibold text-site-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" aria-hidden />
            {t('photo-capture', { defaultValue: 'Take photo' })}
          </button>
        </>
      )}
    </div>
  );
}
