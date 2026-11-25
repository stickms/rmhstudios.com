import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DECK_LANGUAGE_TAGS } from '@/lib/study/listen';

/** A language's name in the viewer's own language; the tag itself where the browser has no name for it. */
function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * "Front language" and "Back language" in a deck's settings (s11-17): what the cards are written in, so Listen reads
 * each side in a matching voice. "Same as the site" (an empty value) is the site's language. The owner's setting.
 */
export function DeckLanguages({
  frontLang,
  backLang,
  onFrontChange,
  onBackChange,
}: {
  /** A tag from `DECK_LANGUAGE_TAGS`, or '' for the site's language. */
  frontLang: string;
  backLang: string;
  onFrontChange: (tag: string) => void;
  onBackChange: (tag: string) => void;
}) {
  const { t, i18n } = useTranslation('card-listen');
  const uid = useId();
  // The names come from the browser's own data, so they are filled in after mount; the server and the first client
  // render both show the tags.
  const [names, setNames] = useState<Record<string, string>>({});
  const locale = i18n.language;
  useEffect(() => {
    setNames(Object.fromEntries(DECK_LANGUAGE_TAGS.map((tag) => [tag, languageName(tag, locale)])));
  }, [locale]);
  const options = DECK_LANGUAGE_TAGS.map((tag) => (
    <option key={tag} value={tag}>
      {names[tag] ?? tag}
    </option>
  ));
  const same = t('lang-same', {
    defaultValue: 'Same as the site',
  });
  return (
    <div className="flex flex-col gap-3 border-b border-site-border pb-3">
      <p id={`${uid}-hint`} className="t-meta">
        {t('lang-hint', {
          defaultValue: 'Listen reads each side of a card in the language you choose for it.',
        })}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-front`}>
          {t('front-language', {
            defaultValue: 'Front language',
          })}
        </Label>
        <Select
          id={`${uid}-front`}
          aria-describedby={`${uid}-hint`}
          value={frontLang}
          onChange={(e) => onFrontChange(e.target.value)}
        >
          <option value="">{same}</option>
          {options}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-back`}>
          {t('back-language', {
            defaultValue: 'Back language',
          })}
        </Label>
        <Select
          id={`${uid}-back`}
          aria-describedby={`${uid}-hint`}
          value={backLang}
          onChange={(e) => onBackChange(e.target.value)}
        >
          <option value="">{same}</option>
          {options}
        </Select>
      </div>
    </div>
  );
}
