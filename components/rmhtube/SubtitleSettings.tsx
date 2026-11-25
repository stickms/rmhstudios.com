/**
 * "Subtitles: Off / English / Español" and the caption size (sprint 11 16), as two rows of the viewer's own settings.
 * The tracks are the ones attached to the video playing now; the choice is the viewer's, remembered on this device, and
 * Off is the default. The captions switch beside it still governs the video's embedded tracks.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { useSubtitlePrefs } from '@/lib/rmhtube/subtitle-prefs';
import { SUBTITLE_SIZES, type SubtitleSize } from '@/lib/rmhtube/subtitles';

function Row({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-app-text">
          {label}
        </label>
        <p className="text-xs text-app-text-dim">{description}</p>
      </div>
      <select
        id={id}
        value={value}
        dir="auto"
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded-app-sm border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text outline-none focus:ring-1 focus:ring-app-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SubtitleSettings() {
  const { t } = useTranslation('rmhtube-subtitles');
  const tracks = useRmhTubeStore((s) => s.room?.currentItem?.subtitles);
  const label = useSubtitlePrefs((s) => s.label);
  const size = useSubtitlePrefs((s) => s.size);
  const setLabel = useSubtitlePrefs((s) => s.setLabel);
  const setSize = useSubtitlePrefs((s) => s.setSize);
  const names = (tracks ?? []).map((track) => track.label);
  // A remembered label this video does not carry reads as Off here; the remembered choice itself is kept.
  const current = label && names.some((n) => n.toLowerCase() === label.toLowerCase()) ? label : '';
  const sizeNames: Record<SubtitleSize, string> = {
    small: t('size-small', { defaultValue: 'Small' }),
    medium: t('size-medium', { defaultValue: 'Medium' }),
    large: t('size-large', { defaultValue: 'Large' }),
  };

  return (
    <>
      <Row
        label={t('picker-label', { defaultValue: 'Subtitles' })}
        description={
          names.length > 0
            ? t('picker-desc', { defaultValue: 'Added to this video by the person who queued it' })
            : t('picker-none', { defaultValue: 'This video has no subtitle files' })
        }
        value={current}
        onChange={(value) => setLabel(value === '' ? null : value)}
        options={[
          { value: '', label: t('picker-off', { defaultValue: 'Off' }) },
          ...names.map((name) => ({ value: name, label: name })),
        ]}
      />
      <Row
        label={t('size-label', { defaultValue: 'Subtitle size' })}
        description={t('size-desc', { defaultValue: 'How large subtitles are drawn over the video' })}
        value={size}
        onChange={(value) => setSize(value as SubtitleSize)}
        options={SUBTITLE_SIZES.map((value) => ({ value, label: sizeNames[value] }))}
      />
    </>
  );
}
