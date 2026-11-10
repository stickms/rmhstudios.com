/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useEffect, useState, useCallback, useRef } from'react';
import { toast } from 'sonner';
import { Link, useNavigate } from'@tanstack/react-router';
import { Loader2, ArrowLeft, Plus, Trash2, RotateCcw, GraduationCap, Check } from'lucide-react';
import { Spinner } from'@/components/ui/spinner';
import { Button } from'@/components/ui/button';
import { EmptyState } from'@/components/ui/empty-state';
import { useConfirm } from'@/components/ui/confirm-dialog';
import { useTranslation } from'react-i18next';
import { Reveal } from'@/components/motion';
import { LIFT_CARD } from'@/components/feed/motionHelpers';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import {
 addDeckCardApi,
 deckReviewQueueApi,
 deleteDeckApi,
 getDeckApi,
} from '@/lib/study/decks.contract';

interface Card {
 id: string;
 front: string;
 back: string;
}
interface Deck {
 id: string;
 title: string;
 description: string | null;
 isPublic: boolean;
 isOwner: boolean;
 cardCount: number;
}

const GRADES: { grade: number; label: string; cls: string }[] = [
 { grade: 0, label:'Again', cls:'text-site-danger'},
 { grade: 1, label:'Hard', cls:'text-site-warning'},
 { grade: 2, label:'Good', cls:'text-site-accent'},
 { grade: 3, label:'Easy', cls:'text-site-success'},
];

