import { useState } from'react';
import { useTranslation } from'react-i18next';
import { Check } from'lucide-react';
import { useSession } from'@/components/Providers';
import { yieldToMain } from'@/lib/scheduler';
import { RelativeTime } from'@/components/ui/RelativeTime';
import { formatRelativeTime } from'@/lib/i18n/relative-time';
import { toast } from'@/lib/toast';
import { pollWinners } from'@/lib/feed/poll-lifecycle';
import type { FeedPoll } from'@/lib/feed-types';
import { RankedPoll } from'@/components/feed/RankedPoll';

/** A poll further than this from its end names the date ("Ends on 4 Dec"); nearer, how long is left. */
const NEAR_END_MS = 2 * 86_400_000;

interface PollDisplayProps {
 poll: FeedPoll;
 postId: string;
 onUpdate?: (poll: FeedPoll) => void;
 /** Override the vote endpoint (defaults to the RMHark route). */
 voteUrl?: string;
}

export function PollDisplay({ poll, postId, onUpdate, voteUrl }: PollDisplayProps) {
 const { t, i18n } = useTranslation("feed");
 const { data: session } = useSession();
 const [localPoll, setLocalPoll] = useState(poll);
 const [voting, setVoting] = useState(false);

 // The author ending or extending the poll (from the post menu) arrives as a new `poll` prop with a new end; take
 // it, and keep the votes cast here meanwhile.
 const [seenEnd, setSeenEnd] = useState({ closesAt: poll.closesAt, ended: poll.ended });
 if (seenEnd.closesAt !== poll.closesAt || seenEnd.ended !== poll.ended) {
 setSeenEnd({ closesAt: poll.closesAt, ended: poll.ended });
 setLocalPoll((prev) => ({ ...prev, closesAt: poll.closesAt, ended: poll.ended, extended: poll.extended, extendDays: poll.extendDays }));
 }

 const hasVoted = (localPoll.myVotes?.length ?? 0) > 0;
 const isClosed = !!localPoll.ended || (!!localPoll.closesAt && new Date(localPoll.closesAt).getTime() <= Date.now());
 const showResults = hasVoted || isClosed;
 const winnerIds = isClosed ? new Set(pollWinners(localPoll.options).map((o) => o.id)) : null;

 if (localPoll.ranked) {
 return (
 <RankedPoll
 poll={localPoll}
 postId={postId}
 closed={isClosed}
 signedIn={!!session}
 onChange={(next) => {
 setLocalPoll(next);
 onUpdate?.(next);
 }}
 />
 );
 }

 const handleVote = async (optionId: string) => {
 if (!session || voting || isClosed) return;

 setVoting(true);

 // Optimistic update
 const wasVoted = localPoll.myVotes?.includes(optionId);
 let newMyVotes: string[];
 let newOptions = localPoll.options.map((o) => ({ ...o }));
 let newTotal = localPoll.totalVotes;

 if (wasVoted) {
 // Toggle off
 newMyVotes = (localPoll.myVotes ?? []).filter((id) => id !== optionId);
 newOptions = newOptions.map((o) =>
 o.id === optionId ? { ...o, voteCount: Math.max(0, o.voteCount - 1) } : o
 );
 newTotal = Math.max(0, newTotal - 1);
 } else if (localPoll.multiSelect) {
 // Multi-select: add vote
 newMyVotes = [...(localPoll.myVotes ?? []), optionId];
 newOptions = newOptions.map((o) =>
 o.id === optionId ? { ...o, voteCount: o.voteCount + 1 } : o
 );
 newTotal += 1;
 } else {
 // Single-select: replace vote
 const prevVoteId = localPoll.myVotes?.[0];
 newMyVotes = [optionId];
 newOptions = newOptions.map((o) => {
 if (o.id === optionId) return { ...o, voteCount: o.voteCount + 1 };
 if (o.id === prevVoteId) return { ...o, voteCount: Math.max(0, o.voteCount - 1) };
 return o;
 });
 if (!prevVoteId) newTotal += 1;
 }

 const optimistic = { ...localPoll, myVotes: newMyVotes, options: newOptions, totalVotes: newTotal };
 setLocalPoll(optimistic);
 onUpdate?.(optimistic);

 // OPT-34. Casting a vote flips the poll from choices to results: every bar
 // grows, the percentages appear, the check mark lands. That is two renders
 // (this component and, through `onUpdate`, the feed card that owns the post)
 // driven by the object built above. Sending the vote is bookkeeping the voter
 // never sees, so give the results their own task first. Nothing below reads
 // layout, and this runs from a button `onClick` that cancels nothing.
 await yieldToMain();

 try {
 const res = await fetch(voteUrl ?? `/api/rmharks/${postId}/vote`, {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ optionId }),
 });

 if (res.ok) {
 const data = await res.json();
 // An un-vote on a post that is no longer readable returns no tallies:
 // keep the optimistic counts and take only the caller's own votes.
 const serverPoll: FeedPoll = Array.isArray(data.options)
 ? {
 ...localPoll,
 myVotes: data.myVotes,
 totalVotes: data.totalVotes,
 options: localPoll.options.map((o) => {
 const updated = data.options.find((so: any) => so.id === o.id);
 return updated ? { ...o, voteCount: updated.voteCount } : o;
 }),
 }
 : { ...optimistic, myVotes: data.myVotes ?? optimistic.myVotes };
 setLocalPoll(serverPoll);
 onUpdate?.(serverPoll);
 } else {
 // Rollback on error. A vote on a poll that ended meanwhile (the author closed it) turns the poll into its
 // final results.
 let rolledBack = poll;
 if (res.status === 409) {
 const refusal = await res.json().catch(() => null);
 if (refusal?.code === 'POLL_CLOSED') {
 rolledBack = { ...poll, ended: true };
 toast.error(t("poll-ended-error", { ns: 'poll-lifecycle', defaultValue:"This poll has ended"}));
 }
 }
 setLocalPoll(rolledBack);
 onUpdate?.(rolledBack);
 }
 } catch {
 setLocalPoll(poll);
 onUpdate?.(poll);
 } finally {
 setVoting(false);
 }
 };

 const maxVotes = Math.max(...localPoll.options.map((o) => o.voteCount), 1);

 return (
 <div className="relative mt-3 rounded-site px-4 py-3">
 <p className="text-sm font-semibold text-site-text mb-2">{localPoll.question}</p>

 {isClosed && (
 <p className="t-label mb-2">{t("final-results", { ns: 'poll-lifecycle', defaultValue:"Final results"})}</p>
 )}

 {localPoll.multiSelect && !showResults && (
 <p className="text-xs text-site-text-muted mb-2">{t("select-all-that-apply", { defaultValue:"Select all that apply"})}</p>
 )}

 <div className="space-y-2">
 {localPoll.options.map((option) => {
 const isSelected = localPoll.myVotes?.includes(option.id);
 const pct = localPoll.totalVotes > 0
 ? Math.round((option.voteCount / localPoll.totalVotes) * 100)
 : 0;

 if (showResults) {
 return (
 <button
 key={option.id}
 onClick={() => handleVote(option.id)}
 disabled={!session || voting || isClosed}
 className="w-full text-left relative overflow-hidden rounded-site-sm border border-site-border transition-colors hover:border-site-accent/50 disabled:opacity-70"
 >
 {/* Progress bar background */}
 {/* `scaleX`, not `width`: the bar sits behind live text, so animating its
 width relayouts the option row on every frame of every result reveal. */}
 <div
 className={`absolute inset-0 origin-left transition-[transform,background-color] duration-site-slow ${
 // `--site-surface-hover`, not `bg-site-surface/50`. `--site-surface` is
 // ALREADY rgba (0.065 on ultra), and Tailwind v4's opacity modifier
 // multiplies rather than replaces — so /50 rendered at 0.033 and the bar
 // for every option you did not vote for was invisible. `-hover` is a real
 // token, calibrated per theme, and is what "one step up from the surface"
 // actually means here.
 isSelected ?'bg-site-accent/20':'bg-site-surface-hover'
 }`}
 style={{ transform: `scaleX(${pct / 100})`}}
 />
 <div className="relative flex items-center justify-between px-3 py-2">
 <span className="flex items-center gap-2 text-sm text-site-text">
 {isSelected && <Check className="w-3.5 h-3.5 text-site-accent shrink-0"/>}
 {option.text}
 {winnerIds?.has(option.id) && (
 <span className="t-label">{t("winner", { ns: 'poll-lifecycle', defaultValue:"Winner"})}</span>
 )}
 </span>
 <span className={`text-xs font-mono shrink-0 ${
 isSelected ?'text-site-accent font-semibold':'text-site-text-muted'
 }`}>
 {pct}%
 </span>
 </div>
 </button>
 );
 }

 return (
 <button
 key={option.id}
 onClick={() => handleVote(option.id)}
 disabled={!session || voting || isClosed}
 className="w-full text-left px-3 py-2 rounded-site-sm border border-site-border text-sm text-site-text hover:border-site-accent hover:bg-site-accent/5 transition-colors disabled:opacity-50"
 >
 {option.text}
 </button>
 );
 })}
 </div>

 <p className="text-xs text-site-text-muted mt-2">
 {t("vote-count", { count: localPoll.totalVotes, defaultValue:"{{count}} vote", defaultValue_one:"{{count}} vote", defaultValue_other:"{{count}} votes"})}
 {localPoll.multiSelect && `· ${t("multiple-choice", { defaultValue:"Multiple choice"})}`}
 {localPoll.closesAt && (
 <>
 {' '}·{' '}
 <RelativeTime
 date={localPoll.closesAt}
 format={(at, now) =>
 isClosed
 ? t("ended-relative", { ns: 'poll-lifecycle', when: formatRelativeTime(at, i18n.language, now), defaultValue:"Ended {{when}}"})
 : at - now > NEAR_END_MS
 ? t("ends-on", { ns: 'poll-lifecycle', date: dayLabel(at, i18n.language), defaultValue:"Ends on {{date}}"})
 : t("ends-relative", { ns: 'poll-lifecycle', when: formatRelativeTime(at, i18n.language, now), defaultValue:"Ends {{when}}"})
 }
 fallback={(at) =>
 isClosed
 ? t("ended-on", { ns: 'poll-lifecycle', date: dayLabel(at, i18n.language), defaultValue:"Ended on {{date}}"})
 : t("ends-on", { ns: 'poll-lifecycle', date: dayLabel(at, i18n.language), defaultValue:"Ends on {{date}}"})
 }
 />
 </>
 )}
 {localPoll.extended && !isClosed && ` · ${t("extended", { ns: 'poll-lifecycle', defaultValue:"Extended"})}`}
 </p>
 </div>
 );
}

/** "4 Dec", in the viewer's language. */
function dayLabel(ms: number, locale: string): string {
 return new Intl.DateTimeFormat(locale || 'en', { month: 'short', day: 'numeric' }).format(new Date(ms));
}
