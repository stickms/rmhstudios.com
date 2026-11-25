/**
 * What a moderation report was about, in the reader's language, for the admins' review notices (sprint 12, feature 19).
 *
 * The words are the `kind-*` labels `components/moderation/MyReportsPanel.tsx` shows a reporter, in the same
 * `my-reports` namespace, so a kind is translated once. A kind this map does not know is shown as written.
 */
import type { TFunction } from 'i18next';

/** A name inside a translated sentence, isolated so its direction never reorders the sentence. */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}

export function reportKindLabel(t: TFunction, kind: unknown): string {
  const k = String(kind ?? '');
  const labels: Record<string, string> = {
    rmhark: t('kind-rmhark', { ns: 'my-reports', defaultValue: 'Post' }),
    comment: t('kind-comment', { ns: 'my-reports', defaultValue: 'Reply' }),
    user: t('kind-user', { ns: 'my-reports', defaultValue: 'Profile' }),
    build: t('kind-build', { ns: 'my-reports', defaultValue: 'Build' }),
    dm: t('kind-dm', { ns: 'my-reports', defaultValue: 'Message' }),
    song: t('kind-song', { ns: 'my-reports', defaultValue: 'Song' }),
    stamp: t('kind-stamp', { ns: 'my-reports', defaultValue: 'Stamp' }),
    webring: t('kind-webring', { ns: 'my-reports', defaultValue: 'Webring' }),
    'ladder-interview': t('kind-ladder-interview', { ns: 'my-reports', defaultValue: 'Interview report' }),
    'music-score': t('kind-music-score', { ns: 'my-reports', defaultValue: 'Music score' }),
    'music-share': t('kind-music-share', { ns: 'my-reports', defaultValue: 'Shared music result' }),
    'jam-feedback': t('kind-jam-feedback', { ns: 'my-reports', defaultValue: 'Jam feedback' }),
    'build-comment': t('kind-build-comment', { ns: 'my-reports', defaultValue: 'Build comment' }),
    'build-issue': t('kind-build-issue', { ns: 'my-reports', defaultValue: 'Build issue' }),
    'lights-out-board': t('kind-lights-out-board', { ns: 'my-reports', defaultValue: 'Lights Out board' }),
    'studio-share': t('kind-studio-share', { ns: 'my-reports', defaultValue: 'Shared Studio project' }),
    'connections-grid': t('kind-connections-grid', { ns: 'my-reports', defaultValue: 'Connections grid' }),
    'study-deck': t('kind-study-deck', { ns: 'my-reports', defaultValue: 'Flashcard deck' }),
    persona: t('kind-persona', { ns: 'my-reports', defaultValue: 'AI persona' }),
    'home-listing': t('kind-home-listing', { ns: 'my-reports', defaultValue: 'Home listing' }),
  };
  return Object.prototype.hasOwnProperty.call(labels, k) ? (labels[k] ?? k) : k;
}
