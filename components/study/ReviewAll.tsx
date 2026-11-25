import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { StudyTabs } from '@/components/feed/StudyTabs';
import { ClozeText } from '@/components/study/ClozeText';
import { OcclusionReview } from '@/components/study/OcclusionReview';
import { CardPicture, usePreloadPicture } from '@/components/study/CardPicture';
import { CardSound, useStopCardSoundOnUnmount } from '@/components/study/CardSound';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { reviewCardApi } from '@/lib/study/decks.contract';
import { reviewQueueApi, suspendCardApi } from '@/lib/study/queue.contract';
import { setDeckPaceApi } from '@/lib/study/pace.contract';
import { LEARN_MORE_STEP } from '@/lib/study/pace';
import { useReviewKeys } from '@/components/study/useReviewKeys';
import { LEECH_THRESHOLD } from '@/lib/study/queue';
import { stopCardSound, toggleCardSound } from '@/lib/study/card-sound-player';
import { ListenControls } from '@/components/study/ListenControls';
import { useCardListen } from '@/components/study/useCardListen';

const GRADES = [0, 1, 2, 3] as const;

/** The member's IANA zone, so a paced deck's "today" is theirs (the server falls back to UTC). */
function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

type Notice =
  | {
      kind: 'leech';
    }
  | {
      kind: 'suspended';
      cardId: string;
    };

