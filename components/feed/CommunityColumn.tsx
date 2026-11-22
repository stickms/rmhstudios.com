import { useEffect, useState, useCallback, useRef } from'react';
import { Link } from'@tanstack/react-router';
import {
 ArrowLeft,
 Users,
 MessageSquare,
 Megaphone,
 Shield,
 ShieldOff,
 UserX,
 X,
 Send,
 Gamepad2,
} from'lucide-react';
import { CommunityPlusBody } from'@/components/communities/CommunityPlusBody';
import { MemberSanctionMenu } from'@/components/communities/SanctionDialog';
import { CommunityStandingNotice, useMyStanding } from'@/components/communities/CommunityStandingNotice';
import { listSanctionsApi } from'@/lib/communities/bans.contract';
import { MemberNotesDialog, NotesButton } from'@/components/communities/MemberNotesDialog';
import { noteCountsApi } from'@/lib/communities/member-notes.contract';
import { NOTE_COUNTS_MAX_IDS } from'@/lib/communities/member-notes';
import { PostAlertsControl } from'@/components/communities/PostAlertsControl';
import { RulesAgreementDialog } from'@/components/communities/CommunityRules';
import { getRulesApi } from'@/lib/communities/rules.contract';
import type { CommunityRuleDTO } from'@/lib/communities/rules';
import { VoiceRoomBanner } from'@/components/groupcall/VoiceRoomBanner';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from'@/components/ui/dialog';
import { useConfirm } from'@/components/ui/confirm-dialog';
import { UserAvatar } from'@/components/ui/UserAvatar';
import { useSession } from'@/components/Providers';
import { toast } from '@/lib/toast';
import { useTranslation } from'react-i18next';
import { useOptimisticAction } from'@/hooks/useOptimisticAction';
import type { FeedItem } from'@/lib/feed-types';
import { WatchControl } from'@/components/discovery/WatchControl';
import { FindATimeLink } from'@/components/calendar/FindATimeLink';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
 communityFeedApi,
 communityMembersApi,
 createCommunityAnnouncementApi,
 deleteCommunityAnnouncementApi,
 getCommunityApi,
 joinCommunityApi,
 removeCommunityMemberApi,
 setCommunityMemberRoleApi,
} from '@/lib/communities/communities.contract';
import { useArrival } from '@/components/ui/arrive';
import { AdminModerateButton } from '@/components/moderation/moderation-ui';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useSanctionRefusal } from '@/components/communities/useSanctionRefusal';

interface Announcement {
 id: string;
 body: string;
 createdAt: string;
 author: { name: string | null; handle: string | null; image: string | null };
}

interface CommunityData {
 id: string;
 slug: string;
 name: string;
 description: string | null;
 icon: string | null;
 color: string | null;
 memberCount: number;
 postCount: number;
 joined: boolean;
 role: string | null;
 announcements: Announcement[];
 isPrivate?: boolean;
 /** The catalog title this community is the official home of. */
 game?: { id: string; title: string } | null;
}

interface Member {
 id: string;
 name: string | null;
 handle: string | null;
 image: string | null;
 role: string;
 joinedAt: string;
}

function canModerate(role: string | null): boolean {
 return role ==='ADMIN'|| role ==='MOD';
}

