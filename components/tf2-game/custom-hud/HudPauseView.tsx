/**
 * Pause menu → HUD: choose the HUD the game draws, see it, edit it, export it.
 *
 *  - TF2 Default (the game's own HUD), this device's drafts from the HUD
 *    editor, the account's saved HUDs (signed in), and the workshop's public
 *    HUDs — or any share link pasted in;
 *  - a live preview of the HUD in use, drawn by the same renderer as the game
 *    from the match's current state (a sample state before a class is picked);
 *  - "Edit HUD" opens the full editor over the game, "Export" builds the zip
 *    that installs into TF2's tf/custom (the editor's own export dialog).
 *
 * Items are buttons with `data-menu-item`, so Tab, the arrow keys and the
 * gamepad's d-pad move between them (menu-nav.ts) and A / Enter picks.
 */
'use client';

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Link2, PencilRuler } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { api, type HudSummary } from '@/lib/tf2-hud/api';
import { listDrafts, type DraftSummary } from '@/lib/tf2-hud/local-drafts';
import {
  CustomHudRenderer,
  prepareHud,
  type PreparedHud,
} from '@/lib/tf2-game/client/custom-hud/renderer';
import {
  parseHudLink,
  selectionKey,
  type HudSelection,
} from '@/lib/tf2-game/client/custom-hud/selection';
import { DEFAULT_HUD_META } from '@/lib/tf2-game/client/custom-hud/source';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import { cn } from '@/lib/utils';
import { Btn } from '../../tf2-hud/ui';
import { soldierCp } from '../preview/sample-states';
import { useMenuNav } from '../menu-nav';
import { hudTokens } from './CustomHudLayer';
import { useHudContext } from '../use-hud';
import { ensureEditorHolds } from './editor-session';
import { useHudChoice } from './hud-choice';

const ExportDialog = lazy(() => import('../../tf2-hud/ExportDialog'));

/** The stock HUD through the same renderer, for the preview while the default is in use (prepared once). */
let defaultPrepared: Promise<PreparedHud> | null = null;
const prepareDefault = () =>
  (defaultPrepared ??= prepareHud({
    selection: { kind: 'default' },
    meta: DEFAULT_HUD_META,
    overlay: new Map(),
  }).catch((e) => {
    defaultPrepared = null;
    throw e;
  }));

/** The HUD in use, drawn at 1280×720 and scaled to the box, from the live state (or a sample). */
function HudThumbnail({ hud }: { hud: PreparedHud | null }) {
  const { t } = useTranslation('c-tf2-game');
  const { store } = useHudContext();
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState<PreparedHud | null>(null);
  useEffect(() => {
    if (hud) return;
    let live = true;
    void prepareDefault()
      .then((p) => live && setFallback(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hud]);
  const shown = hud ?? fallback;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !shown) return;
    const r = new CustomHudRenderer(canvas);
    r.setFallbackTokens(hudTokens(t));
    r.resize(1280, 720);
    r.setHud(shown);
    const live = store.getSnapshot();
    const state: HudState =
      live.local && live.local.cls > 0 && live.local.team >= 2
        ? live
        : { ...soldierCp(), match: live.local ? live.match : soldierCp().match };
    r.update(state, true);
    return () => r.dispose();
  }, [shown, store, t]);
  return (
    <div className="tf2hud-backdrop-game relative aspect-video w-full overflow-hidden rounded-(--app-radius-sm) border border-(--app-border)">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />
    </div>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty?: string | null;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-(--app-text-dim)">
        {title}
      </h3>
      {empty ? (
        <p className="text-xs text-(--app-text-muted)">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1">{children}</div>
      )}
    </section>
  );
}

