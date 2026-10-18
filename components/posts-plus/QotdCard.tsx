'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MessageCircleQuestion, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useQotdAnswering } from '@/lib/posts-plus/qotd-store';

interface Today {
  dayKey: string;
  text: string;
  answerCount: number;
  myAnswers: number;
}

const dismissKey = (dayKey: string) => `qotd-dismissed:${dayKey}`;

function wasDismissed(dayKey: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(dayKey)) === '1';
  } catch {
    return false;
  }
}

/**
 * X4 - the question-of-the-day card at the head of the home feed. Mounted by
 * QotdCardLazy once the page is idle, so it costs the first paint nothing. It
 * is dismissible for the day, and "Answer" tags the composer (it does not open a
 * second one): the answer is an ordinary post.
 */
export default function QotdCard() {
  const { t } = useTranslation('f-posts-plus');
  const [today, setToday] = useState<Today | null>(null);
  const [hidden, setHidden] = useState(false);
  const start = useQotdAnswering((s) => s.start);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/qotd/today', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Today | null) => {
        if (cancelled || !d) return;
        setToday(d);
        setHidden(wasDismissed(d.dayKey));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!today || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(dismissKey(today.dayKey), '1');
    } catch {
      /* private mode: it just comes back next load */
    }
  };

  const answer = () => {
    start({ dayKey: today.dayKey, text: today.text });
    // The composer sits right below; focusing it also wakes the lazy placeholder.
    const box = document.querySelector<HTMLTextAreaElement>('.social-composer textarea');
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box?.focus({ preventScroll: true });
  };

  return (
    <section
      className="glass-fill rounded-site mx-3 mb-3 flex items-start gap-3 px-4 py-3"
      aria-label={t('qotd-card-label', { defaultValue: 'Question of the day' })}
    >
      <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-site-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">
          {t('qotd-card-label', { defaultValue: 'Question of the day' })}
        </p>
        <p className="mt-0.5 text-sm font-medium text-site-text">{today.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="accent" onClick={answer}>
            {t('qotd-answer', { defaultValue: 'Answer' })}
          </Button>
          <Link
            to="/qotd"
            className="text-xs text-site-text-muted underline-offset-2 hover:text-site-text hover:underline"
          >
            {today.answerCount > 0
              ? t('qotd-see-answers', {
                  defaultValue: 'See all {{n}} answers',
                  n: today.answerCount,
                })
              : t('qotd-be-first', { defaultValue: 'Be the first to answer' })}
          </Link>
          {today.myAnswers > 0 && (
            <span className="text-xs text-site-success">
              {t('qotd-answered', { defaultValue: 'You answered today' })}
            </span>
          )}
        </div>
      </div>
      <IconButton
        icon={X}
        variant="ghost"
        size="icon-xs"
        onClick={dismiss}
        label={t('qotd-dismiss', { defaultValue: "Hide today's question" })}
      />
    </section>
  );
}
