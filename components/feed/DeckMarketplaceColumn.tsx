/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState, useRef, useCallback } from'react';
import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import { toast } from '@/lib/toast';
import { Library, Search, Plus, Check, Loader2 } from'lucide-react';
import { EmptyState } from'@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { StudyTabs } from'@/components/feed/StudyTabs';
import { PageTabs } from '@/components/feed/PageTabs';
import type { TabItem } from '@/components/ui/tabs';
import { DeckRatingLine } from '@/components/study/DeckRating';
import { isDeckSort, type DeckSort, type RatingDisplay } from '@/lib/study/deck-ratings';
import { api } from '@/lib/contract/client';
import { cloneDeckApi } from '@/lib/study/decks.contract';
import { CardPicture } from '@/components/study/CardPicture';
import type { CardImage } from '@/lib/study/card-images';

import { deckMarketplaceApi } from '@/lib/feed/feed-reads.contract';
interface MarketplaceDeck {
 id: string;
 title: string;
 description: string | null;
 cardCount: number;
 user: { name: string | null; handle: string | null; image: string | null };
 isOwn: boolean;
 alreadyCloned: boolean;
 /** Accepted editors besides the owner (s11-10); no names. */
 editorCount?: number;
 /** The deck's first card with a picture (s08-15); absent when none has one. */
 preview?: { front: string; image: CardImage };
 /** Ratings and copies (s12-08): the aggregate only, never who rated. */
 rating: RatingDisplay;
 copyCount: number;
}

interface MarketplaceData {
 decks: MarketplaceDeck[];
 signedIn: boolean;
}