export function CommunityColumn({
 slug,
 initialCommunity,
 initialItems,
 initialPinned,
}: {
 slug: string;
 /** Community details prefetched by the route loader; `null`if not found. */
 initialCommunity?: CommunityData | null;
 /** First page of posts prefetched by the route loader. */
 initialItems?: FeedItem[] | null;
 /** s09-06: the pinned posts the loader read with the first page. */
 initialPinned?: FeedItem[] | null;
}) { const fmt = useLocaleFormat(); 
 const { t } = useTranslation('feed');
 const { data: session } = useSession();
 // s06-01: the caller's own ban or timeout, for the notice and the locked composer / Join button.
 const standing = useMyStanding(slug, !!session);
 const seeded = useRef(initialCommunity !== undefined);
 const [community, setCommunity] = useState<CommunityData | null>(initialCommunity ?? null);
 const [items, setItems] = useState<FeedItem[]>(initialItems ?? []);
 const [loading, setLoading] = useState(initialCommunity === undefined);
 const { run: runJoin, pending: joining } = useOptimisticAction();
 const sanctionRefusalText = useSanctionRefusal();
 const [announceOpen, setAnnounceOpen] = useState(false);
 const [membersOpen, setMembersOpen] = useState(false);
 // s03-13: the rules a joiner must tick first, when the community requires agreement.
 const [agreeRules, setAgreeRules] = useState<CommunityRuleDTO[] | null>(null);
 // Steel M9: a community fetched here replaces the spinner; the loader's is there on first paint.
 const arrival = useArrival(!loading);

 const loadCommunity = useCallback(async () => {
 try {
 setCommunity(await api(getCommunityApi, { params: { slug } }));
 } catch {
 // Keep what is shown; a failed refresh is not user-visible.
 }
 }, [slug]);

 const loadFeed = useCallback(async () => {
 try {
 setItems((await api(communityFeedApi, { params: { slug } })).items);
 } catch {
 // Keep what is shown; a failed refresh is not user-visible.
 }
 }, [slug]);

 useEffect(() => {
 // Loader already seeded community + first page — skip the mount waterfall.
 if (seeded.current) return;
 Promise.all([loadCommunity(), loadFeed()]).finally(() => setLoading(false));
 }, [loadCommunity, loadFeed]);

 const toggleJoin = async () => {
 if (!community) return;
 if (!community.joined) {
 try {
 const rules = await api(getRulesApi, { params: { slug } });
 if (rules.requireAgreement && rules.rules.length > 0) {
 setAgreeRules(rules.rules);
 return;
 }
 } catch {
 // Rules unavailable: try the join; the server still enforces agreement.
 }
 }
 commitJoin(false);
 };

 const commitJoin = (acceptRules: boolean) => {
 if (!community) return;
 const willJoin = !community.joined;
 runJoin({
 apply: () =>
 setCommunity(
 (c) => c && { ...c, joined: willJoin, memberCount: c.memberCount + (willJoin ? 1 : -1) },
 ),
 rollback: () =>
 setCommunity(
 (c) => c && { ...c, joined: !willJoin, memberCount: c.memberCount + (willJoin ? -1 : 1) },
 ),
 commit: async () => {
 const data = await api(joinCommunityApi, {
 params: { slug },
 body: acceptRules ? { acceptRules: true } : {},
 });
 // Trust the server's authoritative membership flag.
 if (typeof data.joined ==='boolean')
 setCommunity((c) => c && { ...c, joined: data.joined });
 },
 onError: (err) => {
 toast.error(
 sanctionRefusalText(err) ??
 serverError(err) ??
 t('could-not-update-membership', { defaultValue:'Could not update membership'}),
 );
 },
 });
 };

 const removeAnnouncement = async (id: string) => {
 try {
 await api(deleteCommunityAnnouncementApi, { params: { slug, id } });
 setCommunity((c) => c && { ...c, announcements: c.announcements.filter((a) => a.id !== id) });
 } catch {
 toast.error(t('could-not-delete', { defaultValue:'Could not delete'}));
 }
 };

 const onAnnounced = (a: Announcement) => {
 setCommunity((c) => c && { ...c, announcements: [a, ...c.announcements] });
 };

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (!community) {
 return (
 <EmptyState
 className={arrival}
 description={t('community-not-found', { defaultValue:'Community not found.'})}
 />
 );
 }

 const isMod = canModerate(community.role);

 return (
 <div className={arrival}>
 <header className="surface-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
 <Link
 to="/communities"
 className="text-site-text-muted hover:text-site-text"
 aria-label={t('back-to-communities', { defaultValue:'Back to communities'})}
 >
 <ArrowLeft className="h-5 w-5"/>
 </Link>
 <h1 dir="auto" className="truncate text-lg font-semibold text-site-text">{community.name}</h1>
 </header>

 <div className="border-b border-site-border p-4">
 <div className="flex items-start gap-3">
 <div
 className="flex h-14 w-14 shrink-0 items-center justify-center rounded-site text-2xl"
 style={{ background: (community.color ||'var(--site-accent)') +'22'}}
 >
 {community.icon ||'👥'}
 </div>
 <div className="min-w-0 flex-1">
 <h2 dir="auto" className="text-xl font-semibold text-site-text">{community.name}</h2>
 <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-site-text-muted">
 <span className="inline-flex items-center gap-1">
 <Users className="h-3.5 w-3.5"/>{''}
 {t('members-stat', {
 count: community.memberCount,
 formatted: community.memberCount,
 defaultValue:'{{formatted}} members',
 })}
 </span>
 <span className="inline-flex items-center gap-1">
 <MessageSquare className="h-3.5 w-3.5"/>{''}
 {t('posts-stat', {
 count: community.postCount,
 formatted: community.postCount,
 defaultValue:'{{formatted}} posts',
 })}
 </span>
 {community.game && (
 <Link
 to="/games/$gameId"
 params={{ gameId: community.game.id }}
 className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-site-text"
 >
 <Gamepad2 className="h-3.5 w-3.5" aria-hidden />
 {t('community-official-for', {
 title: community.game.title,
 defaultValue:'Official community for {{title}}',
 })}
 </Link>
 )}
 </div>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 {session && community.joined && (
 <FindATimeLink communityId={community.id} variant="button"/>
 )}
 {session && community.joined && <WatchControl kind="community"targetId={community.id}/>}
 {session && community.joined && <PostAlertsControl slug={slug} />}
 {session && (
 <Button size="sm"variant="default"onClick={() => setMembersOpen(true)}>
 {t('members-button', { defaultValue:'Members'})}
 </Button>
 )}
 {session && standing?.kind !=='ban'&& (
 <Button
 size="sm"
 variant={community.joined ?'default':'default'}
 disabled={joining}
 onClick={() => void toggleJoin()}
 >
 {community.joined
 ? t('joined', { defaultValue:'Joined'})
 : t('join', { defaultValue:'Join'})}
 </Button>
 )}
 <AdminModerateButton
 entityType="community"
 entityId={community.id}
 current={{ name: community.name, description: community.description }}
 onDone={(action) => {
 if (action ==='remove') window.location.assign('/communities');
 else window.location.reload();
 }}
 />
 </div>
 </div>
 {community.description && (
 <p dir="auto" className="mt-2 text-sm text-site-text-muted">{community.description}</p>
 )}
 </div>

 {community.joined && (
 <VoiceRoomBanner
 origin="community"
 originId={community.id}
 className="border-b border-site-border p-4"
 />
 )}

 {/* Pinned announcements */}
 {(community.announcements.length > 0 || isMod) && (
 <div className="border-b border-site-border bg-site-bg-subtle/30 p-4">
 <div className="mb-2 flex items-center justify-between">
 <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
 <Megaphone className="h-4 w-4 text-site-accent"/>{''}
 {t('announcements', { defaultValue:'Announcements'})}
 </h3>
 {isMod && (
 <Button size="sm"variant="ghost"onClick={() => setAnnounceOpen(true)}>
 <Megaphone className="h-4 w-4"/> {t('post-announcement', { defaultValue:'Post'})}
 </Button>
 )}
 </div>
 {community.announcements.length === 0 ? (
 <p className="text-xs text-site-text-muted">
 {t('no-announcements', { defaultValue:'No announcements yet.'})}
 </p>
 ) : (
 <ul className="flex flex-col gap-2">
 {community.announcements.map((a) => (
 <li
 key={a.id}
 className="rounded-site relative p-4"
 >
 <div className="flex items-start gap-2">
 <UserAvatar
 src={a.author.image}
 alt={a.author.name ??''}
 size={28}
 fallbackName={a.author.name ?? undefined}
 className="mt-0.5 rounded-full"
 />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 text-xs text-site-text-muted">
 <span className="font-medium text-site-text">
 {a.author.name ??
 (a.author.handle
 ? `@${a.author.handle}`
 : t('someone', { defaultValue:'Someone'}))}
 </span>
 <span>·</span>
 <span>
 {fmt.relative(new Date(a.createdAt))}
 </span>
 </div>
 <p className="mt-1 whitespace-pre-wrap break-words text-sm text-site-text">
 {a.body}
 </p>
 </div>
 {isMod && (
 <button
 type="button"
 onClick={() => removeAnnouncement(a.id)}
 className="shrink-0 rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
 aria-label={t('delete', { defaultValue:'Delete'})}
 >
 <X className="h-4 w-4"/>
 </button>
 )}
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}

 {/* Composer, tabs (posts · hall of fame · challenge · census · top · mod tools) */}
 <CommunityStandingNotice standing={standing} />
 <CommunityPlusBody
 community={community}
 items={items}
 setItems={setItems}
 initialPinned={initialPinned ?? null}
 composerLocked={standing?.kind ==='timeout'}
 />

 {announceOpen && (
 <AnnounceDialog slug={slug} onClose={() => setAnnounceOpen(false)} onPosted={onAnnounced} />
 )}
 {agreeRules && (
 <RulesAgreementDialog
 open
 communityName={community.name}
 rules={agreeRules}
 busy={joining}
 onCancel={() => setAgreeRules(null)}
 onConfirm={() => {
 setAgreeRules(null);
 commitJoin(true);
 }}
 />
 )}
 {membersOpen && (
 <MembersDialog
 slug={slug}
 viewerId={session?.user?.id ?? null}
 onClose={() => setMembersOpen(false)}
 />
 )}
 </div>
 );
}

function AnnounceDialog({
 slug,
 onClose,
 onPosted,
}: {
 slug: string;
 onClose: () => void;
 onPosted: (a: Announcement) => void;
}) {
 const { t } = useTranslation('feed');
 const [body, setBody] = useState('');
 const [submitting, setSubmitting] = useState(false);

 const submit = async () => {
 if (!body.trim()) return;
 setSubmitting(true);
 try {
 const data = await api(createCommunityAnnouncementApi, {
 params: { slug },
 body: { body: body.trim() },
 });
 if (data.announcement) {
 onPosted(data.announcement);
 onClose();
 } else {
 toast.error(t('could-not-post', { defaultValue:'Could not post'}));
 }
 } catch (err) {
 toast.error(serverError(err) || t('could-not-post', { defaultValue:'Could not post'}));
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <Dialog open onOpenChange={(o) => !o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>
 {t('post-announcement-title', { defaultValue:'Post an announcement'})}
 </DialogTitle>
 </DialogHeader>
 <textarea
 autoFocus
 value={body}
 maxLength={2000}
 rows={4}
 onChange={(e) => setBody(e.target.value)}
 placeholder={t('announcement-placeholder', {
 defaultValue:'Share an update with the community…',
 })}
 className="surface-field border w-full rounded-site-sm px-3 py-2 text-sm text-site-text placeholder:text-site-text-muted focus:border-site-accent focus:outline-none"
 />
 <div className="flex justify-end gap-2">
 <Button variant="ghost"onClick={onClose} disabled={submitting}>
 {t('cancel-button', { defaultValue:'Cancel'})}
 </Button>
 <Button variant="default"onClick={submit} disabled={submitting || !body.trim()}>
 <Send className="h-4 w-4"/>{''}
 {submitting
 ? t('posting', { defaultValue:'Posting…'})
 : t('post-button', { defaultValue:'Post'})}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}

function MembersDialog({
 slug,
 viewerId,
 onClose,
}: {
 slug: string;
 viewerId: string | null;
 onClose: () => void;
}) {
 const { t } = useTranslation(['feed', 'community-bans']);
 const fmt = useLocaleFormat();
 const confirm = useConfirm();
 // s06-01: who is timed out until when (moderators only).
 const [timedOut, setTimedOut] = useState<Record<string, string>>({});
 const [members, setMembers] = useState<Member[]>([]);
 // s06-02: moderator notes. One grouped counts request per page of the roster, never one per row.
 const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
 const [notesFor, setNotesFor] = useState<Member | null>(null);
 const [viewerRole, setViewerRole] = useState<string | null>(null);
 const [createdById, setCreatedById] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);
 // Steel M9: the roster replaces the spinner inside the open dialog.
 const membersArrival = useArrival(!loading);

 const load = useCallback(async () => {
 try {
 const data = await api(communityMembersApi, { params: { slug } });
 setMembers(data.members);
 setViewerRole(data.viewerRole);
 setCreatedById(data.createdById);
 } catch {
 // Leave the roster empty; the empty state explains it.
 }
 setLoading(false);
 }, [slug]);

 useEffect(() => {
 void load();
 }, [load]);

 const loadTimeouts = useCallback(async () => {
 try {
 const data = await api(listSanctionsApi, { params: { slug }, query: { status:'active'} });
 const next: Record<string, string> = {};
 for (const s of data.sanctions) {
 if (s.kind ==='timeout'&& s.endsAt && s.member) next[s.member.id] = s.endsAt;
 }
 setTimedOut(next);
 } catch {
 // The marker is a convenience; the Bans tab has the full list.
 }
 }, [slug]);

 useEffect(() => {
 if (viewerRole ==='ADMIN'|| viewerRole ==='MOD') void loadTimeouts();
 }, [viewerRole, loadTimeouts]);

 useEffect(() => {
 if ((viewerRole !=='ADMIN'&& viewerRole !=='MOD') || members.length === 0) return;
 let live = true;
 const chunks: string[][] = [];
 for (let i = 0; i < members.length; i += NOTE_COUNTS_MAX_IDS) {
 chunks.push(members.slice(i, i + NOTE_COUNTS_MAX_IDS).map((x) => x.id));
 }
 void Promise.all(
 chunks.map((ids) =>
 api(noteCountsApi, { params: { slug }, query: { userIds: ids.join(',') } }).then((r) => r.counts),
 ),
 )
 .then((all) => {
 if (live) setNoteCounts(Object.assign({}, ...all));
 })
 .catch(() => {
 // The count is a convenience; the roster works without it.
 });
 return () => {
 live = false;
 };
 }, [viewerRole, members, slug]);

 const setRole = async (m: Member, role:'MEMBER'|'MOD') => {
 setBusy(m.id);
 try {
 try {
 await api(setCommunityMemberRoleApi, { params: { slug, userId: m.id }, body: { role } });
 setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
 } catch (err) {
 toast.error(serverError(err) || t('action-failed', { defaultValue:'Action failed'}));
 }
 } finally {
 setBusy(null);
 }
 };

 const kick = async (m: Member) => {
 if (
 !(await confirm({
 title: t('kick-confirm', {
 name: m.name ?? m.handle ??'this member',
 defaultValue:'Remove {{name}} from the community?',
 }),
 danger: true,
 }))
 )
 return;
 setBusy(m.id);
 try {
 try {
 await api(removeCommunityMemberApi, { params: { slug, userId: m.id } });
 setMembers((prev) => prev.filter((x) => x.id !== m.id));
 } catch (err) {
 toast.error(serverError(err) || t('action-failed', { defaultValue:'Action failed'}));
 }
 } finally {
 setBusy(null);
 }
 };

 const isAdmin = viewerRole ==='ADMIN';
 const isMod = viewerRole ==='ADMIN'|| viewerRole ==='MOD';

 const roleLabel = (role: string) =>
 role ==='ADMIN'
 ? t('role-owner', { defaultValue:'Owner'})
 : role ==='MOD'
 ? t('role-mod', { defaultValue:'Mod'})
 : t('role-member', { defaultValue:'Member'});

 return (
 <Dialog open onOpenChange={(o) => !o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>{t('members-title', { defaultValue:'Members'})}</DialogTitle>
 </DialogHeader>
 {loading ? (
 <div className="flex justify-center py-10">
 <Spinner size={20} />
 </div>
 ) : (
 <ul
 className={cn(
 'max-h-[60vh] divide-y divide-site-border overflow-y-auto',
 membersArrival,
 )}
 >
 {members.map((m) => {
 const isOwner = m.id === createdById;
 const canTouch = isMod && !isOwner && m.id !== viewerId && m.role !=='ADMIN';
 // Mods can manage members; only the owner can demote/remove a mod.
 const canAlterMod = canTouch && (isAdmin || m.role ==='MEMBER');
 return (
 <li key={m.id} className="flex items-center gap-3 py-2.5">
 <UserAvatar
 src={m.image}
 alt={m.name ??''}
 size={32}
 fallbackName={m.name ?? undefined}
 className="rounded-full"
 />
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium text-site-text">
 {m.name ??
 (m.handle ? `@${m.handle}`: t('someone', { defaultValue:'Someone'}))}
 </p>
 <p className="text-xs text-site-text-muted">{roleLabel(m.role)}</p>
 {isMod && timedOut[m.id] && (
 <p className="t-meta">
 {t('timed-out-until', {
 ns: 'community-bans',
 date: fmt.dateTime(timedOut[m.id]!),
 defaultValue:'Timed out until {{date}}',
 })}
 </p>
 )}
 </div>
 {isMod && (
 <NotesButton
 member={{ id: m.id, name: m.name, handle: m.handle }}
 count={noteCounts[m.id] ?? 0}
 onClick={() => setNotesFor(m)}
 />
 )}
 {canAlterMod && (
 <MemberSanctionMenu
 slug={slug}
 member={{ id: m.id, name: m.name, handle: m.handle }}
 onDone={(member, kind) => {
 if (kind ==='ban') setMembers((prev) => prev.filter((x) => x.id !== member.id));
 else void loadTimeouts();
 }}
 />
 )}
 {canAlterMod && (
 <button
 type="button"
 disabled={busy === m.id}
 onClick={() => setRole(m, m.role ==='MOD'?'MEMBER':'MOD')}
 className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text disabled:opacity-50"
 title={
 m.role ==='MOD'
 ? t('remove-mod', { defaultValue:'Remove mod'})
 : t('make-mod', { defaultValue:'Make mod'})
 }
 >
 {m.role ==='MOD'? (
 <ShieldOff className="h-4 w-4"/>
 ) : (
 <Shield className="h-4 w-4"/>
 )}
 </button>
 )}
 {canTouch && (m.role ==='MEMBER'|| isAdmin) && (
 <button
 type="button"
 disabled={busy === m.id}
 onClick={() => kick(m)}
 className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-danger/15 hover:text-site-danger disabled:opacity-50"
 title={t('remove-member', { defaultValue:'Remove'})}
 >
 <UserX className="h-4 w-4"/>
 </button>
 )}
 </li>
 );
 })}
 </ul>
 )}
 {notesFor && (
 <MemberNotesDialog
 slug={slug}
 member={{ id: notesFor.id, name: notesFor.name, handle: notesFor.handle }}
 onClose={() => setNotesFor(null)}
 onCount={(count) => setNoteCounts((prev) => ({ ...prev, [notesFor.id]: count }))}
 />
 )}
 </DialogContent>
 </Dialog>
 );
}
