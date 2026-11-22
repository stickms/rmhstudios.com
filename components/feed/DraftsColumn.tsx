import { useEffect, useState, useCallback, useRef } from'react';
import { useTranslation } from'react-i18next';
import {
 FileText,
 CalendarClock,
 Send,
 Trash2,
 Globe,
 Users,
 Lock,
 BarChart3,
 Image as ImageIcon,
 Pencil,
} from'lucide-react';
import { ColumnHeader } from'./ColumnHeader';
import { DraftEditDialog } from './DraftEditDialog';
import { canEditDraft } from './draft-edit';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import { Button } from'@/components/ui/button';
import { CoinIcon } from'@/components/ui/CoinIcon';
import { api } from'@/lib/contract/client';
import {
 discardScheduledApi,
 listScheduledApi,
 publishScheduledApi,
} from'@/lib/scheduled/scheduled.contract';
import { useArrival } from '@/components/ui/arrive';
import { formatDateTime } from '@/lib/core/format';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

interface ScheduledRow {
 id: string;
 content: string;
 gifUrl: string | null;
 imageUrls: string[];
 imageAlts: string[];
 audience:'PUBLIC'|'FOLLOWERS'|'PRIVATE';
 contentWarning?: string | null;
 /** The list leaves time capsules out; a row that is one still gets no "Edit" (s09-01). */
 isCapsule?: boolean;
 unlockPrice: number | null;
 poll: { question?: string } | null;
 scheduledAt: string | null;
 createdAt: string;
 /** Why the last publish attempt left it a draft (s09-11); null when there is none or the draft was edited since. */
 blockedReason?: string | null;
}

const AUDIENCE_ICON = { PUBLIC: Globe, FOLLOWERS: Users, PRIVATE: Lock } as const;

function formatWhen(iso: string, locale: string): string {
 const d = new Date(iso);
 return formatDateTime(d, locale, {
 month:'short',
 day:'numeric',
 hour:'numeric',
 minute:'2-digit',
 });
}

