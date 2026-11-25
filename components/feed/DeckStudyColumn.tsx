/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useEffect, useState, useCallback, useRef } from'react';
import { toast } from '@/lib/toast';
import { Link, useNavigate } from'@tanstack/react-router';
import { ArrowLeft, Plus, Trash2, RotateCcw, GraduationCap } from'lucide-react';
import { Spinner } from'@/components/ui/spinner';
import { Button } from'@/components/ui/button';
import { EmptyState } from'@/components/ui/empty-state';
import { useConfirm } from'@/components/ui/confirm-dialog';
import { useTranslation } from'react-i18next';
import { lazy, Suspense } from 'react';
import { Flag } from 'lucide-react';
import { deckGradeLabels } from '@/components/feed/deck-grade-labels';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { reviewCardApi } from '@/lib/study/decks.contract';
import {
 addDeckCardApi,
 deckReviewQueueApi,
 deleteDeckApi,
 getDeckApi,
} from '@/lib/study/decks.contract';
import { useArrival } from '@/components/ui/arrive';
import { EditDeckLink } from '@/components/study/EditDeckLink';
import { DeckUpdatesLine } from '@/components/study/DeckUpdatesLine';
import type { UpdatesSummary } from '@/lib/study/deck-sync';
import { ExportMenu } from '@/components/study/ExportMenu';
import { DeckPageFolderMenu } from '@/components/study/MoveToFolderMenu';
import { DeckStatsSummary } from '@/components/study/DeckStatsSummary';
import { DeckPace } from '@/components/study/DeckPace';
import { DeckRatingBlock } from '@/components/study/DeckRating';
import type { RatingDisplay } from '@/lib/study/deck-ratings';
import { ListenControls } from '@/components/study/ListenControls';
import { useCardListen } from '@/components/study/useCardListen';
import { useReviewKeys } from '@/components/study/useReviewKeys';
import { PracticeTestLink } from '@/components/study/PracticeTestLink';
import { TestHistory } from '@/components/study/TestHistory';
import { CardForm, type CardFormValue } from '@/components/study/CardForm';
import { CardPicture, usePreloadPicture } from '@/components/study/CardPicture';
import { ClozeText } from '@/components/study/ClozeText';
import { OcclusionReview } from '@/components/study/OcclusionReview';
import { DeckCardList } from '@/components/study/DeckCardList';
import { DeckEditors, DeckInvitationLine } from '@/components/study/DeckEditors';
import type { DeckInvitation } from '@/lib/study/deck-editors';
import type { DeckRole } from '@/lib/study/deck-access';
import { isReverseCard } from '@/lib/study/card-types';
import type { DeckCard as Card } from '@/lib/study.server';
// s12-16 member-reports: the dialog carries a zod schema, so it loads only when a member opens it.
const ReportDialog = lazy(() =>
 import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface Deck {
 id: string;
 title: string;
 description: string | null;
 isPublic: boolean;
 /** A moderator took this deck down (only its owner and editors load it). */
 removedByModerator?: boolean;
 isOwner: boolean;
 /** `owner`, `editor` (an accepted editor: cards and study, nothing of the settings) or null (s11-10). */
 role?: DeckRole | null;
 /** A copy of another member's deck: it takes no editors. */
 isCopy?: boolean;
 cardCount: number;
 /** The owner's private folder (owner only). */
 folderId?: string | null;
 /** The languages the fronts and backs are written in, for Listen (s11-17); absent or null: the site's. */
 frontLang?: string | null;
 backLang?: string | null;
 /** A public deck's owner and its number of editors, no names. */
 byline?: { owner: { name: string; handle: string | null }; editors: number };
 /** A public deck's ratings and copies (s12-08): the aggregate only. */
 rating?: RatingDisplay;
 copyCount?: number;
}

const GRADES: { grade: number; cls: string }[] = [
 { grade: 0, cls:'text-site-danger'},
 { grade: 1, cls:'text-site-warning'},
 { grade: 2, cls:'text-site-accent'},
 { grade: 3, cls:'text-site-success'},
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
 initialData?: {
 deck: Deck;
 cards: Card[];
 reviewCount: number;
 dueCount: number;
 signedIn: boolean;
 updates?: UpdatesSummary | null;
 invitation?: DeckInvitation;
 } | null;
}) {
 const { t } = useTranslation('feed');
 const { t: ts } = useTranslation('flashcard-types');
 const gradeLabels = deckGradeLabels(t);
 const [reporting, setReporting] = useState(false);
 const confirm = useConfirm();
 const navigate = useNavigate();
 // Seed from the loader when it ran (even a `null`result is a resolved
 // not-found, so skip the client fetch in that case too).
 const seeded = useRef(initialData !== undefined);
 const [deck, setDeck] = useState<Deck | null>(initialData?.deck ?? null);
 const [cards, setCards] = useState<Card[]>(initialData?.cards ?? []);
 const [dueCount, setDueCount] = useState(initialData?.dueCount ?? 0);
 // Cards a member studies: the authored ones plus the generated reverse and cloze cards.
 const [reviewCount, setReviewCount] = useState(initialData?.reviewCount ?? 0);
 const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
 // What the author of the original changed (owner of a copy only).
 const [updates, setUpdates] = useState<UpdatesSummary | null>(initialData?.updates ?? null);
 // The viewer's open invitation to edit this deck (s11-10).
 const [invitation, setInvitation] = useState<DeckInvitation | null>(initialData?.invitation ?? null);
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

 // Listen (s11-17): off, it starts nothing and this review is exactly as before. On, each side is said in the
 // deck's language for it and the answer is shown by itself after the member's delay; it never grades.
 const listenCard = queue?.[idx] ?? null;
 const listen = useCardListen({
 card: listenCard,
 deck: { frontLang: deck?.frontLang ?? null, backLang: deck?.backLang ?? null },
 revealed,
 onReveal: () => setRevealed(true),
 });
 // Keys while Listening, for a review with the eyes off the screen: Space or Enter shows the answer, 1-4 grade it
 // (Again to Easy), `a` plays the side again. Not bound at all when Listen is off.
 const keysRef = useReviewKeys();
 const lastKeyRef = useRef('');
 const lastKeyAtRef = useRef(0);

 // Steel M9: a deck fetched here replaces the spinner; the loader's is there on first paint.
 const arrival = useArrival(!loading);

 const load = useCallback(async () => {
 try {
 const data = await api(getDeckApi, { params: { id: deckId } });
 setDeck(data.deck);
 setCards(data.cards ?? []);
 setDueCount(data.dueCount ?? 0);
 setReviewCount(data.reviewCount ?? 0);
 setSignedIn(!!data.signedIn);
 setUpdates(data.updates ?? null);
 setInvitation(data.invitation ?? null);
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

 // The review fetches the next card's picture ahead of time (that card's only, never the whole deck's).
 usePreloadPicture(queue?.[idx + 1]?.frontImage);

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
 // A refused grade (non-2xx) never interrupted the session; keep that.
 await api(reviewCardApi, { params: { id: card.id }, body: { grade: g } }).catch((e: unknown) => {
 if (!(e instanceof HttpError)) throw e;
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

 async function addCard(card: CardFormValue): Promise<boolean> {
 try {
 const data = await api(addDeckCardApi, { params: { id: deckId }, body: card });
 setCards((c) => [...c, data.card]);
 // A reversible or cloze card adds generated cards: the review and due counts move with it.
 void load();
 return true;
 } catch {
 /* the draft stays in the form so it can be resent */
 return false;
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
 className={arrival}
 title={t('deck-not-found', { defaultValue:'Deck not found'})}
 action={
 <Link to="/study">
 <Button variant="default">{t('back-to-decks', { defaultValue:'Back to decks'})}</Button>
 </Link>
 }
 />
 );
 }

 // The owner and an accepted editor may edit the cards (s11-10); everything else of the deck's settings stays the owner's.
 const role: DeckRole | null = deck.role ?? (deck.isOwner ? 'owner' : null);
 const canEdit = role !== null;

 // A member who has only been invited to edit a private deck reads the invitation and nothing else of it.
 if (invitation && role === null && !deck.isPublic) {
 return (
 <div className={arrival}>
 <header className="surface-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <Link to="/study"className="text-site-text-muted hover:text-site-text"aria-label={t('back-to-decks', { defaultValue:'Back to decks'})}>
 <ArrowLeft className="h-5 w-5"/>
 </Link>
 <h1 dir="auto" className="truncate text-lg font-semibold text-site-text">{deck.title}</h1>
 </header>
 <div className="p-4">
 <DeckInvitationLine
 invitation={invitation}
 onAnswered={(accepted) => {
 if (accepted) void load();
 else navigate({ to:'/study'});
 }}
 />
 </div>
 </div>
 );
 }

 // Review mode
 if (queue && queue.length > 0) {
 const card = queue[idx];
 keysRef.current = listen.on
 ? (e) => {
 const afterG = lastKeyRef.current === 'g' && e.timeStamp - lastKeyAtRef.current < 1500;
 lastKeyRef.current = e.key;
 lastKeyAtRef.current = e.timeStamp;
 if (e.metaKey || e.ctrlKey || e.altKey) return;
 const el = e.target as HTMLElement | null;
 const tag = el?.tagName;
 if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
 if (e.key === 'a' && !afterG) {
 e.preventDefault();
 listen.replay();
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
 if (n >= 1 && n <= 4 && !reviewBusy) {
 e.preventDefault();
 void grade(n - 1);
 }
 }
 : null;
 return (
 <div>
 <header className="surface-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <button
 onClick={exitReview}
 className="text-site-text-muted hover:text-site-text"
 >
 <ArrowLeft className="h-5 w-5"/>
 </button>
 <h1 className="text-sm font-semibold text-site-text">{deck.title}</h1>
 <span className="ml-auto text-xs text-site-text-muted">
 {idx + 1} / {queue.length}
 </span>
 </header>
 <div className="p-4">
 <ListenControls listen={listen} />
 <div className="flex min-h-64 flex-col items-center justify-center relative py-8 text-center">
 {isReverseCard(card) && <p className="t-meta mb-2">{ts('reverse-label', { defaultValue:'Reverse'})}</p>}
 {card.kind === 'occlusion' && card.occlusionReview && card.frontImage ? (
 <OcclusionReview image={card.frontImage} prompt={card.front} data={card.occlusionReview} revealed={revealed}/>
 ) : card.clozeIndex !== null ? (
 <>
 <ClozeText text={card.front} index={card.clozeIndex} reveal={false} className="text-lg text-site-text"/>
 {revealed && (
 <>
 <div className="my-4 h-px w-16 bg-site-border"/>
 <ClozeText text={card.front} index={card.clozeIndex} reveal className="text-site-text"/>
 {card.backImage && <CardPicture image={card.backImage} eager className="mt-4"/>}
 </>
 )}
 </>
 ) : (
 <>
 {card.frontImage && <CardPicture image={card.frontImage} eager className="mb-4"/>}
 <p className="text-lg font-semibold text-site-text">{card.front}</p>
 {revealed && (
 <>
 <div className="my-4 h-px w-16 bg-site-border"/>
 {card.backImage && <CardPicture image={card.backImage} eager className="mb-4"/>}
 <p className="whitespace-pre-wrap text-site-text-muted">{card.back}</p>
 </>
 )}
 </>
 )}
 </div>
 {revealed ? (
 <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
 {GRADES.map((g) => (
 <Button
 key={g.grade}
 variant="default"
 disabled={reviewBusy}
 onClick={() => grade(g.grade)}
 className={`flex-col ${g.cls}`}
 >
 {gradeLabels[g.grade]}
 </Button>
 ))}
 </div>
 ) : (
 <Button variant="default"className="mt-4 w-full"onClick={() => setRevealed(true)}>
 {t('show-answer', { defaultValue:'Show answer'})}
 </Button>
 )}
 </div>
 </div>
 );
 }

 return (
 <div className={arrival}>
 <header className="surface-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <Link to="/study"className="text-site-text-muted hover:text-site-text">
 <ArrowLeft className="h-5 w-5"/>
 </Link>
 <div className="min-w-0 flex-1">
 <h1 className="truncate text-lg font-semibold text-site-text">{deck.title}</h1>
 {deck.description && (
 <p dir="auto" className="truncate text-xs text-site-text-muted">{deck.description}</p>
 )}
 {deck.byline && (
 <p className="t-meta truncate">
 {t('byline', { ns:'deck-coeditors', defaultValue:'By'})}{' '}
 <bdi dir="auto">{deck.byline.owner.name}</bdi>
 {deck.byline.editors > 0 &&
 ` ${t('byline-editors', {
 ns:'deck-coeditors',
 count: deck.byline.editors,
 defaultValue_one:'with {{count}} editor',
 defaultValue:'with {{count}} editors',
 })}`}
 </p>
 )}
 </div>
 {canEdit && <EditDeckLink deckId={deckId} />}
 {deck.isOwner && <DeckPageFolderMenu deckId={deckId} folderId={deck.folderId ?? null} onMoved={() => void load()} />}
 {/* Anyone may export a public deck; the owner exports from the editor. */}
 {!canEdit && cards.length > 0 && (
 <ExportMenu deck={{ title: deck.title, description: deck.description ?? null, cards }} />
 )}
 {signedIn && !canEdit && deck.isPublic && (
 <button
 type="button"
 onClick={() => setReporting(true)}
 className="text-site-text-muted hover:text-site-text"
 title={t('report-deck', { ns: 'member-reports', defaultValue: 'Report this deck'})}
 aria-label={t('report-deck', { ns: 'member-reports', defaultValue: 'Report this deck'})}
 >
 <Flag className="h-4 w-4"/>
 </button>
 )}
 {deck.isOwner && (
 <button
 onClick={deleteDeck}
 className="text-site-text-muted hover:text-site-danger"
 title={t('delete-deck', { defaultValue:'Delete deck'})}
 aria-label={t('delete-deck', { defaultValue:'Delete deck'})}
 >
 <Trash2 className="h-4 w-4"/>
 </button>
 )}
 </header>

 <div className="space-y-4 p-4">
 {deck.removedByModerator && (
 <p className="t-body border-b border-site-border pb-3 text-site-text-muted">
 {t('removed-deck', { ns: 'member-reports', defaultValue: 'Removed by a moderator. It is private and cannot be made public again; you can still study it.'})}
 </p>
 )}
 {reporting && (
 <Suspense fallback={null}>
 <ReportDialog open onOpenChange={setReporting} entityType="study-deck" entityId={deckId}/>
 </Suspense>
 )}
 {invitation && role === null && (
 <DeckInvitationLine
 invitation={invitation}
 onAnswered={(accepted) => {
 if (accepted) void load();
 else setInvitation(null);
 }}
 />
 )}
 {deck.isPublic && deck.rating && (
 <DeckRatingBlock
 deckId={deckId}
 rating={deck.rating}
 copyCount={deck.copyCount ?? 0}
 viewerCanRate={signedIn && role === null}
 />
 )}
 {role === 'owner' && !deck.isCopy && <DeckEditors deckId={deckId} perspective="owner"/>}
 {role === 'editor' && <DeckEditors deckId={deckId} perspective="editor"onLeft={() => navigate({ to:'/study'})} />}
 {deck.isOwner && updates && <DeckUpdatesLine deckId={deckId} summary={updates} onChanged={() => void load()} />}
 {signedIn && <DeckStatsSummary deckId={deckId} />}
 {deck.isOwner && <DeckPace deckId={deckId} />}
 {signedIn && (
 <div>
 <Button
 variant="default"
 className="w-full gap-2"
 disabled={reviewCount === 0}
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
 </div>
 )}

 {cards.length > 0 && <PracticeTestLink deckId={deckId} />}
 {signedIn && <TestHistory deckId={deckId} />}

 {canEdit && (
 <div className="relative py-4">
 <p className="mb-2 flex items-center gap-1.5 site-section-label">
 <Plus className="h-3.5 w-3.5"/> {t('add-a-card', { defaultValue:'Add a card'})}
 </p>
 <CardForm submitLabel={t('add', { defaultValue:'Add'})} resetOnSave allowSound={deck.isOwner} onSubmit={addCard}/>
 </div>
 )}

 <section>
 <h2 className="site-section-label mb-2 flex items-center gap-1.5">
 <RotateCcw className="h-3.5 w-3.5"/>{''}
 {t('card-count', { count: cards.length, defaultValue_one:'{{count}} card', defaultValue:'{{count}} cards'})}
 </h2>
 <p className="t-meta mb-2">
 {ts('review-count', { count: reviewCount, defaultValue:'{{count}} to review'})}
 </p>
 <DeckCardList deckId={deckId} cards={cards} isOwner={canEdit} signedIn={signedIn} onChanged={() => void load()} />
 </section>
 </div>
 </div>
 );
}