/** "Review all": one session across every deck the member can read, then the finish screen. */
export function ReviewAll({
  folder,
}: {
  /** Review only this folder's decks (`?folder=`). */
  folder?: string;
} = {}) {
  const { t } = useTranslation('study-queue');
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = !!session?.user;

  // Each "Keep going" asks for the batch after the last one; a batch is fetched once and then held.
  const [after, setAfter] = useState<string | undefined>(undefined);
  // Keyboard: Space or Enter shows the answer, 1-4 grade it (Again, Hard, Good, Easy).
  const keysRef = useReviewKeys();
  const lastKeyRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const timeZone = viewerTimeZone();
  const query = useQuery({
    ...apiQuery(reviewQueueApi, {
      query: {
        ...(timeZone
          ? {
              tz: timeZone,
            }
          : {}),
        ...(after
          ? {
              after,
            }
          : {}),
        ...(folder
          ? {
              folder,
            }
          : {}),
      },
    }),
    enabled: signedIn,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const batch = query.data;
  const arrival = useArrival(!!batch);

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The next card's picture is fetched ahead of time (that card's only, never the whole session's).
  usePreloadPicture(batch?.cards[idx + 1]?.frontImage);
  // Leaving the review silences whatever is playing.
  useStopCardSoundOnUnmount();
  // Listen (s11-17): off, it starts nothing. On, each side is said in its deck's language and the answer is shown by
  // itself after the member's delay; it never grades.
  const listenCard = batch?.cards[idx] ?? null;
  const listen = useCardListen({
    card: listenCard,
    deck: {
      frontLang: listenCard?.frontLang ?? null,
      backLang: listenCard?.backLang ?? null,
    },
    revealed,
    onReveal: () => setRevealed(true),
  });
  const [reviewed, setReviewed] = useState(0);
  const [setAside, setSetAside] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busyRef = useRef(false);
  const [learning, setLearning] = useState<string | null>(null);

  // "Learn more": ten more new cards from a paced deck for the rest of the day, then the queue is read again.
  async function learnMore(deckId: string) {
    setLearning(deckId);
    try {
      await api(setDeckPaceApi, {
        params: {
          id: deckId,
        },
        body: {
          learnMore: true,
          ...(timeZone
            ? {
                tz: timeZone,
              }
            : {}),
        },
      });
      setIdx(0);
      setRevealed(false);
      setNotice(null);
      await query.refetch();
    } catch {
      toast.error(
        t('learn-more-failed', {
          ns: 'study-pace',
          defaultValue: 'Could not add more cards',
        }),
      );
    } finally {
      setLearning(null);
    }
  }

  const header = (
    <>
      <ColumnHeader
        icon={GraduationCap}
        title={t('title', {
          defaultValue: 'Review all',
        })}
      />
      <StudyTabs active="/study" />
    </>
  );

  if (sessionPending) {
    return (
      <div>
        {header}
        <div className="space-y-4 p-4" aria-busy>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div>
        {header}
        <SignedOutPrompt
          title={t('signed-out-title', {
            defaultValue: 'Sign in to review your cards',
          })}
          callbackURL="/study/review"
        />
      </div>
    );
  }
  if (query.isError && folder && query.error instanceof HttpError && query.error.status === 404) {
    return (
      <div>
        {header}
        <EmptyState
          title={t('review-folder-missing', {
            ns: 'deck-folders',
            defaultValue: 'That folder was not found',
          })}
          action={
            <Link to="/study">
              <Button variant="default">
                {t('back-to-decks', {
                  defaultValue: 'Back to decks',
                })}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div>
        {header}
        <EmptyState
          title={t('error-title', {
            defaultValue: 'Could not load your cards',
          })}
          action={
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          }
        />
      </div>
    );
  }
  if (!batch) {
    return (
      <div>
        {header}
        <div className="space-y-4 p-4" aria-busy>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const card = batch.cards[idx];
  const first = batch.cards.length === 0 && reviewed === 0;

  if (first) {
    return (
      <div className={arrival}>
        {header}
        <EmptyState
          icon={GraduationCap}
          title={t('empty-title', {
            defaultValue: 'Nothing due. Come back tomorrow.',
          })}
          action={
            <Link to="/study">
              <Button variant="default">
                {t('back-to-decks', {
                  defaultValue: 'Back to decks',
                })}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className={arrival}>
        {header}
        <div className="space-y-4 p-4">
          <h2 className="t-heading">
            {t('finish-title', {
              defaultValue: 'Session finished',
            })}
          </h2>
          <p className="t-body">
            {t('finish-reviewed', {
              count: reviewed,
              defaultValue_one: 'You reviewed {{count}} card.',
              defaultValue_other: 'You reviewed {{count}} cards.',
            })}
          </p>
          {setAside > 0 && (
            <p className="t-meta">
              {t('finish-set-aside', {
                count: setAside,
                defaultValue_one: '{{count}} card was set aside.',
                defaultValue_other: '{{count}} cards were set aside.',
              })}
            </p>
          )}
          {batch.learnMore && batch.learnMore.length > 0 && (
            <div>
              <p className="t-label">
                {t('learn-more-heading', {
                  ns: 'study-pace',
                  defaultValue: "Today's new cards are used up.",
                })}
              </p>
              <ul>
                {batch.learnMore.map((d) => (
                  <li
                    key={d.deckId}
                    className="flex items-center justify-between gap-2 border-b border-site-border py-2"
                  >
                    <span className="t-body min-w-0 truncate" dir="auto">
                      {d.deckTitle}
                    </span>
                    <Button
                      variant="default"
                      size="sm"
                      loading={learning === d.deckId}
                      disabled={learning !== null}
                      onClick={() => void learnMore(d.deckId)}
                    >
                      {t('learn-more', {
                        ns: 'study-pace',
                        count: LEARN_MORE_STEP,
                        defaultValue_one: 'Learn {{count}} more',
                        defaultValue_other: 'Learn {{count}} more',
                      })}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            {batch.next && (
              <Button
                variant="primary"
                onClick={() => {
                  setAfter(batch.next ?? undefined);
                  setIdx(0);
                  setRevealed(false);
                  setNotice(null);
                }}
              >
                {t('keep-going', {
                  defaultValue: 'Keep going',
                })}
              </Button>
            )}
            <Link to="/study">
              <Button variant={batch.next ? 'default' : 'primary'}>
                {t('back-to-decks', {
                  defaultValue: 'Back to decks',
                })}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const gradeLabels: Record<number, string> = {
    0: t('grade-again', {
      defaultValue: 'Again',
    }),
    1: t('grade-hard', {
      defaultValue: 'Hard',
    }),
    2: t('grade-good', {
      defaultValue: 'Good',
    }),
    3: t('grade-easy', {
      defaultValue: 'Easy',
    }),
  };

  const advance = () => {
    stopCardSound();
    setIdx((i) => i + 1);
    setRevealed(false);
  };

  async function grade(g: number) {
    if (!card || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await api(reviewCardApi, {
        params: {
          id: card.id,
        },
        body: {
          grade: g,
        },
      });
      setReviewed((n) => n + 1);
      if (res.leech) {
        setSetAside((n) => n + 1);
        setNotice({
          kind: 'leech',
        });
      } else {
        setNotice(null);
      }
      advance();
    } catch (err) {
      // A refused grade skips the card; a network failure leaves it here to be graded again.
      if (err instanceof HttpError) advance();
      else
        toast.error(
          t('grade-failed', {
            defaultValue: 'Could not save that answer',
          }),
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function suspend(cardId: string, suspended: boolean) {
    try {
      await api(suspendCardApi, {
        params: {
          id: cardId,
        },
        body: {
          suspended,
        },
      });
      if (suspended) {
        setSetAside((n) => n + 1);
        setNotice({
          kind: 'suspended',
          cardId,
        });
        advance();
      } else {
        setSetAside((n) => Math.max(0, n - 1));
        setNotice(null);
        toast.success(
          t('unsuspended', {
            defaultValue: 'Card is back in your reviews',
          }),
        );
      }
    } catch {
      toast.error(
        t('suspend-failed', {
          defaultValue: 'Could not change that card',
        }),
      );
    }
  }

  keysRef.current = (e) => {
    const afterG = lastKeyRef.current === 'g' && e.timeStamp - lastKeyAtRef.current < 1500;
    lastKeyRef.current = e.key;
    lastKeyAtRef.current = e.timeStamp;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    // `p` plays the current side's sound (s10-02): the front's until the answer is shown, then the back's. Only
    // while this review is mounted, and never on a card with no sound.
    // `g` then `p` is the site's Progress chord, so a `p` straight after a `g` is left to it.
    if (e.key === 'p' && !afterG) {
      const sound = revealed ? (card?.backSound ?? card?.frontSound) : card?.frontSound;
      if (sound) {
        e.preventDefault();
        void toggleCardSound(sound.url);
      }
      return;
    }
    // `a` says the side showing again (s11-17), only while Listen is on; like `p`, never straight after `g`.
    if (e.key === 'a' && !afterG) {
      if (listen.on) {
        e.preventDefault();
        listen.replay();
      }
      return;
    }
    if (!revealed) {
      if ((e.key === ' ' || e.key === 'Enter') && tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault();
        setRevealed(true);
      }
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 4 && !busy) {
      e.preventDefault();
      void grade(n - 1);
    }
  };

  return (
    <div className={arrival}>
      {header}
      <div className="p-4">
        {notice?.kind === 'leech' && (
          <p role="status" className="t-meta border-b border-site-border pb-2">
            {t('leech-line', {
              count: LEECH_THRESHOLD,
              defaultValue_one:
                'Set aside: you have missed this card {{count}} time. Edit it or unsuspend it from the deck.',
              defaultValue:
                'Set aside: you have missed this card {{count}} times. Edit it or unsuspend it from the deck.',
            })}
          </p>
        )}
        {notice?.kind === 'suspended' && (
          <p role="status" className="t-meta flex items-center gap-2 border-b border-site-border pb-2">
            {t('suspended-line', {
              defaultValue: 'Card suspended. Unsuspend it from the deck page.',
            })}
            <Button variant="ghost" size="sm" onClick={() => void suspend(notice.cardId, false)}>
              {t('undo', {
                defaultValue: 'Undo',
              })}
            </Button>
          </p>
        )}
        <ListenControls listen={listen} />
        <div className="mt-2 flex items-center justify-between">
          <p className="t-meta min-w-0 truncate" dir="auto">
            {card.deckTitle}
          </p>
          {/* "3 / 11" reads left to right in every locale; in `ar` the bidi algorithm would show "11 / 3". */}
          <span className="t-meta" dir="ltr">
            {idx + 1} / {batch.cards.length}
          </span>
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          {card.kind === 'occlusion' && card.occlusion && card.frontImage ? (
            <>
              <OcclusionReview image={card.frontImage} prompt={card.front} data={card.occlusion} revealed={revealed} />
              {revealed && card.backSound && (
                <CardSound sound={card.backSound} side="back" showTranscript className="mt-4 items-center" />
              )}
            </>
          ) : card.clozeIndex !== null ? (
            <>
              <ClozeText text={card.front} index={card.clozeIndex} reveal={false} className="t-prose text-site-text" />
              {revealed && (
                <>
                  <div className="my-4 h-px w-16 bg-site-border" />
                  <ClozeText text={card.front} index={card.clozeIndex} reveal className="t-prose text-site-text" />
                  {card.backImage && <CardPicture image={card.backImage} eager className="mt-4" />}
                  {card.backSound && (
                    <CardSound sound={card.backSound} side="back" showTranscript className="mt-4 items-center" />
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {card.frontImage && <CardPicture image={card.frontImage} eager className="mb-4" />}
              {card.frontSound && (
                <CardSound
                  sound={card.frontSound}
                  side="front"
                  showTranscript={revealed}
                  className="mb-4 items-center"
                />
              )}
              <p dir="auto" className="t-heading break-words">
                {card.front}
              </p>
              {revealed && (
                <>
                  <div className="my-4 h-px w-16 bg-site-border" />
                  {card.backImage && <CardPicture image={card.backImage} eager className="mb-4" />}
                  <p dir="auto" className="t-prose whitespace-pre-wrap break-words text-site-text-muted">
                    {card.back}
                  </p>
                  {card.backSound && (
                    <CardSound sound={card.backSound} side="back" showTranscript className="mt-4 items-center" />
                  )}
                </>
              )}
            </>
          )}
        </div>
        {revealed ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((g) => (
              <Button key={g} variant="default" disabled={busy} onClick={() => void grade(g)}>
                {gradeLabels[g]}
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setRevealed(true)}>
            {t('show-answer', {
              defaultValue: 'Show answer',
            })}
          </Button>
        )}
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void suspend(card.id, true)}>
            {t('suspend-card', {
              defaultValue: 'Suspend this card',
            })}
          </Button>
        </div>
      </div>
    </div>
  );
}
