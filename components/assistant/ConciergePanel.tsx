import { useCallback, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Sparkles, Send, ArrowRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { cn } from '@/lib/utils';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { askConciergeApi } from '@/lib/assistant/assistant.contract';

interface ConciergeLink {
  label: string;
  to: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  links?: ConciergeLink[];
  /** A local failure notice, shown in the thread but never sent back as history. */
  error?: boolean;
}

/**
 * The conversation as the model should see it: failure bubbles are ours, not
 * the assistant's, and the question that failed was never answered, so both are
 * left out rather than replayed as if the guide had said them.
 */
function historyFor(messages: Message[]) {
  const out: Message[] = [];
  for (const m of messages) {
    if (m.error) {
      if (out.length && out[out.length - 1].role === 'user') out.pop();
      continue;
    }
    out.push(m);
  }
  return out.map((m) => ({ role: m.role, content: m.content }));
}

// Keys are stable so translations can override; defaults are the shown chips.
const SUGGESTIONS: { key: string; text: string }[] = [
  { key: 'concierge-suggest-new', text: "What's new this week?" },
  { key: 'concierge-suggest-3friends', text: 'Find me a game for 3 friends' },
  { key: 'concierge-suggest-coins', text: 'How do coins work?' },
  { key: 'concierge-suggest-theme', text: 'Where do I change my theme?' },
];

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

export function ConciergePanel({ className }: { className?: string }) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      if (!session) {
        toast.error(t('concierge-signin', { defaultValue: 'Sign in to ask the concierge.' }));
        return;
      }

      const history = historyFor(messages);
      const userMsg: Message = { id: nextId(), role: 'user', content: q };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      scrollToEnd();

      try {
        const data = await api(askConciergeApi, {
          body: { question: q, history },
          timeoutMs: AI_TIMEOUT_MS,
        });
        if (!data.answer) {
          const msg = t('concierge-error', {
            defaultValue: "Couldn't reach the guide. Try again.",
          });
          toast.error(msg);
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', content: msg, error: true },
          ]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: data.answer, links: data.links ?? [] },
        ]);
      } catch (e) {
        const generic = t('concierge-error', {
          defaultValue: "Couldn't reach the guide. Try again.",
        });
        if (e instanceof HttpError) {
          // The server's own words, except for the rate limit, which has copy of its own.
          const msg = serverError(e) || generic;
          if (e.status === 429) {
            toast.error(t('concierge-slow', { defaultValue: 'Slow down a moment and try again.' }));
          } else {
            toast.error(msg);
          }
          // Drop the optimistic user turn's expectation by adding an error bubble.
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', content: msg, error: true },
          ]);
        } else {
          toast.error(generic);
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', content: generic, error: true },
          ]);
        }
      } finally {
        setLoading(false);
        scrollToEnd();
      }
    },
    [loading, messages, session, t, scrollToEnd],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-site-accent/15 text-site-accent">
              <Sparkles className="size-7" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-site-text">
              {t('concierge-title', { defaultValue: 'Ask the RMH concierge' })}
            </h2>
            <p className="mt-2 text-sm text-site-text-muted">
              {t('concierge-subtitle', {
                defaultValue:
                  'Questions about games, apps, coins, or where to find something? Ask away.',
              })}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex flex-col gap-2',
                  m.role === 'user' ? 'items-end' : 'items-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-site px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-site-accent text-site-accent-fg'
                      :'text-site-text',
                  )}
                >
                  {m.content}
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.links.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to as string}
                        className="surface-press inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-site-accent"
                      >
                        {l.label}
                        <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-site-text-muted">
                <Spinner size={16} />
                <span className="text-sm">
                  {t('concierge-thinking', { defaultValue: 'Thinking…' })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-site-border bg-site-bg/60 px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {/* Suggested-question chips */}
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={loading}
                onClick={() => void ask(t(s.key, { defaultValue: s.text }))}
                className="surface-press inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs text-site-text-muted transition-colors hover:border-site-accent/50 hover:text-site-text disabled:opacity-50"
              >
                {t(s.key, { defaultValue: s.text })}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={500}
              placeholder={t('concierge-placeholder', { defaultValue: 'Ask about RMH Studios…' })}
              className="min-h-11 max-h-32 resize-none rounded-site"
              aria-label={t('concierge-input-label', {
                defaultValue: 'Your question for the concierge',
              })}
            />
            <Button
              type="submit"
              variant="default"
              size="icon"
              disabled={loading || !input.trim()}
              aria-label={t('concierge-send', { defaultValue: 'Send' })}
            >
              {loading ? <Spinner size={16} /> : <Send className="size-4" aria-hidden />}
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-site-text-muted">
            {t('concierge-disclaimer', {
              defaultValue:
                'The concierge answers questions about RMH Studios. It can be wrong — verify anything important.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