function HudItem({
  label,
  detail,
  sel,
  current,
}: {
  label: string;
  detail?: string;
  sel: HudSelection;
  current: string;
}) {
  const { t } = useTranslation('c-tf2-game');
  const choose = useHudChoice((s) => s.choose);
  const pending = useHudChoice((s) => s.pending);
  const key = selectionKey(sel);
  const active = key === current;
  return (
    <button
      type="button"
      data-menu-item
      data-current={active ? 'true' : undefined}
      aria-pressed={active}
      onClick={() => void choose(sel)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-(--app-radius-sm) border px-3 py-2 text-start text-sm transition-[color,background-color,border-color] duration-(--app-duration-fast)',
        active
          ? 'border-(--app-accent) bg-(--app-accent-dim) text-(--app-text)'
          : 'border-(--app-border) bg-(--app-bg-subtle) text-(--app-text) hover:bg-(--app-surface-hover)',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {detail ? (
          <span className="block truncate text-xs text-(--app-text-muted)">{detail}</span>
        ) : null}
      </span>
      {pending === key ? (
        <span className="shrink-0 text-xs text-(--app-text-muted)">
          {t('hud_loading', { defaultValue: 'Loading…' })}
        </span>
      ) : active ? (
        <Check className="size-4 shrink-0 text-(--app-accent-text)" aria-hidden />
      ) : null}
    </button>
  );
}

export default function HudPauseView({
  onEdit,
  onBack,
}: {
  onEdit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const selection = useHudChoice((s) => s.selection);
  const active = useHudChoice((s) => s.active);
  const pending = useHudChoice((s) => s.pending);
  const error = useHudChoice((s) => s.error);
  const choose = useHudChoice((s) => s.choose);
  const current = selectionKey(selection);
  const rootRef = useRef<HTMLDivElement>(null);
  useMenuNav(rootRef, true, onBack);

  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [mine, setMine] = useState<HudSummary[] | null>(null);
  const [workshop, setWorkshop] = useState<HudSummary[] | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReady, setExportReady] = useState(false);

  useEffect(() => {
    let live = true;
    void listDrafts().then((d) => live && setDrafts(d.slice(0, 20)));
    void api
      .list({ sort: 'top', limit: 12 })
      .then((r) => live && setWorkshop(r.items))
      .catch(() => live && setWorkshop([]));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void api
      .list({ mine: true, limit: 20 })
      .then((r) => live && setMine(r.items))
      .catch(() => live && setMine([]));
    return () => {
      live = false;
    };
  }, [signedIn]);

  const name =
    active?.hud.meta.name ??
    (selection.kind === 'default' ? t('hud_default', { defaultValue: 'TF2 Default' }) : '');
  const status = pending
    ? t('hud_status_loading', {
        defaultValue: 'Loading the HUD — the current one stays until it is ready.',
      })
    : error === 'missing'
      ? t('hud_error_missing', {
          defaultValue:
            'That HUD could not be found. It may have been deleted, or the draft is on another device.',
        })
      : error === 'forbidden'
        ? t('hud_error_forbidden', { defaultValue: 'That HUD is private.' })
        : error === 'network'
          ? t('hud_error_network', {
              defaultValue: 'The HUD could not be downloaded. Check your connection and try again.',
            })
          : null;

  const submitLink = () => {
    const sel = parseHudLink(link);
    setLinkError(!sel);
    if (sel) {
      void choose(sel);
      setLink('');
    }
  };

  const openExport = async () => {
    setExportReady(false);
    setExportOpen(true);
    const ok = await ensureEditorHolds(
      selection,
      t('editor_copy_suffix', { defaultValue: '(copy)' }),
    );
    if (ok) setExportReady(true);
    else setExportOpen(false);
  };

  const draftItems = useMemo(() => drafts ?? [], [drafts]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HudThumbnail hud={active} />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-(--app-text-dim)">
            {t('hud_in_use', { defaultValue: 'In use' })}
          </p>
          <p className="tf2hud-title truncate text-xl">{name}</p>
          {status ? (
            <p
              role="status"
              className={cn('text-xs', error ? 'text-(--app-danger)' : 'text-(--app-text-muted)')}
            >
              {status}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2">
            <Btn size="md" variant="primary" icon={PencilRuler} data-menu-item onClick={onEdit}>
              {t('hud_edit', { defaultValue: 'Edit HUD' })}
            </Btn>
            <Btn size="md" icon={Download} data-menu-item onClick={() => void openExport()}>
              {t('hud_export', { defaultValue: 'Export' })}
            </Btn>
          </div>
          <p className="text-xs text-(--app-text-muted)">
            {t('hud_export_hint', {
              defaultValue:
                'Export downloads a zip: unzip it into Team Fortress 2’s tf/custom folder.',
            })}
          </p>
        </div>
      </div>

      <Section title={t('hud_section_default', { defaultValue: 'Default' })}>
        <HudItem
          label={t('hud_default', { defaultValue: 'TF2 Default' })}
          detail={t('hud_default_detail', { defaultValue: 'The game’s own HUD' })}
          sel={{ kind: 'default' }}
          current={current}
        />
      </Section>

      <Section
        title={t('hud_section_drafts', { defaultValue: 'Drafts on this device' })}
        empty={
          drafts === null
            ? t('hud_loading', { defaultValue: 'Loading…' })
            : draftItems.length === 0
              ? t('hud_no_drafts', { defaultValue: 'No drafts yet. Edit a HUD to make one.' })
              : null
        }
      >
        {draftItems.map((d) => (
          <HudItem
            key={d.id}
            label={d.meta.name}
            detail={t('hud_draft_files', { defaultValue: 'Files changed: {{n}}', n: d.fileCount })}
            sel={{ kind: 'draft', id: d.id }}
            current={current}
          />
        ))}
      </Section>

      <Section
        title={t('hud_section_mine', { defaultValue: 'My HUDs' })}
        empty={
          !signedIn
            ? t('hud_sign_in', { defaultValue: 'Sign in to use the HUDs saved to your account.' })
            : mine === null
              ? t('hud_loading', { defaultValue: 'Loading…' })
              : mine.length === 0
                ? t('hud_no_saved', { defaultValue: 'No saved HUDs yet.' })
                : null
        }
      >
        {(mine ?? []).map((h) => (
          <HudItem
            key={h.id}
            label={h.title}
            detail={h.description || undefined}
            sel={{ kind: 'cloud', id: h.id }}
            current={current}
          />
        ))}
      </Section>

      <Section title={t('hud_section_workshop', { defaultValue: 'Workshop' })}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <label className="sr-only" htmlFor="tf2g-hud-link">
            {t('hud_link_label', { defaultValue: 'HUD share link' })}
          </label>
          <input
            id="tf2g-hud-link"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(false);
            }}
            placeholder={t('hud_link_placeholder', { defaultValue: 'Paste a share link' })}
            aria-invalid={linkError}
            aria-describedby={linkError ? 'tf2g-hud-link-error' : undefined}
            className="h-11 min-w-0 flex-1 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 text-sm text-(--app-text) placeholder:text-(--app-text-dim) focus-visible:border-(--app-accent)"
          />
          <Btn size="md" type="submit" icon={Link2} data-menu-item disabled={!link.trim()}>
            {t('hud_link_use', { defaultValue: 'Use' })}
          </Btn>
        </form>
        {linkError ? (
          <p id="tf2g-hud-link-error" className="text-xs text-(--app-danger)">
            {t('hud_link_invalid', { defaultValue: 'That is not a HUD link.' })}
          </p>
        ) : null}
        {workshop === null ? (
          <p className="text-xs text-(--app-text-muted)">
            {t('hud_loading', { defaultValue: 'Loading…' })}
          </p>
        ) : null}
        {workshop && workshop.length === 0 ? (
          <p className="text-xs text-(--app-text-muted)">
            {t('hud_workshop_empty', { defaultValue: 'No workshop HUDs to show right now.' })}
          </p>
        ) : null}
        {(workshop ?? []).map((h) => (
          <HudItem
            key={h.id}
            label={h.title}
            detail={
              h.author?.name
                ? t('hud_by', { defaultValue: 'by {{name}}', name: h.author.name })
                : undefined
            }
            sel={{ kind: 'cloud', id: h.id }}
            current={current}
          />
        ))}
      </Section>

      {exportOpen ? (
        exportReady ? (
          <Suspense fallback={null}>
            <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
          </Suspense>
        ) : (
          <p role="status" className="text-xs text-(--app-text-muted)">
            {t('hud_export_preparing', { defaultValue: 'Preparing the export…' })}
          </p>
        )
      ) : null}
    </div>
  );
}
