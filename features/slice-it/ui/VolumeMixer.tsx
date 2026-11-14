/**
 * Slice It — the three volume sliders, for the in-run pause and settings menus.
 *
 * Master scales everything; Music and Effects sit under it (`musicGain` /
 * `sfxGain` in `features/slice-it/engine/store.ts`). One component so the two in-run menus
 * cannot drift apart, and so the effects slider is a real subscription to the
 * store rather than a read taken at render time.
 */

import { useTranslation } from 'react-i18next';

import { Slider } from '@/components/ui/slider';
import { useSliceItStore } from '@features/slice-it/engine/store';

interface VolumeMixerProps {
  /** Tighter type and spacing, for the small in-run settings card. */
  compact?: boolean;
}

export function VolumeMixer({
  compact = false,
}: VolumeMixerProps) {
  const {
    t,
  } =
    useTranslation(
      'c-game',
    );
  const volume =
    useSliceItStore(
      (
        s,
      ) =>
        s.volume,
    );
  const setVolume =
    useSliceItStore(
      (
        s,
      ) =>
        s.setVolume,
    );
  const musicVolume =
    useSliceItStore(
      (
        s,
      ) =>
        s.musicVolume,
    );
  const setMusicVolume =
    useSliceItStore(
      (
        s,
      ) =>
        s.setMusicVolume,
    );
  const sfxVolume =
    useSliceItStore(
      (
        s,
      ) =>
        s.sfxVolume,
    );
  const setSfxVolume =
    useSliceItStore(
      (
        s,
      ) =>
        s.setSfxVolume,
    );

  const rows =
    [
      {
        id: 'master',
        label:
          t(
            'master',
            {
              defaultValue:
                'Master',
            },
          ),
        value:
          volume,
        set: setVolume,
      },
      {
        id: 'music',
        label:
          t(
            'music',
            {
              defaultValue:
                'Music',
            },
          ),
        value:
          musicVolume,
        set: setMusicVolume,
      },
      {
        id: 'effects',
        label:
          t(
            'effects',
            {
              defaultValue:
                'Effects',
            },
          ),
        value:
          sfxVolume,
        set: setSfxVolume,
      },
    ];

  return (
    <>
      {rows.map(
        (
          row,
        ) => (
          <div
            key={
              row.id
            }
            className="flex flex-col gap-1.5"
          >
            <div className="flex justify-between items-center">
              <span
                className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-black text-slice-text-muted uppercase tracking-wider`}
              >
                {
                  row.label
                }
              </span>
              <span
                className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-blue-500`}
              >
                {
                  row.value
                }
                %
              </span>
            </div>
            <Slider
              value={[
                row.value,
              ]}
              min={
                0
              }
              max={
                100
              }
              step={
                1
              }
              onValueChange={([
                v,
              ]) =>
                row.set(
                  v,
                )
              }
              aria-label={
                row.label
              }
              className="w-full"
            />
          </div>
        ),
      )}
    </>
  );
}