export function DeckMarketplaceColumn({
 initialData,
 sort: sortFromUrl = 'cards',
 onSortChange,
}: {
 initialData: MarketplaceData;
 /** The order in the URL (`?sort=`); the route owns it so the page can be shared and reloaded. */
 sort?: DeckSort;
 onSortChange?: (sort: DeckSort) => void;
}) {
 const { t } = useTranslation('feed');
 const refusalText = useRefusalText();
 const [decks, setDecks] = useState<MarketplaceDeck[]>(initialData.decks);
 const [query, setQuery] = useState('');
 const [sort, setSort] = useState<DeckSort>(sortFromUrl);
 // The loader ran again for an order this page did not pick (back or forward): take its list and its order.
 const [seen, setSeen] = useState(initialData);
 if (seen !== initialData) {
 setSeen(initialData);
 if (sortFromUrl !== sort) {
 setSort(sortFromUrl);
 setDecks(initialData.decks);
 setQuery('');
 }
 }
 const [loading, setLoading] = useState(false);
 // Per-deck clone status:'cloning'while the request is in flight,'done'once added.
 const [status, setStatus] = useState<Record<string,'cloning'|'done'>>({});
 const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

 const search = useCallback(async (q: string, order: DeckSort) => {
 setLoading(true);
 try {
 const data = await api(deckMarketplaceApi, { query: { q, sort: order } });
 setDecks(data.decks);
 } catch {
 // A failed search keeps the decks on screen.
 } finally {
 setLoading(false);
 }
 }, []);

 const onQueryChange = (value: string) => {
 setQuery(value);
 clearTimeout(debounceRef.current);
 debounceRef.current = setTimeout(() => void search(value.trim(), sort), 300);
 };

 const changeSort = (next: string) => {
 if (!isDeckSort(next) || next === sort) return;
 setSort(next);
 onSortChange?.(next);
 clearTimeout(debounceRef.current);
 void search(query.trim(), next);
 };

 const sortTabs: TabItem[] = [
 { id: 'cards', label: t('sort-cards', { ns: 'deck-ratings', defaultValue: 'Most cards' }) },
 { id: 'rated', label: t('sort-rated', { ns: 'deck-ratings', defaultValue: 'Best rated' }) },
 { id: 'copied', label: t('sort-copied', { ns: 'deck-ratings', defaultValue: 'Most copied' }) },
 ];

 const clone = async (deck: MarketplaceDeck) => {
 if (!initialData.signedIn) {
 toast.error(t('deck-clone-signin', { defaultValue:'Sign in to add decks.'}));
 return;
 }
 setStatus((s) => ({ ...s, [deck.id]:'cloning'}));
 try {
 await api(cloneDeckApi, { params: { id: deck.id } });
 setStatus((s) => ({ ...s, [deck.id]:'done'}));
 toast.success(t('deck-clone-added', { defaultValue:'Added to your decks.'}));
 } catch (err) {
 setStatus((s) => {
 const next = { ...s };
 delete next[deck.id];
 return next;
 });
 toast.error(refusalText.maybe(err) ?? t('deck-clone-failed', { defaultValue:'Could not add deck.'}));
 }
 };

 return (
 <div>
 {/* The back-arrow to /study that used to open this header is now one half
     of the StudyTabs strip below: the two study pages are siblings, not a
     parent and a detail, so the crossing between them is a tab strip rather
     than a link one way and a Back the other. */}
 <header className="surface-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <Library className="h-5 w-5 text-site-accent"/>
 <h1 className="text-lg font-semibold text-site-text">
 {t('deck-marketplace', { defaultValue:'Browse decks'})}
 </h1>
 </header>

 <StudyTabs active="/study/browse"/>

 <div className="space-y-4 p-4">
 <PageTabs
 tabs={sortTabs}
 value={sort}
 onChange={changeSort}
 idBase="deck-sort"
 aria-label={t('sort-label', { ns: 'deck-ratings', defaultValue: 'Order decks by' })}
 />
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-muted"/>
 <input
 value={query}
 onChange={(e) => onQueryChange(e.target.value)}
 placeholder={t('deck-search-placeholder', { defaultValue:'Search public decks…'})}
 aria-label={t('deck-search-label', { defaultValue:'Search public decks'})}
 className="w-full rounded-site-sm surface-field py-2 pl-9 pr-3 text-sm text-site-text outline-none focus:border-site-accent"
 />
 </div>

 {decks.length === 0 ? (
 <EmptyState
 icon={Library}
 title={t('deck-empty-title', { defaultValue:'No public decks found'})}
 description={t('deck-empty-desc', {
 defaultValue:'Try a different search, or publish one of your own decks.',
 })}
 />
 ) : (
 <div
 role="tabpanel"
 id={`deck-sort-panel-${sort}`}
 aria-labelledby={`deck-sort-tab-${sort}`}
 className={`grid gap-x-3 sm:grid-cols-2 ${loading ?'opacity-60':''}`}
 >
 {decks.map((deck) => {
 const st = status[deck.id];
 const added = st ==='done'|| deck.alreadyCloned;
 return (
 <div
 key={deck.id}
 className="rule-row flex flex-col relative py-3"
 >
 <Link to="/study/$deckId"params={{ deckId: deck.id }} className="min-w-0">
 <h2 className="truncate text-sm font-semibold text-site-text hover:text-site-accent">
 {deck.title}
 </h2>
 </Link>
 {deck.preview && <CardPicture image={deck.preview.image} compact className="mt-3"/>}
 {deck.description && (
 <p dir="auto" className="mt-1 line-clamp-2 text-xs text-site-text-muted">
 {deck.description}
 </p>
 )}
 <p className="mt-2 text-xs text-site-text-muted">
 {t('deck-card-count', { count: Number(deck.cardCount), defaultValue_one: '{{n}} card', defaultValue:'{{n}} cards', n: deck.cardCount })}
 {deck.user.name || deck.user.handle
 ? `· ${t('deck-by', { defaultValue:'by'})} ${deck.user.name ||'@'+ deck.user.handle}`
 :''}
 {(deck.editorCount ?? 0) > 0
 ? ` ${t('deck-with-editors', {
 ns:'deck-coeditors',
 count: deck.editorCount,
 defaultValue_one:'with {{count}} editor',
 defaultValue:'with {{count}} editors',
 })}`
 :''}
 </p>
 <DeckRatingLine rating={deck.rating} copyCount={deck.copyCount} />
 <div className="mt-3">
 {deck.isOwn ? (
 <span className="text-xs font-medium text-site-text-muted">
 {t('deck-your-deck', { defaultValue:'Your deck'})}
 </span>
 ) : added ? (
 <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-site-success">
 <Check className="h-4 w-4"aria-hidden />{''}
 {t('deck-added', { defaultValue:'Added'})}
 </span>
 ) : (
 <Button
 type="button"
 variant="default"
 onClick={() => clone(deck)}
 disabled={st ==='cloning'}
 className="h-auto gap-1.5 px-3 py-1.5 text-xs font-semibold hover:border-site-accent hover:text-site-accent has-[>svg]:px-3 disabled:opacity-60"
 >
 {st ==='cloning'? (
 <Loader2 className="h-4 w-4 animate-spin"aria-hidden />
 ) : (
 <Plus className="h-4 w-4"aria-hidden />
 )}
 {t('deck-add', { defaultValue:'Add to my decks'})}
 </Button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 );
}
