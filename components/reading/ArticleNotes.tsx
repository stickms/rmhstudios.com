'use client';

/**
 * L2 footnotes and L6 glossary terms inside article bodies.
 *
 * Both render server-side as plain markup and are interactive after hydration.
 * They live in the article routes' dependency graph (so in the entry chunk) and
 * are kept small for that reason; the heavier highlight machinery is lazy.
 */

import { createContext, useContext, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import type { Footnote } from '@/lib/reading/footnotes';
import type { GlossaryTermView } from '@/lib/reading/schema';
import { PopoverPanel, useAnchoredPopover } from './InlinePopover';

export const GlossaryContext = createContext<Map<string, GlossaryTermView>>(new Map());

const NOTE_ELEMENTS = ['a', 'em', 'strong', 'code', 'del'];

function NoteText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      allowedElements={NOTE_ELEMENTS}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => {
          const external = !!href && !/^(\/|#)/.test(href);
          return (
            <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function FootnoteRef({ note, occurrence }: { note: Footnote; occurrence: number }) {
  const { t } = useTranslation('f-reading');
  const pop = useAnchoredPopover<HTMLAnchorElement>();
  const label = t('footnote-n', { n: note.index, defaultValue: 'Footnote {{n}}' });
  return (
    <span className="rf-fn" data-rf-skip="">
      <a
        ref={pop.triggerRef}
        id={`rf-ref-${note.index}-${occurrence}`}
        href={`#rf-fnl-${note.index}`}
        className="rf-fn__ref"
        aria-label={label}
        aria-expanded={pop.open}
        aria-controls={pop.open ? pop.id : undefined}
        onClick={(e) => {
          // With margin sidenotes showing the note is already on screen.
          if (e.currentTarget.closest('[data-sidenotes="on"]')) return e.preventDefault();
          e.preventDefault();
          pop.toggle();
        }}
      >
        {note.index}
      </a>
      {occurrence === 1 ? (
        <span className="rf-sn" role="note" id={`rf-fn-${note.index}`}>
          <span className="rf-sn__n" aria-hidden>
            {note.index}
          </span>
          <NoteText text={note.text} />
        </span>
      ) : null}
      <PopoverPanel state={pop} label={label}>
        <NoteText text={note.text} />
      </PopoverPanel>
    </span>
  );
}

/** Always-present notes list: the no-JS / narrow-screen / print fallback. */
export function FootnoteList({ notes }: { notes: Footnote[] }) {
  const { t } = useTranslation('f-reading');
  if (notes.length === 0) return null;
  return (
    <section
      className="rf-footnotes"
      data-rf-skip=""
      aria-label={t('footnotes', { defaultValue: 'Footnotes' })}
    >
      <ol>
        {notes.map((n) => (
          <li key={n.label} id={`rf-fnl-${n.index}`}>
            <NoteText text={n.text} />{' '}
            <a
              href={`#rf-ref-${n.index}-1`}
              aria-label={t('back-to-text', { defaultValue: 'Back to the text' })}
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function GlossaryTermLink({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation('f-reading');
  const term = useContext(GlossaryContext).get(id);
  const pop = useAnchoredPopover<HTMLButtonElement>();
  if (!term) return <>{children}</>;
  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        className="rf-term"
        aria-expanded={pop.open}
        aria-controls={pop.open ? pop.id : undefined}
        aria-haspopup="dialog"
        onClick={pop.toggle}
      >
        {children}
      </button>
      <PopoverPanel
        state={pop}
        label={t('glossary-term', { term: term.term, defaultValue: 'Glossary: {{term}}' })}
      >
        <p className="rf-pop__title">{term.term}</p>
        <p>{term.definition}</p>
        {term.linkUrl ? (
          <p className="mt-2">
            <a
              href={term.linkUrl}
              {...(term.linkUrl.startsWith('http')
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              {t('glossary-learn-more', { defaultValue: 'Learn more' })}
            </a>
          </p>
        ) : null}
      </PopoverPanel>
    </>
  );
}