export function DeckStudyColumn({
 deckId,
 initialData,
}: {
 deckId: string;
 /**
 * Deck detail prefetched by the route loader. `null`means not-found /
 * private for this viewer; `undefined`means no loader supplied one → the
 * column fetches on mount.
 */
 initialData?: { deck: Deck; cards: Card[]; dueCount: number; signedIn: boolean } | null;
}) {
 const { t } = useTranslation('feed');
 const confirm = useConfirm();
 const navigate = useNavigate();
 // Seed from the loader when it ran (even a `null`result is a resolved
 // not-found, so skip the client fetch in that case too).
 const seeded = useRef(initialData !== undefined);
 const [deck, setDeck] = useState<Deck | null>(initialData?.deck ?? null);
 const [cards, setCards] = useState<Card[]>(initialData?.cards ?? []);
 const [dueCount, setDueCount] = useState(initialData?.dueCount ?? 0);
 const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
 const [loading, setLoading] = useState(initialData === undefined);
 const [notFound, setNotFound] = useState(initialData === null);

 // Review session
 const [queue, setQueue] = useState<Card[] | null>(null);
 const [idx, setIdx] = useState(0);
 const [revealed, setRevealed] = useState(false);
 const [reviewBusy, setReviewBusy] = useState(false);
 // Synchronous guards plus a session token (bumped on start and exit), so a
 // double click starts one review and a grade that resolves after the user
 // left (or restarted) the review does not advance the new one.
 const reviewBusyRef = useRef(false);
 const reviewSession = useRef(0);
 const [startingReview, setStartingReview] = useState(false);
 const exitReview = () => {
 reviewSession.current += 1;
 reviewBusyRef.current = false;
 setReviewBusy(false);
 setQueue(null);
 };

 // Add card
 const [front, setFront] = useState('');
 const [back, setBack] = useState('');
 const [adding, setAdding] = useState(false);

 const load = useCallback(async () => {
 try {
 const data = await api(getDeckApi, { params: { id: deckId } });
 setDeck(data.deck);
 setCards(data.cards ?? []);
 setDueCount(data.dueCount ?? 0);
 setSignedIn(!!data.signedIn);
 } catch (err) {
 // 404 is the not-found state; any other failure leaves the page as it was.
 if (err instanceof HttpError && err.status === 404) setNotFound(true);
 }
 }, [deckId]);

 useEffect(() => {
 if (seeded.current) return;
 let active = true;
 (async () => {
 try {
 await load();
 } finally {
 if (active) setLoading(false);
 }
 })();
 return () => {
 active = false;
 };
 }, [load]);

 async function startReview() {
 if (startingReview) return;
 const session = ++reviewSession.current;
 setStartingReview(true);
 try {
 const data = await api(deckReviewQueueApi, { params: { id: deckId } });
 if (session !== reviewSession.current) return;
 reviewBusyRef.current = false;
 setReviewBusy(false);
 setQueue(data.due ?? []);
 setIdx(0);
 setRevealed(false);
 } catch {
 if (session === reviewSession.current)
 toast.error(t('deck-review-load-failed', { defaultValue:'Could not load cards'}));
 } finally {
 setStartingReview(false);
 }
 }

 async function grade(g: number) {
 if (!queue || reviewBusyRef.current) return;
 const card = queue[idx];
 const session = reviewSession.current;
 reviewBusyRef.current = true;
 setReviewBusy(true);
 try {
 await fetch(`/api/study/cards/${card.id}/review`, {
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ grade: g }),
 });
 if (session !== reviewSession.current) return;
 if (idx + 1 >= queue.length) {
 setQueue(null);
 await load();
 } else {
 setIdx((i) => i + 1);
 setRevealed(false);
 }
 } catch {
 /* the next grade retries; the card stays in this session */
 } finally {
 if (session === reviewSession.current) {
 reviewBusyRef.current = false;
 setReviewBusy(false);
 }
 }
 }

 async function addCard() {
 if (!front.trim() || !back.trim()) return;
 setAdding(true);
 try {
 const data = await api(addDeckCardApi, {
 params: { id: deckId },
 body: { front: front.trim(), back: back.trim() },
 });
 setCards((c) => [...c, data.card]);
 setFront('');
 setBack('');
 } catch {
 /* the draft stays in the fields so it can be resent */
 } finally {
 setAdding(false);
 }
 }

 async function deleteDeck() {
 if (
 !(await confirm({
 title: t('delete-deck-confirm', { defaultValue:'Delete this deck and all its cards?'}),
 danger: true,
 }))
 )
 return;
 try {
 await api(deleteDeckApi, { params: { id: deckId } });
 } catch {
 return;
 }
 navigate({ to:'/study'});
 }

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (notFound || !deck) {
 return (
 <EmptyState
 title={t('deck-not-found', { defaultValue:'Deck not found'})}
 action={
 <Link to="/study">
 <Button variant="outline">{t('back-to-decks', { defaultValue:'Back to decks'})}</Button>
 </Link>
 }
 />
 );
 }

 // Review mode
 if (queue && queue.length > 0) {
 const card = queue[idx];
 return (
 <div>
 <header className="glass-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <button
 onClick={exitReview}
 className="text-site-text-dim hover:text-site-text"
 >
 <ArrowLeft className="h-5 w-5"/>
 </button>
 <h1 className="text-sm font-bold text-site-text">{deck.title}</h1>
 <span className="ml-auto text-xs text-site-text-dim">
 {idx + 1} / {queue.length}
 </span>
 </header>
 <div className="p-4">
 <div className="flex min-h-64 flex-col items-center justify-center rounded-site glass-fill p-8 text-center">
 <p className="text-lg font-semibold text-site-text">{card.front}</p>
 {revealed && (
 <>
 <div className="my-4 h-px w-16 bg-site-border"/>
 <p className="whitespace-pre-wrap text-site-text-muted">{card.back}</p>
 </>
 )}
 </div>
 {revealed ? (
 <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
 {GRADES.map((g) => (
 <Button
 key={g.grade}
 variant="outline"
 disabled={reviewBusy}
 onClick={() => grade(g.grade)}
 className={`flex-col ${g.cls}`}
 >
 {t(`grade-${g.grade}`, { defaultValue: g.label })}
 </Button>
 ))}
 </div>
 ) : (
 <Button variant="accent"className="mt-4 w-full"onClick={() => setRevealed(true)}>
 {t('show-answer', { defaultValue:'Show answer'})}
 </Button>
 )}
 </div>
 </div>
 );
 }

 return (
 <div>
 <header className="glass-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <Link to="/study"className="text-site-text-dim hover:text-site-text">
 <ArrowLeft className="h-5 w-5"/>
 </Link>
 <div className="min-w-0 flex-1">
 <h1 className="truncate text-lg font-bold text-site-text">{deck.title}</h1>
 {deck.description && (
 <p className="truncate text-xs text-site-text-dim">{deck.description}</p>
 )}
 </div>
 {deck.isOwner && (
 <button
 onClick={deleteDeck}
 className="text-site-text-dim hover:text-site-danger"
 title={t('delete-deck', { defaultValue:'Delete deck'})}
 aria-label={t('delete-deck', { defaultValue:'Delete deck'})}
 >
 <Trash2 className="h-4 w-4"/>
 </button>
 )}
 </header>

 <div className="space-y-4 p-4">
 {signedIn && (
 <Reveal>
 <Button
 variant="accent"
 className="w-full gap-2"
 disabled={cards.length === 0}
 loading={startingReview}
 onClick={startReview}
 >
 <GraduationCap className="h-4 w-4"/>
 {dueCount > 0
 ? t('study-due-cards', {
 count: dueCount,
 defaultValue:'Study {{count}} due card',
 })
 : t('review-deck', { defaultValue:'Review deck'})}
 </Button>
 </Reveal>
 )}

 {deck.isOwner && (
 <Reveal
 className={`rounded-site glass-fill p-4 ${LIFT_CARD}`}
 >
 <p className="mb-2 flex items-center gap-1.5 site-section-label">
 <Plus className="h-3.5 w-3.5"/> {t('add-a-card', { defaultValue:'Add a card'})}
 </p>
 <div className="space-y-2">
 <input
 value={front}
 onChange={(e) => setFront(e.target.value)}
 placeholder={t('front-placeholder', { defaultValue:'Front (question)'})}
 maxLength={500}
 className="glass-inset border w-full rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
 />
 <textarea
 value={back}
 onChange={(e) => setBack(e.target.value)}
 placeholder={t('back-placeholder', { defaultValue:'Back (answer)'})}
 maxLength={500}
 rows={2}
 className="glass-inset border w-full resize-none rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
 />
 <div className="flex justify-end">
 <Button
 size="sm"
 variant="accent"
 disabled={adding || !front.trim() || !back.trim()}
 onClick={addCard}
 className="gap-1"
 >
 {adding ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin"/>
 ) : (
 <Check className="h-3.5 w-3.5"/>
 )}{''}
 {t('add', { defaultValue:'Add'})}
 </Button>
 </div>
 </div>
 </Reveal>
 )}

 <Reveal as="section">
 <h2 className="site-section-label mb-2 flex items-center gap-1.5">
 <RotateCcw className="h-3.5 w-3.5"/>{''}
 {t('card-count', { count: cards.length, defaultValue_one:'{{count}} card', defaultValue:'{{count}} cards'})}
 </h2>
 <div className="space-y-1">
 {cards.map((c) => (
 <div
 key={c.id}
 className={`rounded-site-sm glass-fill p-3 ${LIFT_CARD}`}
 >
 <p className="text-sm font-medium text-site-text">{c.front}</p>
 <p className="mt-0.5 text-sm text-site-text-muted">{c.back}</p>
 </div>
 ))}
 </div>
 </Reveal>
 </div>
 </div>
 );
}
