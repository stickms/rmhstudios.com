/**
 * The Connections grid form, shared by "Make a grid" and the author's "Edit": a title, four labelled groups of four
 * items, and three ways out. Publish (the one ink primary) makes the grid public; Save draft keeps it private and
 * counts it toward the cap; Try it plays it in the browser first, writing nothing. Editing a grid nobody has played
 * keeps Save changes as the primary instead.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { ConnectionsPractice } from '@/components/party/ConnectionsPractice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Section } from '@/components/ui/rules';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  createConnectionGridApi,
  editConnectionGridApi,
  publishConnectionGridApi,
} from '@/lib/party/connections.contract';
import type { GridGroup } from '@/lib/party/connections';
import { isCompleteGrid } from '@/lib/party/connections-practice';

const blankGroups = (): GridGroup[] => Array.from({ length: 4 }, () => ({ label: '', items: ['', '', '', ''] }));

interface Props {
  /** Set when editing a saved grid. */
  gridId?: string;
  /** Editing a draft (or making a new grid): Publish is on offer. False for a published grid. */
  draft: boolean;
  initial?: { title: string; groups: GridGroup[] };
  /** Editing: called after a save or a publish. */
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ConnectionsEditor({ gridId, draft, initial, onSaved, onCancel }: Props) {
  const { t } = useTranslation('connections-maker');
  const refusalText = useRefusalText();
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [groups, setGroups] = useState<GridGroup[]>(() =>
    initial ? initial.groups.map((g) => ({ label: g.label, items: [...g.items] })) : blankGroups(),
  );
  const [busy, setBusy] = useState(false);
  const [trying, setTrying] = useState(false);

  const setLabel = (g: number, v: string) => setGroups((gs) => gs.map((x, i) => (i === g ? { ...x, label: v } : x)));
  const setItem = (g: number, k: number, v: string) =>
    setGroups((gs) => gs.map((x, i) => (i === g ? { ...x, items: x.items.map((y, j) => (j === k ? v : y)) } : x)));

  const trimmed: GridGroup[] = groups.map((g) => ({ label: g.label.trim(), items: g.items.map((i) => i.trim()) }));
  const flat = trimmed.flatMap((g) => g.items.map((i) => i.toLowerCase()));
  const filled = flat.every(Boolean) && trimmed.every((g) => g.label.length >= 2);
  const unique = new Set(flat).size === 16;
  const complete = isCompleteGrid(title, trimmed);
  const body = { title: title.trim(), groups: trimmed };

  async function run(work: () => Promise<void>, failed: string) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? failed);
    } finally {
      setBusy(false);
    }
  }

  const goTo = (id: string) => void navigate({ to: '/connections/u/$id', params: { id } });

  // Make a grid: straight to published, or saved as a draft.
  const createNew = (asDraft: boolean) =>
    run(
      async () => {
        const { id } = await api(createConnectionGridApi, { body: asDraft ? { ...body, draft: true } : body });
        toast.success(
          asDraft
            ? t('draft-saved', { defaultValue: 'Draft saved.' })
            : t('grid-published', { defaultValue: 'Grid published.' }),
        );
        goTo(id);
      },
      asDraft
        ? t('draft-failed', { defaultValue: 'Could not save the draft.' })
        : t('publish-failed', { defaultValue: 'Could not publish the grid.' }),
    );

  // Edit: save the change, then optionally publish the draft.
  const saveEdit = (publish: boolean) =>
    run(
      async () => {
        if (!gridId) return;
        await api(editConnectionGridApi, { params: { id: gridId }, body });
        if (publish) await api(publishConnectionGridApi, { params: { id: gridId } });
        toast.success(
          publish
            ? t('grid-published', { defaultValue: 'Grid published.' })
            : draft
              ? t('draft-saved', { defaultValue: 'Draft saved.' })
              : t('changes-saved', { defaultValue: 'Changes saved.' }),
        );
        onSaved?.();
      },
      publish
        ? t('publish-failed', { defaultValue: 'Could not publish the grid.' })
        : t('save-failed', { defaultValue: 'Could not save the changes.' }),
    );

  if (trying) {
    return <ConnectionsPractice seed={gridId ?? 'draft'} groups={trimmed} onExit={() => setTrying(false)} />;
  }

  const editing = !!gridId;
  return (
    <div className="space-y-[var(--site-section-gap)] px-4 pt-4 pb-12">
      <Input
        value={title}
        maxLength={80}
        dir="auto"
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('grid-title', { defaultValue: 'Grid title' })}
        aria-label={t('grid-title', { defaultValue: 'Grid title' })}
      />
      {groups.map((g, gi) => (
        <Section key={gi} className="space-y-3 py-4">
          <Input
            value={g.label}
            maxLength={40}
            dir="auto"
            onChange={(e) => setLabel(gi, e.target.value)}
            placeholder={t('group-label', { defaultValue: 'Group {{n}} label', n: gi + 1 })}
            aria-label={t('group-label', { defaultValue: 'Group {{n}} label', n: gi + 1 })}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {g.items.map((it, k) => (
              <Input
                key={k}
                value={it}
                maxLength={30}
                dir="auto"
                onChange={(e) => setItem(gi, k, e.target.value)}
                aria-label={t('item-label', { defaultValue: 'Group {{n}} item {{k}}', n: gi + 1, k: k + 1 })}
              />
            ))}
          </div>
        </Section>
      ))}
      {filled && !unique ? (
        <p className="t-body text-site-danger" role="alert">
          {t('dupes', { defaultValue: 'Every one of the 16 items must be different.' })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {draft ? (
          <Button
            variant="primary"
            disabled={busy || !complete}
            onClick={() => void (editing ? saveEdit(true) : createNew(false))}
          >
            {t('publish', { defaultValue: 'Publish' })}
          </Button>
        ) : (
          <Button variant="primary" disabled={busy || !complete} onClick={() => void saveEdit(false)}>
            {t('save-changes', { defaultValue: 'Save changes' })}
          </Button>
        )}
        {draft ? (
          <Button
            disabled={busy || title.trim().length === 0}
            onClick={() => void (editing ? saveEdit(false) : createNew(true))}
          >
            {t('save-draft', { defaultValue: 'Save draft' })}
          </Button>
        ) : null}
        <Button disabled={busy || !complete} onClick={() => setTrying(true)}>
          {t('try-it', { defaultValue: 'Try it' })}
        </Button>
        {onCancel ? (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
