'use client';

/**
 * The always-visible strip above an article: the Y2 reading-ruler switch and a
 * way into "My reading". Static and tiny so it is part of the server HTML and
 * adds no layout shift when the lazy enhancer arrives.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { useReadingRuler } from '@/lib/reading/ruler';

export function ReadingToolbar() {
  const { t } = useTranslation('f-reading');
  const [ruler, setRuler] = useReadingRuler();
  const id = useId();
  return (
    <div
      data-rf-skip=""
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-site-text-muted"
    >
      <span className="inline-flex items-center gap-2">
        <Switch
          id={id}
          checked={ruler}
          onCheckedChange={setRuler}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
        />
        <span id={`${id}-label`}>{t('ruler-label', { defaultValue: 'Reading ruler' })}</span>
        <span id={`${id}-hint`} className="sr-only">
          {t('ruler-hint', {
            defaultValue:
              'Dims everything except a line of text. Move it with the up and down arrow keys.',
          })}
        </span>
      </span>
      <Link
        to="/reading"
        search={{ tab: 'highlights' }}
        className="text-site-accent underline-offset-4 hover:underline"
      >
        {t('my-highlights-link', { defaultValue: 'My highlights' })}
      </Link>
    </div>
  );
}
