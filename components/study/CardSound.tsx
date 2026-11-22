import { useEffect, useId, useSyncExternalStore } from 'react';
import { Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { formatSoundLength, type CardSound as CardSoundValue, type CardSoundSide } from '@/lib/study/card-sound';
import { playingCardSound, stopCardSound, subscribeCardSound, toggleCardSound } from '@/lib/study/card-sound-player';

/** Silence whatever is playing when the calling screen goes away (a review, a practice test). */
export function useStopCardSoundOnUnmount(): void {
  useEffect(() => stopCardSound, []);
}

/**
 * A card side's sound (s10-02): a play button and, once `showTranscript` says so, the transcript under it. Nothing
 * autoplays and no audio element exists until the button is pressed. The button names its side ("Play the front's
 * sound") and, for assistive technology, is always described by the transcript: that is the sound's text
 * alternative. Visually the transcript waits for `showTranscript` (review: until the answer is revealed), so a
 * listening card stays a listening card.
 *
 * The transcript is member text, so it carries `dir="auto"`.
 */
export function CardSound({
  sound,
  side,
  showTranscript,
  className = 'items-center',
}: {
  sound: CardSoundValue;
  side: CardSoundSide;
  /** Show the transcript to everyone, not only to assistive technology. */
  showTranscript: boolean;
  /** Alignment of the button and transcript; centred by default (review), `items-start` in a list. */
  className?: string;
}) {
  const { t } = useTranslation('card-sound');
  const uid = useId();
  const playingUrl = useSyncExternalStore(subscribeCardSound, playingCardSound, () => null);
  const isPlaying = playingUrl === sound.url;
  const descriptionId = `${uid}-text`;

  const playLabel =
    side === 'front'
      ? t('play-front', { defaultValue: 'Play the front’s sound' })
      : t('play-back', { defaultValue: 'Play the back’s sound' });
  const stopLabel =
    side === 'front'
      ? t('stop-front', { defaultValue: 'Stop the front’s sound' })
      : t('stop-back', { defaultValue: 'Stop the back’s sound' });

  async function press() {
    const ok = await toggleCardSound(sound.url);
    if (!ok) toast.error(t('play-failed', { defaultValue: 'The sound could not be played.' }));
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Button
        type="button"
        variant="default"
        aria-label={isPlaying ? stopLabel : playLabel}
        aria-describedby={descriptionId}
        onClick={() => void press()}
      >
        {isPlaying ? <Square aria-hidden /> : <Play aria-hidden />}
        <span dir="ltr">{formatSoundLength(sound.durationMs)}</span>
      </Button>
      {/* The text alternative, always for assistive technology. */}
      <span id={descriptionId} dir="auto" className="sr-only">
        {t('transcript-description', { text: sound.transcript, defaultValue: 'Transcript: {{text}}' })}
      </span>
      {showTranscript && (
        <p dir="auto" data-card-sound-transcript="" className="t-meta max-w-prose break-words whitespace-pre-wrap">
          {sound.transcript}
        </p>
      )}
    </div>
  );
}