export function DraftsColumn({
 initialData,
}: {
 /** Drafts + scheduled prefetched by the route loader; `null`when signed out. */
 initialData?: { drafts: ScheduledRow[]; scheduled: ScheduledRow[] } | null;
} = {}) {
 const { t } = useTranslation('feed');
 const seeded = useRef(initialData !== undefined && initialData !== null);
 const [drafts, setDrafts] = useState<ScheduledRow[]>(initialData?.drafts ?? []);
 const [scheduled, setScheduled] = useState<ScheduledRow[]>(initialData?.scheduled ?? []);
 const [loading, setLoading] = useState(!initialData);
 const [busy, setBusy] = useState<string | null>(null);
 const [editing, setEditing] = useState<ScheduledRow | null>(null);
 // Steel M9: lists fetched here replace the spinner; the loader's are there on first paint.
 const arrival = useArrival(!loading);

 const load = useCallback(async () => {
 try {
 const data = await api(listScheduledApi);
 setDrafts(data.drafts);
 setScheduled(data.scheduled);
 } catch {
 // A failed refresh leaves the current lists in place.
 }
 }, []);

 useEffect(() => {
 // Loader already seeded — skip the mount fetch (mutations like publish/
 // discard still call `load()`to refresh afterward).
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

 async function publishNow(id: string) {
 setBusy(`p:${id}`);
 try {
 await api(publishScheduledApi, { params: { id } });
 await load();
 } catch {
 // Not published: leave the lists as they are.
 } finally {
 setBusy(null);
 }
 }

 async function discard(id: string) {
 setBusy(`d:${id}`);
 try {
 await api(discardScheduledApi, { params: { id } });
 await load();
 } catch {
 // Not discarded: leave the lists as they are.
 } finally {
 setBusy(null);
 }
 }

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }

 const empty = drafts.length === 0 && scheduled.length === 0;

 return (
 <div className={arrival}>
 <ColumnHeader
 icon={FileText}
 title={t('drafts-and-scheduled', { defaultValue:'Drafts & Scheduled'})}
 />

 {empty ? (
 <div>
 <EmptyState
 description={t('no-drafts-yet', {
 defaultValue:
'No drafts yet. Use the"Save as draft"or"Schedule"options in the composer.',
 })}
 />
 </div>
 ) : (
 <div className="space-y-6 pt-4 pb-12">
 <Section
 title={t('section-scheduled', { defaultValue:'Scheduled'})}
 icon={CalendarClock}
 rows={scheduled}
 busy={busy}
 onPublish={publishNow}
 onDiscard={discard}
 onEdit={setEditing}
 />
 <Section
 title={t('section-drafts', { defaultValue:'Drafts'})}
 icon={FileText}
 rows={drafts}
 busy={busy}
 onPublish={publishNow}
 onDiscard={discard}
 onEdit={setEditing}
 />
 </div>
 )}
 {editing && (
 <DraftEditDialog
 key={editing.id}
 row={editing}
 onClose={() => setEditing(null)}
 onSaved={() => void load()}
 />
 )}
 </div>
 );
}

function Section({
 title,
 icon: Icon,
 rows,
 busy,
 onPublish,
 onDiscard,
 onEdit,
}: {
 title: string;
 icon: typeof FileText;
 rows: ScheduledRow[];
 busy: string | null;
 onPublish: (id: string) => void;
 onDiscard: (id: string) => void;
 onEdit: (row: ScheduledRow) => void;
}) {
 const { t } = useTranslation(['feed','draft-edit']);
  const { locale } = useLocaleFormat();
 if (rows.length === 0) return null;
 return (
 <section>
 <h2 className="site-section-label mb-3 flex items-center gap-2">
 <Icon className="h-3.5 w-3.5"/> {title}
 </h2>
 <div className="space-y-3">
 {rows.map((r) => {
 const AudienceIcon = AUDIENCE_ICON[r.audience];
 return (
 <div
 key={r.id}
 className={`rounded-site px-4 py-3`}
 >
 <p className="whitespace-pre-wrap break-words text-sm text-site-text">
 {r.content || (
 <span className="text-site-text-muted">
 {t('no-text', { defaultValue:'(no text)'})}
 </span>
 )}
 </p>
 {r.blockedReason && <p className="t-meta mt-2 break-words">{r.blockedReason}</p>}
 <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-site-text-muted">
 {r.scheduledAt && (
 <span className="inline-flex items-center gap-1 text-site-accent">
 <CalendarClock className="h-3 w-3"/> {formatWhen(r.scheduledAt, locale)}
 </span>
 )}
 <span className="inline-flex items-center gap-1">
 <AudienceIcon className="h-3 w-3"/> {r.audience.toLowerCase()}
 </span>
 {r.poll?.question && (
 <span className="inline-flex items-center gap-1">
 <BarChart3 className="h-3 w-3"/> {t('poll-label', { defaultValue:'poll'})}
 </span>
 )}
 {(r.imageUrls.length > 0 || r.gifUrl) && (
 <span className="inline-flex items-center gap-1">
 <ImageIcon className="h-3 w-3"/> {t('media-label', { defaultValue:'media'})}
 </span>
 )}
 {r.unlockPrice && r.unlockPrice > 0 && (
 <span className="inline-flex items-center gap-1">
 <CoinIcon className="h-3 w-3"/> {r.unlockPrice}
 </span>
 )}
 </div>
 <div className="mt-3 flex items-center gap-2">
 {canEditDraft(r) && (
 <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
 <Pencil className="h-3.5 w-3.5"/>
 {t('edit', { ns:'draft-edit', defaultValue:'Edit'})}
 </Button>
 )}
 <Button
 size="sm"
 variant="default"
 loading={busy === `p:${r.id}`}
 onClick={() => onPublish(r.id)}
 >
 {busy !== `p:${r.id}`&& <Send className="h-3.5 w-3.5"/>}
 {t('post-now', { defaultValue:'Post now'})}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 loading={busy === `d:${r.id}`}
 onClick={() => onDiscard(r.id)}
 className="text-site-text-muted hover:text-site-danger"
 >
 {busy !== `d:${r.id}`&& <Trash2 className="h-3.5 w-3.5"/>}
 {t('discard', { defaultValue:'Discard'})}
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 </section>
 );
}
