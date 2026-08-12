'use client';

/**
 * The bottom-right assistant: a floating button that opens a message centre for
 * asking questions about the schedule.
 *
 * It answers from the board only (`lib/pf2ecal/assistant.server.ts` builds the
 * grounding), so it is useful for the things that are tedious to work out by
 * eye — "when's the next one I said I'd miss", "has anyone replied to the 26th",
 * "what did we say about the Friday" — and honest about the things it cannot
 * know. It cannot change anything; the prompt says so and there is no write path
 * behind it.
 *
 * Three UI decisions worth stating:
 *
 * - **The panel is a real dialog on a phone and a docked card on a desktop.**
 *   A 380px card floating over a 375px viewport is a card that covers the page,
 *   so below `sm` it goes full-width and bottom-anchored where a thumb is.
 * - **The transcript is local and ephemeral.** Nothing is persisted; the history
 *   is re-sent with each question (capped server-side). A shared page storing
 *   everyone's questions server-side would be a surprise, and there is no
 *   version of "who asked what" this group needs.
 * - **The launcher is `position: fixed` and inset by the safe area**, so it does
 *   not sit under the home indicator on an iPhone.
 */

// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level.
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowUp, Bot, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusLine, useAssistantStatus } from './Loading';
import { RichText } from './rich-text';
import { EASE, SPRING_PANEL, SPRING_PRESS } from './motion';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Openers that demonstrate what it is for. Deliberately phrased as the
 * questions people actually have, not as feature names — an empty chat box with
 * no prompt is the fastest way to make an assistant look useless.
 *
 * Written out as literal `t()` calls rather than mapped over a table of keys:
 * `i18next-parser` reads source, so `t(row.key)` extracts nothing and these
 * would be English in every language forever, silently.
 */
function useSuggestions(): string[] {
  const { t } = useTranslation('r-pf2ecal');
  return [
    t('ask-next-session', { defaultValue: 'When is the next session?' }),
    t('ask-whos-confirmed', { defaultValue: "Who's confirmed for the next game?" }),
    t('ask-no-replies', { defaultValue: 'Which sessions has nobody replied to?' }),
    t('ask-last-announcement', { defaultValue: 'What was the last announcement?' }),
  ];
}

/**
 * The assistant needs no account: it only reads the board, which anyone holding
 * the link can already read. Signing in adds one thing — your name reaches the
 * prompt, so "am I down for next week" resolves against the roster.
 */
export function Assistant() {
  const { t } = useTranslation('r-pf2ecal');
  const suggestions = useSuggestions();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A DeepSeek round-trip is seconds, not milliseconds. Three dots alone leave
  // the user unable to tell "thinking" from "hung", so the dots are joined by a
  // line that says what stage it is at and escalates if it drags.
  const thinkingStatus = useAssistantStatus(pending);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Aborts the in-flight question when the panel closes, so a slow answer to a
  // question the user has walked away from does not land in a later session.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, [open]);

  // Keep the newest turn in view. `behavior: 'smooth'` on a container that just
  // grew is the one place smooth scrolling reads as responsive rather than slow.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns, pending]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const history = turns.slice(-6);
    setTurns((current) => [...current, { role: 'user', content: trimmed }]);
    setDraft('');
    setPending(true);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/pf2ecal/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history }),
        signal: controller.signal,
      });
      const data = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !data.answer) {
        setError(
          data.error ?? t('ask-failed', { defaultValue: 'That did not go through. Try again.' }),
        );
        return;
      }
      setTurns((current) => [...current, { role: 'assistant', content: data.answer as string }]);
    } catch (cause) {
      // An abort is the user closing the panel, not a failure to report.
      if ((cause as Error)?.name !== 'AbortError') {
        setError(
          t('ask-unreachable', {
            defaultValue: 'Could not reach the assistant. Check your connection.',
          }),
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {/* ── Launcher ──────────────────────────────────────────────────────── */}
      <motion.button
        type="button"
        className="pf2e-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          open
            ? t('assistant-close', { defaultValue: 'Close the assistant' })
            : t('assistant-open', { defaultValue: 'Ask about the schedule' })
        }
        whileTap={{ scale: 0.94 }}
        transition={SPRING_PRESS}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.14, ease: EASE }}
              className="flex"
            >
              <X size={20} aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ opacity: 0, rotate: 45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -45 }}
              transition={{ duration: 0.14, ease: EASE }}
              className="flex"
            >
              <Sparkles size={20} aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="pf2e-assistant"
            role="dialog"
            aria-label={t('assistant-title', { defaultValue: 'Schedule assistant' })}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={SPRING_PANEL}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          >
            <header className="pf2e-assistant-head">
              <div className="flex min-w-0 items-center gap-2">
                <Bot size={16} aria-hidden />
                <div className="min-w-0">
                  <p className="pf2e-title text-[0.9375rem]">
                    {t('assistant-open', { defaultValue: 'Ask about the schedule' })}
                  </p>
                  <p className="pf2e-caption truncate">
                    {t('assistant-scope', { defaultValue: 'Answers from this board only' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
                onClick={() => setOpen(false)}
                aria-label={t('close', { defaultValue: 'Close' })}
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <div className="pf2e-assistant-body" ref={scrollRef}>
              {turns.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="pf2e-caption">
                    {t('assistant-blurb', {
                      defaultValue:
                        'It can read the sessions, the replies and the announcements on this page. It can\u2019t change anything \u2014 use the buttons for that.',
                    })}
                  </p>
                  <div className="flex flex-col gap-1.5 pt-1">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="pf2e-suggestion"
                        onClick={() => void ask(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((turn, index) => (
                <motion.div
                  // Index is a safe key here: the transcript is append-only and
                  // never reorders or deletes.
                  key={`${turn.role}-${index}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className={turn.role === 'user' ? 'pf2e-msg-user' : 'pf2e-msg-bot'}
                >
                  {/* The user's own text is shown verbatim — they typed it, and
                      formatting it would be putting words in their mouth. Only
                      the model's side is parsed. */}
                  {turn.role === 'user' ? turn.content : <RichText text={turn.content} />}
                </motion.div>
              ))}

              {pending && (
                <div className="flex flex-col gap-1.5">
                  <div className="pf2e-msg-bot" aria-hidden>
                    <span className="pf2e-typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <StatusLine message={thinkingStatus} />
                </div>
              )}

              {error && (
                <p className="pf2e-caption" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="pf2e-assistant-foot">
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(draft);
                }}
              >
                <label className="pf2e-sr-only" htmlFor="pf2e-ask">
                  {t('your-question', { defaultValue: 'Your question' })}
                </label>
                <textarea
                  id="pf2e-ask"
                  ref={inputRef}
                  className="pf2e-field pf2e-ask"
                  rows={1}
                  value={draft}
                  maxLength={500}
                  placeholder={t('ask-placeholder', { defaultValue: "When's the next session?" })}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends, Shift+Enter breaks the line — the shape
                    // every chat composer has, so nobody has to learn it.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void ask(draft);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="pf2e-btn pf2e-btn-primary pf2e-btn-icon"
                  disabled={!draft.trim() || pending}
                  aria-label={t('send', { defaultValue: 'Send' })}
                >
                  <ArrowUp size={17} aria-hidden />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
