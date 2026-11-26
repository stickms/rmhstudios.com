/**
 * SentenceLine — the sentence the table is typing.
 *
 * Typed and untyped letters differ by weight and by underline, never by colour
 * alone: typed letters are semibold with no underline, untyped letters are
 * regular weight and underlined, and the next letter has the heavy underline.
 * The characters are hidden from the screen reader, which reads the sentence
 * once, and each finished word is announced by the game's live region.
 */

import { useTranslation } from 'react-i18next';

interface SentenceLineProps {
  text: string;
  /** Index of the next character to type; the sentence length when it is complete. */
  cursor: number;
}

function charClass(index: number, cursor: number): string {
  if (index < cursor) return 'font-semibold text-app-text';
  if (index === cursor) return 'font-normal text-app-text underline decoration-4 underline-offset-4';
  return 'font-normal text-app-text-muted underline decoration-1 underline-offset-4';
}

export default function SentenceLine({ text, cursor }: SentenceLineProps) {
  const { t } = useTranslation('human-keyboard');

  // One block per word so a line never breaks inside a word
  const words: Array<{ start: number; chars: string[] }> = [];
  let start = 0;
  for (const word of text.split(' ')) {
    words.push({ start, chars: word.split('') });
    start += word.length + 1;
  }

  // A paragraph has no role that takes an aria-label, so the screen reader's
  // reading is visually hidden text beside the hidden letters.
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-2xl leading-snug" data-testid="hk-sentence">
      <span className="sr-only">
        {t('sentence-label', {
          defaultValue: 'The sentence: {{text}}. {{typed}} of {{total}} letters typed.',
          text,
          typed: text.slice(0, cursor).replace(/ /g, '').length,
          total: text.replace(/ /g, '').length,
        })}
      </span>
      {words.map((word) => (
        <span key={word.start} className="inline-block whitespace-nowrap" aria-hidden="true">
          {word.chars.map((ch, i) => (
            <span key={word.start + i} className={charClass(word.start + i, cursor)}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
