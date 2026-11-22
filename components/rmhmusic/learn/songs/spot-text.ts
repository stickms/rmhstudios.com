/**
 * The words of spot practice (`lib/rmhmusic/learn/songs/spot.ts`): what the bars are called, the line
 * above the score, the tempo line, and what a finished pass says. One sentence per case, so a
 * translator never has to join fragments; the result sentence is also what the polite live region
 * says, so a tempo change is announced.
 */
import type { useTranslation } from 'react-i18next';
import { START_TEMPO_PCT, type PassResult, type SpotSegment, type SpotState } from '@/lib/rmhmusic/learn/songs/spot';

type T = ReturnType<typeof useTranslation>['t'];

/** "Bar 5", "Bars 5–6", "Pickup", "Pickup to bar 1": the segment as the score numbers its bars. */
export function segmentName(t: T, seg: Pick<SpotSegment, 'fromNumber' | 'toNumber'>): string {
  const { fromNumber: from, toNumber: to } = seg;
  if (from === to)
    return from === 0
      ? t('spot-pickup', { defaultValue: 'Pickup' })
      : t('spot-bar', { n: from, defaultValue: 'Bar {{n}}' });
  if (from === 0) return t('spot-pickup-bars', { to, defaultValue: 'Pickup to bar {{to}}' });
  return t('spot-bars', { from, to, defaultValue: 'Bars {{from}}–{{to}}' });
}

/** The heading over the score: which bars, and which of the offered segments. */
export function spotHeading(t: T, spot: Pick<SpotState, 'segments' | 'index'>): string {
  const seg = spot.segments[spot.index];
  return t('spot-heading', {
    bars: seg ? segmentName(t, seg) : '',
    n: spot.index + 1,
    total: spot.segments.length,
    defaultValue: 'Practising {{bars}} ({{n}} of {{total}})',
  });
}

/** The line before a pass is started. */
export function spotIntro(t: T, mode: SpotState['mode'], bars: string): string {
  return mode === 'play'
    ? t('spot-intro-play', {
        bars,
        pct: START_TEMPO_PCT,
        defaultValue: '{{bars}}, on a loop. It starts at {{pct}}% of the tempo and speeds up after each clean pass.',
      })
    : t('spot-intro-wait', {
        bars,
        defaultValue: '{{bars}}, on a loop. Play each note when you are ready.',
      });
}

/** The tempo line under the score: the next pass's tempo (play along) and its number. */
export function spotTempoLine(t: T, spot: Pick<SpotState, 'tempoPct' | 'pass'>): string {
  const n = spot.pass + 1;
  return spot.tempoPct === null
    ? t('spot-pass', { n, defaultValue: 'Pass {{n}}' })
    : t('spot-tempo', { pct: spot.tempoPct, n, defaultValue: 'Tempo {{pct}}% · Pass {{n}}' });
}

/** What a finished pass says (and the live region announces). */
export function spotResultLine(t: T, last: PassResult): string {
  if (last.tempoPct === null || last.nextTempoPct === null)
    return last.clean
      ? t('spot-clean-wait', { defaultValue: 'Clean pass. These bars are solid.' })
      : t('spot-retry-wait', { defaultValue: 'Not clean yet. Try these bars again.' });
  if (last.mastered) return t('spot-mastered', { defaultValue: 'Clean at full tempo. These bars are solid.' });
  if (last.clean)
    return t('spot-clean-up', { pct: last.nextTempoPct, defaultValue: 'Clean pass. Tempo is now {{pct}}%.' });
  if (last.nextTempoPct < last.tempoPct)
    return t('spot-slow-down', {
      pct: last.nextTempoPct,
      defaultValue: 'Several notes were off. Tempo is back to {{pct}}%.',
    });
  if (last.problems >= 3)
    return t('spot-slow-floor', {
      pct: last.nextTempoPct,
      defaultValue: 'Several notes were off. Staying at {{pct}}%.',
    });
  return t('spot-almost', { n: last.problems, defaultValue: 'Almost: {{n}} to fix. Same tempo again.' });
}
