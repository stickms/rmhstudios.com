import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { getQotdTodayApi } from '@/lib/posts-plus/qotd.contract';
import { useQotdAnswering } from '@/lib/posts-plus/qotd-store';
import { HOME_COMPOSER_INPUT_ID } from '@/components/feed/home-composer-id';

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
  const navigate = useNavigate();
  // Steel M9: the card is fetched after idle and lands among posts already showing, so it fades in.
  const arrival = useArrival(!!today && !hidden);

  useEffect(() => {
    let cancelled = false;
    api(getQotdTodayApi, { retries: 0 })
      .then((d) => {
        if (cancelled) return;
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
    // The home composer is a desktop row; where it is not displayed (a phone) the answer is written on the question's own page.
    const box = document.getElementById(HOME_COMPOSER_INPUT_ID);
    if (!box || box.offsetParent === null) {
      void navigate({ to: '/qotd' });
      return;
    }
    box.scrollIntoView({ block: 'center' });
    box.focus({ preventScroll: true });
  };

  // A dotless spine item (P3): a prompt, not a post. Plain words and a text link; nothing is boxed, tinted or coloured.
  return (
    <SpineItem
      as="section"
      dot={false}
      className={arrival}
      aria-label={t('qotd-card-label', { defaultValue: 'Question of the day' })}
    >
      <p className="t-label">{t('qotd-card-label', { defaultValue: 'Question of the day' })}</p>
      <p className="t-post mt-1 font-medium">{today.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button size="sm" variant="default" onClick={answer}>
          {t('qotd-answer', { defaultValue: 'Answer' })}
        </Button>
        <Link to="/qotd" className="t-body text-site-text-muted underline hover:text-site-text">
          {today.answerCount > 0
            ? t('qotd-see-answers', {
                defaultValue: 'See all {{n}} answers',
                n: today.answerCount,
              })
            : t('qotd-be-first', { defaultValue: 'Be the first to answer' })}
        </Link>
        {today.myAnswers > 0 && (
          <span className="t-body font-semibold">
            {t('qotd-answered', { defaultValue: 'You answered today' })}
          </span>
        )}
        <button type="button" className="feed-action" onClick={dismiss}>
          {t('qotd-dismiss', { defaultValue: "Hide today's question" })}
        </button>
      </div>
    </SpineItem>
  );
}
