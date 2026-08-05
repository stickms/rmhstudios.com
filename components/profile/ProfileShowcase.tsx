'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';

import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IconButton } from '@/components/ui/icon-button';
import { SelectionBar } from '@/components/ui/selection-bar';
import { SortableList } from '@/components/ui/sortable-list';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/feed/StatusBadge';
import {
  MODULE_KINDS,
  MODULE_LABELS,
  MAX_MODULES,
  type ProfileModule,
  type ModuleKind,
} from '@/lib/profile/modules';
import type { UserStatus } from '@/lib/profile/status';
import type { WishlistItemView } from '@/lib/wishlist/types';

export interface ShowcaseProfile {
  id: string;
  followerCount: number;
  followingCount: number;
  rmharkCount: number;
  status: UserStatus | null;
}

function defaultModule(kind: ModuleKind): ProfileModule {
  if (kind === 'about') return { kind: 'about', config: { text: '' } };
  return { kind, config: {} } as ProfileModule;
}

/**
 * ProfileShowcase (§12) — renders the owner-configured module blocks (shared G3
 * WidgetFrame) and, for the owner, an inline editor (G1 sheet + G2 sortable).
 * Empty modules = nothing renders; unedited profiles are unchanged.
 */
export function ProfileShowcase({
  modules: initial,
  profile,
  isOwner,
}: {
  modules: ProfileModule[];
  profile: ShowcaseProfile;
  isOwner: boolean;
}) {
  const { t } = useTranslation('c-profile-modules');
  const [modules, setModules] = useState(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rows carry a stable id so the sortable primitive and the selection (B9) key
  // off the same thing.
  const rows = useMemo(
    () => modules.map((m, i) => ({ id: `${m.kind}-${i}`, module: m, index: i })),
    [modules],
  );
  const selection = useMultiSelect(rows);
  const { selectedIds, clear: clearSelection } = selection;

  const removeSelected = useCallback(() => {
    const doomed = new Set(selectedIds);
    setModules((prev) => prev.filter((m, i) => !doomed.has(`${m.kind}-${i}`)));
    clearSelection();
  }, [selectedIds, clearSelection]);

  if (modules.length === 0 && !isOwner) return null;

  const usedKinds = new Set(modules.map((m) => m.kind));
  const addable = MODULE_KINDS.filter((k) => !usedKinds.has(k));

  function addModule(kind: ModuleKind) {
    if (modules.length >= MAX_MODULES) return;
    setModules((prev) => [...prev, defaultModule(kind)]);
  }
  function removeAt(index: number) {
    setModules((prev) => prev.filter((_, i) => i !== index));
  }
  function setAboutText(index: number, text: string) {
    setModules((prev) =>
      prev.map((m, i) =>
        i === index && m.kind === 'about' ? { kind: 'about', config: { text } } : m,
      ),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/profile/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      toast.success(t('saved', { defaultValue: 'Showcase saved' }));
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't save your showcase" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 space-y-3">
      {isOwner ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {t('edit-showcase', { defaultValue: 'Edit showcase' })}
          </Button>
        </div>
      ) : null}

      {modules.map((m, i) => (
        <ModuleBlock key={`${m.kind}-${i}`} module={m} profile={profile} />
      ))}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('edit-showcase', { defaultValue: 'Edit showcase' })}</SheetTitle>
          </SheetHeader>

          {modules.length === 0 ? (
            <p className="py-4 text-center text-sm text-site-text-muted">
              {t('empty-editor', { defaultValue: 'Add blocks to build your showcase.' })}
            </p>
          ) : (
            <>
              <SortableList
                items={rows}
                onReorder={(next) => setModules(next.map((n) => n.module))}
                itemLabel={(it) => MODULE_LABELS[it.module.kind]}
                renderItem={(it) => {
                  const label = t(`module-${it.module.kind}`, {
                    defaultValue: MODULE_LABELS[it.module.kind],
                  });
                  const picked = selection.isSelected(it.id);
                  return (
                    <div className="flex items-center justify-between gap-2">
                      {/* Click replaces, ctrl/cmd-click toggles, shift-click ranges
                          — and Space / Enter / shift-arrows do the same from the
                          keyboard (hooks/useMultiSelect). */}
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={(e) => selection.onItemClick(it.id, e)}
                        onKeyDown={(e) => selection.onItemKeyDown(it.id, e)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          aria-hidden
                          className={`flex size-4 shrink-0 items-center justify-center rounded-site-sm border ${
                            picked
                              ? 'border-site-accent bg-site-accent text-site-accent-fg'
                              : 'border-site-border'
                          }`}
                        >
                          {picked ? <Check className="size-3" /> : null}
                        </span>
                        <span className="truncate text-sm text-site-text">{label}</span>
                      </button>
                      <IconButton
                        icon={Trash2}
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => removeAt(it.index)}
                        label={t('remove', { defaultValue: 'Remove' })}
                      />
                    </div>
                  );
                }}
              />

              <SelectionBar
                count={selection.count}
                allSelected={selection.allSelected}
                onSelectAll={selection.selectAll}
                onClear={selection.clear}
                actions={[
                  {
                    id: 'remove',
                    label: t('remove-selected', { defaultValue: 'Remove selected' }),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: removeSelected,
                  },
                ]}
              />
            </>
          )}

          {/* About text config (when present). */}
          {modules.map((m, i) =>
            m.kind === 'about' ? (
              <Textarea
                key={`about-cfg-${i}`}
                value={m.config.text}
                onChange={(e) => setAboutText(i, e.target.value.slice(0, 600))}
                placeholder={t('about-placeholder', { defaultValue: 'A few words about you…' })}
                aria-label={t('module-about', { defaultValue: 'About' })}
                className="mt-3"
                rows={3}
              />
            ) : null,
          )}

          {/* Add-block row. */}
          {addable.length > 0 && modules.length < MAX_MODULES ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {addable.map((k) => (
                <Button key={k} variant="outline" size="sm" onClick={() => addModule(k)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {t(`module-${k}`, { defaultValue: MODULE_LABELS[k] })}
                </Button>
              ))}
            </div>
          ) : null}

          <SheetFooter>
            <Button variant="accent" onClick={save} loading={saving}>
              {t('save', { defaultValue: 'Save' })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ModuleBlock({ module, profile }: { module: ProfileModule; profile: ShowcaseProfile }) {
  const { t } = useTranslation('c-profile-modules');
  const title = t(`module-${module.kind}`, { defaultValue: MODULE_LABELS[module.kind] });

  if (module.kind === 'about') {
    if (!module.config.text) return null;
    return (
      <WidgetFrame title={title}>
        <p className="whitespace-pre-wrap break-words text-sm text-site-text">
          {module.config.text}
        </p>
      </WidgetFrame>
    );
  }

  if (module.kind === 'stats') {
    const stats = [
      { label: t('followers', { defaultValue: 'Followers' }), value: profile.followerCount },
      { label: t('following', { defaultValue: 'Following' }), value: profile.followingCount },
      { label: t('posts', { defaultValue: 'Posts' }), value: profile.rmharkCount },
    ];
    return (
      <WidgetFrame title={title}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-lg font-semibold text-site-text">{s.value}</div>
              <div className="text-xs text-site-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </WidgetFrame>
    );
  }

  if (module.kind === 'status') {
    return (
      <WidgetFrame
        title={title}
        empty={!profile.status}
        emptyTitle={t('no-status', { defaultValue: 'No status set' })}
      >
        {profile.status ? <StatusBadge status={profile.status} /> : null}
      </WidgetFrame>
    );
  }

  if (module.kind === 'wishlist') {
    return <WishlistModule title={title} userId={profile.id} />;
  }

  return null;
}

function WishlistModule({ title, userId }: { title: string; userId: string }) {
  const { t } = useTranslation('c-profile-modules');
  const [items, setItems] = useState<WishlistItemView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/wishlist`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { items: WishlistItemView[] } | null) => !cancelled && setItems(data?.items ?? []),
      )
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <WidgetFrame
      title={title}
      loading={items === null}
      empty={items?.length === 0}
      emptyTitle={t('no-wishlist', { defaultValue: 'Wishlist is private or empty' })}
    >
      <ul className="space-y-1">
        {items?.slice(0, 5).map((i) => (
          <li key={i.id} className="truncate text-sm text-site-text">
            {i.href ? (
              <a href={i.href} className="hover:underline">
                {i.title}
              </a>
            ) : (
              i.title
            )}
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}
