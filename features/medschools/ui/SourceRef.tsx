import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';

/**
 * Where a figure or a sentence comes from, as one quiet icon at the trailing end of its heading or value row (owner
 * 2026-11-24). Hover or keyboard focus shows the source on the overlay surface (the shared `AnchoredMenu` as a
 * non-modal dialog: it portals, flips and closes on Escape and an outside press); a press or tap pins it open and moves
 * focus to "Open source", so a tap never navigates by itself. The link opens the exact place: a text fragment on a page
 * whose words we hold, `#page=N` on a PDF (built by `engine/text-fragment.ts`).
 *
 * Attribution never depends on the popover: `attribution` (the full "Source: …" line) is in the server HTML as visually
 * hidden text and is the button's accessible description. The AAMC permission requires it.
 */
/** The popover's state: closed, peeking (hover or focus: shown, focus stays on the icon) or pinned (pressed or tapped). */
export interface SourceRefState {
  open: boolean;
  pinned: boolean;
}
export const SOURCE_REF_CLOSED: SourceRefState = { open: false, pinned: false };

/**
 * Pure: hover or focus peeks (and never unpins); a press pins, and a second press on a pinned popover closes it; close
 * (Escape, an outside press, the pointer leaving a peek) always closes. A tap is a press, so it opens and never
 * navigates.
 */
export function nextSourceRef(s: SourceRefState, event: 'peek' | 'press' | 'close'): SourceRefState {
  switch (event) {
    case 'peek':
      return s.open ? s : { open: true, pinned: false };
    case 'press':
      return s.open && s.pinned ? SOURCE_REF_CLOSED : { open: true, pinned: true };
    case 'close':
      return SOURCE_REF_CLOSED;
  }
}

export function SourceRef({
  name,
  detail,
  note,
  quote,
  href,
  attribution,
}: {
  /** "AAMC MSAR report · Applications Accepted Information", "Duke admissions page". */
  name: string;
  /** "2027 entering class · checked November 1, 2026". */
  detail?: string | undefined;
  /** A caveat the source carries ("Compiled by Admit.org; confirm with the school."). */
  note?: string | undefined;
  /** The source's own words, when we store them. */
  quote?: string | null | undefined;
  /** The deep link. */
  href: string;
  /** The full attribution line, always in the HTML. */
  attribution: string;
}) {
  const { t } = useTranslation('medschools');
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SourceRefState>(SOURCE_REF_CLOSED);
  const { open, pinned } = state;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = () => {
    cancelClose();
    setState((s) => nextSourceRef(s, 'close'));
  };
  const closeSoon = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(close, 160);
  };
  useEffect(() => cancelClose, []);
  // A press pins the popover and hands focus to its link, so the keyboard can follow it and Escape returns here.
  useEffect(() => {
    if (open && pinned) linkRef.current?.focus();
  }, [open, pinned]);

  const label = t('source-ref-label', { defaultValue: 'Source: {{name}}', name });
  return (
    <span className="medapp-srcref-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="medapp-srcref"
        aria-label={label}
        aria-describedby={`${id}-attr`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-slot="med-source-ref"
        data-href={href}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelClose();
          setState((s) => nextSourceRef(s, 'peek'));
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') closeSoon();
        }}
        onFocus={() => setState((s) => nextSourceRef(s, 'peek'))}
        onBlur={(e) => {
          // Focus moving into the popover (the pinned link) keeps it open.
          if (!pinned && !e.relatedTarget?.closest?.('[data-med-source-pop]')) closeSoon();
        }}
        onClick={() => {
          cancelClose();
          setState((s) => nextSourceRef(s, 'press'));
        }}
      >
        <BookOpen aria-hidden="true" className="size-4" />
      </button>
      <span id={`${id}-attr`} className="sr-only">
        {attribution}
      </span>
      <AnchoredMenu
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        label={label}
        role="dialog"
        focusOnOpen={false}
        className="w-72"
      >
        <div
          className="medapp-srcpop"
          data-med-source-pop=""
          onPointerEnter={cancelClose}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') closeSoon();
          }}
        >
          <p className="medapp-srcpop__name">{name}</p>
          {detail ? <p className="medapp-srcpop__meta">{detail}</p> : null}
          {quote ? <blockquote className="medapp-srcpop__quote">{quote}</blockquote> : null}
          {note ? <p className="medapp-srcpop__meta">{note}</p> : null}
          <a
            ref={linkRef}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="medapp-srcpop__link"
            aria-label={t('source-ref-open-label', {
              defaultValue: 'Source: {{name}}, opens in a new tab',
              name,
            })}
          >
            {t('source-ref-open', { defaultValue: 'Open source' })}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </AnchoredMenu>
    </span>
  );
}
