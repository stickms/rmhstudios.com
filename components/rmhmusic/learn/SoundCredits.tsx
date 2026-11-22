/**
 * SoundCredits — `/rmhmusic/credits`: where each recorded sound comes from, under which licence,
 * and what we changed. Salamander (CC BY 3.0) asks for attribution and a note of changes; the
 * guitar's MIT notice must travel with the files, so its full text is here verbatim. Reached from
 * the Sound dialog. The licence texts are legal text and stay in English. A long licence text
 * scrolls in its own box, so the box is a named region that takes keyboard focus to be scrolled.
 * The same credits ship beside the samples as CREDITS.txt (`creditsText()` in `credits.ts`).
 */
import { useTranslation } from 'react-i18next';
import { INSTRUMENT_CATALOG } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import { CREDIT_ORDER as ORDER, SOUND_CREDITS } from '@/lib/rmhmusic/learn/audio/instruments/credits';
import { INSTRUMENT_IDS } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { Shell } from './LessonScreen';
import { soundName } from './SoundDialog';

export function SoundCredits() {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <Shell
      title={t('credits-title', {
        defaultValue: 'Sound credits',
      })}
    >
      <p className="text-app-text-muted">
        {t('credits-intro', {
          defaultValue: 'The lessons play recordings of real instruments. These are their makers and licences.',
        })}
      </p>
      {ORDER.map((id) => {
        const c = SOUND_CREDITS[id];
        const used = INSTRUMENT_IDS.filter((i) => INSTRUMENT_CATALOG[i].credit === id)
          .map((i) => soundName(t, i))
          .join(', ');
        return (
          <section key={id} aria-labelledby={`credit-${id}`} className="rmm-sheet space-y-2 p-5 sm:p-6">
            <h2 id={`credit-${id}`} className="text-lg font-semibold break-words text-app-text">
              {c.work}
            </h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-app-text-muted">
                {t('credits-sound', {
                  defaultValue: 'Sound',
                })}
              </dt>
              <dd className="text-app-text">{used}</dd>
              <dt className="text-app-text-muted">
                {t('credits-author', {
                  defaultValue: 'By',
                })}
              </dt>
              <dd className="text-app-text">{c.author}</dd>
              <dt className="text-app-text-muted">
                {t('credits-licence', {
                  defaultValue: 'Licence',
                })}
              </dt>
              <dd className="break-words text-app-text">
                {c.licenceUrl ? (
                  <a
                    href={c.licenceUrl}
                    rel="noopener noreferrer license"
                    target="_blank"
                    className="text-app-accent underline underline-offset-4"
                  >
                    {c.licence}
                  </a>
                ) : (
                  c.licence
                )}
              </dd>
              <dt className="text-app-text-muted">
                {t('credits-source', {
                  defaultValue: 'Source',
                })}
              </dt>
              <dd className="break-words">
                <a
                  href={c.sourceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-app-accent underline underline-offset-4"
                >
                  {c.sourceUrl.replace(/^https:\/\//, '')}
                </a>
              </dd>
              {c.fetchedFrom && (
                <>
                  <dt className="text-app-text-muted">
                    {t('credits-fetched-from', {
                      defaultValue: 'Fetched from',
                    })}
                  </dt>
                  <dd className="break-words">
                    <a
                      href={c.fetchedFrom}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="text-app-accent underline underline-offset-4"
                    >
                      {c.fetchedFrom.replace(/^https:\/\//, '')}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            {c.note && <p className="text-sm text-app-text">{c.note}</p>}
            <p className="text-sm text-app-text-muted">
              <span className="font-medium text-app-text">
                {t('credits-changes-label', {
                  defaultValue: 'Changes:',
                })}{' '}
              </span>
              {c.changes}
            </p>
            {c.licenceText && (
              <pre
                tabIndex={0}
                role="region"
                aria-label={t('credits-licence-text', {
                  work: c.work,
                  defaultValue: 'Licence text for {{work}}',
                })}
                className="max-h-80 overflow-auto rounded-app-sm bg-app-surface p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-app-text"
              >
                {c.licenceText}
              </pre>
            )}
          </section>
        );
      })}
    </Shell>
  );
}
