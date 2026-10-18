import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Link2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarathonSchedule } from '@/components/marathon/MarathonSchedule';
import { toolsApi } from '@/lib/tools/client';
import type { MarathonItem } from '@/lib/dunesday/marathon';

interface Saved {
  id: string;
  title: string;
  deadline: string;
  items: MarathonItem[];
  shareId: string;
}
interface Draft {
  id: string | null;
  title: string;
  deadline: string;
  items: MarathonItem[];
  shareId: string | null;
}
const blank = (): Draft => ({ id: null, title: '', deadline: '', items: [], shareId: null });
const inputCls = 'glass-inset h-9 rounded-site-sm px-2 text-sm text-site-text';

export default function MarathonPlanner() {
  const { t } = useTranslation('f-tools');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [newTitle, setNewTitle] = useState('');
  const [newMin, setNewMin] = useState(120);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    toolsApi<{ lists: Saved[] }>('GET', '/api/marathon-lists')
      .then((d) => {
        setSaved(d.lists);
        if (d.lists[0]) setDraft(d.lists[0]);
      })
      .catch(() =>
        toast.error(t('marathon-load-failed', { defaultValue: 'Could not load your lists' })),
      );
  }, [t]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const move = (i: number, dir: -1 | 1) => {
    const items = [...draft.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
    patch({ items });
  };
  const add = () => {
    if (!newTitle.trim() || newMin < 1) return;
    patch({ items: [...draft.items, { title: newTitle.trim(), minutes: Math.round(newMin) }] });
    setNewTitle('');
  };

  const save = async () => {
    const payload = {
      title: draft.title.trim() || t('marathon-untitled', { defaultValue: 'My marathon' }),
      deadline: draft.deadline,
      items: draft.items,
    };
    setBusy(true);
    try {
      if (draft.id) {
        await toolsApi('PUT', `/api/marathon-lists/${draft.id}`, payload);
        setSaved((s) => s.map((x) => (x.id === draft.id ? { ...x, ...payload } : x)));
      } else {
        const r = await toolsApi<{ id: string }>('POST', '/api/marathon-lists', payload);
        // The share id is issued server-side; reload to learn it.
        const d = await toolsApi<{ lists: Saved[] }>('GET', '/api/marathon-lists');
        setSaved(d.lists);
        const mine = d.lists.find((x) => x.id === r.id);
        if (mine) setDraft(mine);
      }
      toast.success(t('marathon-saved', { defaultValue: 'List saved' }));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('marathon-save-failed', { defaultValue: 'Could not save' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    try {
      await toolsApi('DELETE', `/api/marathon-lists/${draft.id}`);
      const rest = saved.filter((x) => x.id !== draft.id);
      setSaved(rest);
      setDraft(rest[0] ?? blank());
    } catch {
      toast.error(t('marathon-delete-failed', { defaultValue: 'Could not delete' }));
    }
  };

  const copyLink = async () => {
    if (!draft.shareId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/marathon/${draft.shareId}`);
      toast.success(t('marathon-copied', { defaultValue: 'Share link copied' }));
    } catch {
      toast.error(t('marathon-copy-failed', { defaultValue: 'Could not copy the link' }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('marathon-pick', { defaultValue: 'Choose a list' })}
          className={inputCls}
          value={draft.id ?? ''}
          onChange={(e) => {
            const l = saved.find((x) => x.id === e.target.value);
            if (l) setDraft(l);
          }}
        >
          {!draft.id && (
            <option value="">{t('marathon-unsaved', { defaultValue: 'Unsaved list' })}</option>
          )}
          {saved.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setDraft(blank())}>
          <Plus /> {t('marathon-new', { defaultValue: 'New list' })}
        </Button>
        {draft.id && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            aria-label={t('marathon-delete', { defaultValue: 'Delete list' })}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <section className="glass-pane space-y-4 rounded-site p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-site-text-muted">
              {t('marathon-title', { defaultValue: 'List name' })}
            </span>
            <input
              className={`${inputCls} w-full`}
              maxLength={120}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-site-text-muted">
              {t('marathon-deadline', { defaultValue: 'Finish by' })}
            </span>
            <input
              type="date"
              className={`${inputCls} w-full`}
              value={draft.deadline}
              onChange={(e) => patch({ deadline: e.target.value })}
            />
          </label>
        </div>

        <ol className="space-y-1.5">
          {draft.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{it.title}</span>
              <span className="text-site-text-muted">
                {it.minutes} {t('marathon-min', { defaultValue: 'min' })}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t('marathon-up', { defaultValue: 'Move up' })}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={i === draft.items.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t('marathon-down', { defaultValue: 'Move down' })}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => patch({ items: draft.items.filter((_, j) => j !== i) })}
                aria-label={t('marathon-remove', { defaultValue: 'Remove' })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>

        {draft.items.length < 150 && (
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputCls} min-w-0 flex-1`}
              maxLength={100}
              placeholder={t('marathon-item-title', {
                defaultValue: 'Title (film, episode, season)',
              })}
              aria-label={t('marathon-item-title', {
                defaultValue: 'Title (film, episode, season)',
              })}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <input
              type="number"
              min={1}
              max={2000}
              className={`${inputCls} w-24`}
              aria-label={t('marathon-item-minutes', { defaultValue: 'Runtime in minutes' })}
              value={newMin}
              onChange={(e) => setNewMin(Number(e.target.value))}
            />
            <Button variant="outline" size="sm" onClick={add}>
              <Plus /> {t('marathon-add', { defaultValue: 'Add' })}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy || draft.items.length === 0 || !draft.deadline}>
            <Save /> {t('marathon-save', { defaultValue: 'Save list' })}
          </Button>
          {draft.shareId && (
            <Button variant="outline" onClick={copyLink}>
              <Link2 /> {t('marathon-share', { defaultValue: 'Copy share link' })}
            </Button>
          )}
        </div>
      </section>

      <MarathonSchedule items={draft.items} deadline={draft.deadline} />
    </div>
  );
}
