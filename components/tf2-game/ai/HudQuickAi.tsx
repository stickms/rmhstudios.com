/**
 * Quick AI for the HUD, in game: the pause menu's HUD view (`variant="pause"`) and over the in-game
 * HUD editor (`variant="editor"`, a small dock). One line — "bigger health, centre it", "minimal
 * competitive HUD" — or a chip picked for your class, weapon and screen (a Medic: "Bigger Über meter",
 * a Sniper: "Charge meter by the crosshair", a phone: "Keep clear of touch buttons").
 *
 * The flow, the same for the AI and the local presets:
 *  1. the HUD in use is put in the editor's store first (`ensureEditorHolds`): the TF2 Default becomes
 *     a new draft, someone else's workshop HUD a copy — never their cloud HUD;
 *  2. the AI (`POST /api/tf2-hud/ai`, select → edit; the chip's files skip "select") or a preset
 *     (lib/tf2-game/client/ai/hud-presets.ts) proposes key-level changes, which `applyChanges` dry-runs
 *     against the real files — what is shown is what would change;
 *  3. a compact diff and a live preview (the game's own renderer, drawn once) are shown;
 *  4. "Apply & test in game" is ONE step in the editor's history, saved to the draft and drawn by the
 *     game at once; "Undo" steps that history back (while nothing else has changed since); "Open in
 *     editor" goes deeper.
 * Signed out, the chips are the presets (no AI) and asking explains that the AI needs an account.
 * Nothing the model says is run: changes are data, checked by ai-core's validators.
 */
'use client';

import { Check, PencilRuler, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { Btn } from '@/components/tf2-hud/ui';
import {
  applyChanges,
  excerptForAi,
  HUD_AI_LIMITS,
  offeredHudPaths,
  type AppliedChange,
  type HudChange,
} from '@/lib/tf2-hud/ai-core';
import { api, ApiError } from '@/lib/tf2-hud/api';
import { writeFile, textContent } from '@/lib/tf2-hud/project/model';
import type { HudMeta, Overlay } from '@/lib/tf2-hud/project/types';
import { flushLocalDraft, useEditor } from '@/lib/tf2-hud/store';
import { PRESET_FILES, presetChanges, type HudPresetId } from '@/lib/tf2-game/client/ai/hud-presets';
import { hudQuickContext } from '@/lib/tf2-game/client/ai/match-context';
import {
  hudSuggestions,
  localPresetSuggestions,
  type HudSuggestion,
  type HudSuggestionId,
} from '@/lib/tf2-game/client/ai/suggestions';
import { selectionKey, type HudSelection } from '@/lib/tf2-game/client/custom-hud/selection';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import { cn } from '@/lib/utils';
import { ensureEditorHolds } from '../custom-hud/editor-session';
import { useHudChoice } from '../custom-hud/hud-choice';
import { useHudContext, useHudState } from '../use-hud';
import HudAiPreview from './HudAiPreview';
import {
  ASK_DEBOUNCE_MS,
  ChipRow,
  LiveRegion,
  Note,
  Progress,
  QuickBarFrame,
  QuickPrompt,
  type ChipItem,
} from './QuickBar';

type Step = 'prepare' | 'select' | 'edit' | 'apply';

interface Proposal {
  /** What was asked (the chip's words or the player's). */
  label: string;
  source: 'ai' | 'preset';
  summary: string;
  changes: HudChange[];
  applied: AppliedChange[];
  /** Suggested changes that could not be used (malformed, unknown key, would break the file). */
  skipped: number;
  /** The proposed project, for the preview. */
  overlay: Overlay;
  meta: HudMeta;
  draftId: string;
}

type Notice =
  | { kind: 'unavailable'; preset?: HudPresetId }
  | { kind: 'no-files' }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string };

const subscribeNoop = () => () => {};

export function suggestionLabel(t: TFunction, id: HudSuggestionId): string {
  switch (id) {
    case 'medic-uber':
      return t('ai_hud_chip_uber', { defaultValue: 'Bigger Über meter' });
    case 'sniper-charge':
      return t('ai_hud_chip_sniper', { defaultValue: 'Charge meter by the crosshair' });
    case 'bow-charge':
      return t('ai_hud_chip_bow', { defaultValue: 'Bow charge by the crosshair' });
    case 'demo-stickies':
      return t('ai_hud_chip_stickies', { defaultValue: 'Sticky count by the crosshair' });
    case 'spy-cloak':
      return t('ai_hud_chip_cloak', { defaultValue: 'Cloak meter by the crosshair' });
    case 'engineer-metal':
      return t('ai_hud_chip_metal', { defaultValue: 'Bigger metal count' });
    case 'touch-clear':
      return t('ai_hud_chip_touch', { defaultValue: 'Keep clear of touch buttons' });
    case 'ultrawide':
      return t('ai_hud_chip_ultrawide', { defaultValue: 'Pull the HUD in from the edges' });
    case 'bigger-health':
      return t('ai_hud_chip_health', { defaultValue: 'Bigger health' });
    case 'bigger-ammo':
      return t('ai_hud_chip_ammo', { defaultValue: 'Bigger ammo' });
    case 'ammo-crosshair':
      return t('ai_hud_chip_ammo_centre', { defaultValue: 'Ammo next to the crosshair' });
    case 'minimal':
      return t('ai_hud_chip_minimal', { defaultValue: 'Minimal competitive HUD' });
  }
}

/** "PlayerStatusHealthValue › font": the key path without the file's own root block. */
const keyLabel = (c: { path: string[] }): string => c.path.slice(1).join(' › ') || c.path[0];

export default function HudQuickAi({
  variant = 'pause',
  onOpenEditor,
}: {
  variant?: 'pause' | 'editor';
  /** The pause view's "Edit HUD" (absent over the editor, which is already open). */
  onOpenEditor?: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const { screen, settings } = useHudContext();
  const state = useHudState();
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const selection = useHudChoice((s) => s.selection);
  const touchFirst = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  const touch = settings.touch.mode === 'on' || (settings.touch.mode === 'auto' && touchFirst);

  const [text, setText] = useState('');
  const [step, setStep] = useState<Step | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** The editor overlay right after our last apply, and what it said; Undo works while it is current. */
  const [applied, setApplied] = useState<{ overlay: Overlay; count: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [signIn, setSignIn] = useState(false);
  const [open, setOpen] = useState(variant === 'pause');
  const abortRef = useRef<AbortController | null>(null);
  const lastAsk = useRef(0);
  const editorOverlay = useEditor((s) => s.overlay);

  const cls = state.local?.cls ?? 0;
  const weapon = state.local?.activeWeapon?.name ?? null;
  const input = useMemo(
    () => ({ cls, weapon, touch, aspect: screen.w / Math.max(1, screen.h) }),
    [cls, weapon, touch, screen.w, screen.h],
  );
  const suggestions = useMemo(
    () => (signedIn ? hudSuggestions(input) : localPresetSuggestions(input)),
    [signedIn, input],
  );

  // A request in flight is cancelled when the bar goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const say = (s: string) => setAnnounce(s);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep(null);
    say(t('ai_cancelled', { defaultValue: 'Cancelled.' }));
  }, [t]);

  /** Put the game's HUD in the editor (a draft or a copy); false when it could not be loaded. */
  const prepare = async (): Promise<boolean> => {
    const ok = await ensureEditorHolds(
      selection,
      t('editor_copy_suffix', { defaultValue: '(copy)' }),
    );
    if (!ok) {
      setNotice({
        kind: 'error',
        text: t('ai_hud_load_failed', { defaultValue: 'The HUD in use could not be opened for editing.' }),
      });
    }
    return ok;
  };

  const readFiles = async (paths: readonly string[]): Promise<Record<string, string>> => {
    const store = useEditor.getState();
    const known = paths.filter((p) => store.hasFile(p));
    await store.ensureFiles(known);
    const out: Record<string, string> = {};
    for (const p of known) {
      const txt = useEditor.getState().readText(p);
      if (txt !== undefined) out[p] = txt;
    }
    return out;
  };

  /** Dry-run `changes` and show them with a preview. */
  const propose = (
    label: string,
    source: Proposal['source'],
    summary: string,
    current: Record<string, string>,
    changes: HudChange[],
    malformed: number,
  ) => {
    const dry = applyChanges(current, changes);
    const store = useEditor.getState();
    let overlay: Overlay = store.overlay;
    for (const [path, txt] of Object.entries(dry.files))
      overlay = writeFile(overlay, store.baseIndex, path, textContent(txt));
    setProposal({
      label,
      source,
      summary,
      changes,
      applied: dry.applied,
      skipped: dry.rejected.length + malformed,
      overlay,
      meta: store.meta,
      draftId: store.draftId,
    });
    say(
      dry.applied.length
        ? t('ai_hud_ready', {
            defaultValue: '{{count}} changes ready to apply. {{summary}}',
            count: dry.applied.length,
            summary,
          })
        : t('ai_hud_nothing', { defaultValue: 'Nothing in the HUD needs to change. {{summary}}', summary }),
    );
  };

  const begin = (): AbortController | null => {
    const now = Date.now();
    if (step || now - lastAsk.current < ASK_DEBOUNCE_MS) return null;
    lastAsk.current = now;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setNotice(null);
    setProposal(null);
    return ctl;
  };

  const runPreset = async (id: HudPresetId, label: string) => {
    const ctl = begin();
    if (!ctl) return;
    setStep('prepare');
    try {
      if (!(await prepare()) || ctl.signal.aborted) return;
      const current = await readFiles(PRESET_FILES[id]);
      if (ctl.signal.aborted) return;
      propose(
        label,
        'preset',
        t('ai_hud_preset_summary', { defaultValue: 'A quick preset, made without the AI.' }),
        current,
        presetChanges(id, current),
        0,
      );
    } finally {
      if (abortRef.current === ctl) setStep(null);
    }
  };

  const ask = async (raw: string, suggestion?: HudSuggestion) => {
    const message = raw.trim().slice(0, HUD_AI_LIMITS.message);
    if (!message) return;
    if (!signedIn) {
      setSignIn(true);
      return;
    }
    const ctl = begin();
    if (!ctl) return;
    const { signal } = ctl;
    setStep('prepare');
    try {
      if (!(await prepare()) || signal.aborted) return;
      const store = useEditor.getState();
      const known = (suggestion?.files ?? []).filter((f) => store.hasFile(f));
      let files: string[] = known;
      if (!known.length) {
        setStep('select');
        const picked = await api.aiSelect(
          { message, paths: offeredHudPaths(store.paths()), history: [] },
          signal,
        );
        if ('unavailable' in picked) {
          setNotice({ kind: 'unavailable', preset: suggestion?.preset });
          say(t('ai_unavailable_short', { defaultValue: 'The AI is not available right now.' }));
          return;
        }
        files = picked.files;
      }
      if (!files.length) {
        setNotice({ kind: 'no-files' });
        return;
      }
      setStep('edit');
      const current = await readFiles(files);
      const shown = Object.entries(current).map(([path, txt]) => ({ path, text: excerptForAi(path, txt) }));
      if (!shown.length || signal.aborted) return;
      const res = await api.aiEdit(
        {
          message,
          files: shown,
          history: [],
          context: hudQuickContext({ cls, weapon, screen, touch }),
        },
        signal,
      );
      if (signal.aborted) return;
      if ('unavailable' in res) {
        setNotice({ kind: 'unavailable', preset: suggestion?.preset });
        say(t('ai_unavailable_short', { defaultValue: 'The AI is not available right now.' }));
        return;
      }
      propose(message, 'ai', res.summary, current, res.changes, res.malformed);
      setText('');
    } catch (e) {
      if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) setSignIn(true);
      const msg =
        status === 402
          ? t('ai_limit', { defaultValue: "You have used this month's AI allowance." })
          : status === 429
            ? t('ai_rate', { defaultValue: 'Too many requests. Wait a moment and try again.' })
            : t('ai_error', { defaultValue: 'Something went wrong asking the AI. Nothing was changed.' });
      setNotice({ kind: 'error', text: msg });
      say(msg);
    } finally {
      if (abortRef.current === ctl) {
        abortRef.current = null;
        setStep(null);
      }
    }
  };

  /** Save the editor's project to its draft and have the game draw it (or the TF2 Default when untouched). */
  const pushToGame = async (): Promise<boolean> => {
    const saved = await flushLocalDraft();
    const ed = useEditor.getState();
    const sel: HudSelection = saved ? { kind: 'draft', id: ed.draftId } : { kind: 'default' };
    const choice = useHudChoice.getState();
    choice.setEditorKey(selectionKey(sel));
    return sel.kind === 'draft'
      ? choice.apply({ selection: sel, meta: ed.meta, overlay: ed.overlay })
      : choice.choose(sel);
  };

  const apply = async () => {
    const pr = proposal;
    if (!pr || step) return;
    setStep('apply');
    try {
      const store = useEditor.getState();
      const files: Record<string, string> = {};
      for (const c of pr.changes) {
        const txt = store.readText(c.file);
        if (txt !== undefined) files[c.file] = txt;
      }
      // Re-run on the current text, in case the HUD changed since the proposal.
      const done = applyChanges(files, pr.changes);
      if (!Object.keys(done.files).length) {
        setProposal(null);
        setNotice({ kind: 'info', text: t('ai_hud_already', { defaultValue: 'Those changes are already in the HUD.' }) });
        return;
      }
      store.applyBatch(`AI: ${pr.label.slice(0, 60)}`, done.files);
      const after = useEditor.getState().overlay;
      await pushToGame();
      setApplied({ overlay: after, count: done.applied.length });
      setProposal(null);
      const msg = t('ai_hud_applied', {
        defaultValue: 'Applied {{count}} changes. Playing with {{name}}.',
        count: done.applied.length,
        name: useEditor.getState().meta.name,
      });
      setNotice({ kind: 'info', text: msg });
      say(msg);
    } finally {
      setStep(null);
    }
  };

  const canUndo = !!applied && editorOverlay === applied.overlay;
  const undo = async () => {
    if (!canUndo || step) return;
    setStep('apply');
    try {
      useEditor.getState().undo();
      await pushToGame();
      setApplied(null);
      const msg = t('ai_hud_undone', { defaultValue: 'Undone: the HUD is back as it was.' });
      setNotice({ kind: 'info', text: msg });
      say(msg);
    } finally {
      setStep(null);
    }
  };

  const chips: ChipItem[] = suggestions.map((s) => {
    const label = suggestionLabel(t, s.id);
    return signedIn
      ? { key: s.id, label, onPick: () => void ask(label, s) }
      : {
          key: s.id,
          label,
          hint: t('ai_preset_hint', { defaultValue: 'quick preset, no AI' }),
          onPick: () => s.preset && void runPreset(s.preset, label),
        };
  });

  const progress =
    step === 'prepare'
      ? t('ai_hud_step_prepare', { defaultValue: 'Opening the HUD…' })
      : step === 'select'
        ? t('ai_hud_step_select', { defaultValue: 'Finding the right files…' })
        : step === 'edit'
          ? t('ai_hud_step_edit', { defaultValue: 'Working out the changes…' })
          : step === 'apply'
            ? t('ai_hud_step_apply', { defaultValue: 'Applying to the game…' })
            : null;

  const busy = step !== null && step !== 'apply';
  const body = (
    <>
      <QuickPrompt
        value={text}
        onChange={setText}
        onSubmit={() => void ask(text)}
        onCancel={cancel}
        busy={busy}
        locked={!signedIn}
        maxLength={HUD_AI_LIMITS.message}
        label={t('ai_hud_prompt_label', { defaultValue: 'Describe a change to your HUD' })}
        placeholder={t('ai_hud_placeholder', { defaultValue: 'Bigger health, centre it…' })}
      />
      <ChipRow
        chips={chips}
        disabled={step !== null}
        label={t('ai_suggestions', { defaultValue: 'Suggestions' })}
      />
      {!signedIn ? (
        <Note>
          {t('ai_hud_signed_out', {
            defaultValue: 'Sign in to ask the AI. The suggestions above are quick presets that work without it.',
          })}
        </Note>
      ) : null}
      {progress ? <Progress>{progress}</Progress> : null}
      {notice?.kind === 'unavailable' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Note tone="warning">
            {t('ai_hud_unavailable', {
              defaultValue: 'The AI is not available right now. Nothing was changed.',
            })}
          </Note>
          {notice.preset ? (
            <Btn
              size="xs"
              data-menu-item
              onClick={() => notice.preset && void runPreset(notice.preset, proposalLabelFor(notice.preset))}
            >
              {t('ai_hud_use_preset', { defaultValue: 'Use the quick preset instead' })}
            </Btn>
          ) : null}
        </div>
      ) : notice?.kind === 'no-files' ? (
        <Note tone="warning">
          {t('ai_hud_no_files', {
            defaultValue: 'I could not tell which part of the HUD that touches. Try naming it: health, ammo, the Über meter.',
          })}
        </Note>
      ) : notice?.kind === 'error' ? (
        <Note tone="danger">{notice.text}</Note>
      ) : notice?.kind === 'info' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Note tone="success" className="flex items-center gap-1">
            <Check className="size-4" aria-hidden />
            {notice.text}
          </Note>
          {canUndo ? (
            <Btn size="xs" variant="ghost" icon={Undo2} data-menu-item onClick={() => void undo()}>
              {t('ai_undo', { defaultValue: 'Undo' })}
            </Btn>
          ) : applied ? (
            <Note>{t('ai_hud_undo_gone', { defaultValue: 'Changed since: use Undo in the editor.' })}</Note>
          ) : null}
          {onOpenEditor ? (
            <Btn size="xs" variant="ghost" icon={PencilRuler} data-menu-item onClick={onOpenEditor}>
              {t('ai_open_editor', { defaultValue: 'Open in editor' })}
            </Btn>
          ) : null}
        </div>
      ) : null}
      {proposal ? (
        <ProposalCard
          proposal={proposal}
          busy={step !== null}
          onApply={() => void apply()}
          onDiscard={() => {
            setProposal(null);
            say(t('ai_discarded', { defaultValue: 'Not applied.' }));
          }}
          onOpenEditor={onOpenEditor}
        />
      ) : null}
      <LiveRegion text={announce} />
      {signIn ? (
        <SignInRequiredDialog
          open
          onClose={() => setSignIn(false)}
          feature={t('ai_feature_hud', { defaultValue: 'Edit your HUD with AI' })}
        />
      ) : null}
    </>
  );

  function proposalLabelFor(id: HudPresetId): string {
    const s = suggestions.find((x) => x.preset === id);
    return s ? suggestionLabel(t, s.id) : id;
  }

  if (variant === 'editor') {
    // Over the editor: a small dock in the corner that opens into the bar (the editor keeps the screen).
    return (
      <div
        className={cn(
          'absolute bottom-[calc(var(--safe-bottom,0px)+0.75rem)] end-[calc(var(--safe-right,0px)+0.75rem)] z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2',
          open && 'w-[26rem]',
        )}
      >
        {open ? (
          <QuickBarFrame
            title={t('ai_hud_title', { defaultValue: 'Quick AI' })}
            className="max-h-[70dvh] w-full overflow-y-auto bg-(--tf2-panel)"
          >
            {body}
          </QuickBarFrame>
        ) : null}
        <Btn
          size="sm"
          variant={open ? 'secondary' : 'primary'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open
            ? t('ai_hud_hide', { defaultValue: 'Hide quick AI' })
            : t('ai_hud_show', { defaultValue: 'Quick AI' })}
        </Btn>
      </div>
    );
  }
  return <QuickBarFrame title={t('ai_hud_title', { defaultValue: 'Quick AI' })}>{body}</QuickBarFrame>;
}

/** The proposal: summary, a compact diff (the first few keys, the rest behind a toggle) and a live preview. */
function ProposalCard({
  proposal,
  busy,
  onApply,
  onDiscard,
  onOpenEditor,
}: {
  proposal: Proposal;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onOpenEditor?: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const [all, setAll] = useState(false);
  const { applied } = proposal;
  const files = new Set(applied.map((c) => c.file)).size;
  const shown = all ? applied : applied.slice(0, 4);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) p-2">
      {proposal.summary ? <p className="text-xs break-words">{proposal.summary}</p> : null}
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="flex min-w-0 flex-col gap-1">
          {applied.length ? (
            <>
              <p className="text-xs font-semibold text-(--app-text-muted)">
                {t('ai_hud_diff_summary', {
                  defaultValue: '{{count}} changes in {{files}} files',
                  count: applied.length,
                  files,
                })}
              </p>
              <ul className="flex flex-col gap-0.5 text-[11px] pointer-coarse:text-xs">
                {shown.map((c, i) => (
                  <li key={i} className="min-w-0">
                    <span className="block truncate font-semibold" title={`${c.file}: ${keyLabel(c)}`}>
                      {keyLabel(c)}
                    </span>
                    <span className="block truncate text-(--app-text-muted)">
                      {c.before ?? t('ai_unset', { defaultValue: '(not set)' })}
                      <span aria-hidden> → </span>
                      <span className="sr-only"> {t('ai_to', { defaultValue: 'to' })} </span>
                      {c.after ?? t('ai_removed', { defaultValue: '(removed)' })}
                    </span>
                  </li>
                ))}
              </ul>
              {applied.length > 4 ? (
                <button
                  type="button"
                  data-menu-item
                  aria-expanded={all}
                  className="self-start text-xs text-(--app-accent-text) underline pointer-coarse:min-h-11"
                  onClick={() => setAll((a) => !a)}
                >
                  {all
                    ? t('ai_hud_fewer', { defaultValue: 'Show fewer' })
                    : t('ai_hud_more', { defaultValue: 'Show all {{count}}', count: applied.length })}
                </button>
              ) : null}
            </>
          ) : (
            <Note>{t('ai_hud_nothing_short', { defaultValue: 'Nothing in the HUD needs to change.' })}</Note>
          )}
          {proposal.skipped ? (
            <Note tone="warning">
              {t('ai_hud_skipped', {
                defaultValue: '{{count}} suggested changes could not be used and were skipped.',
                count: proposal.skipped,
              })}
            </Note>
          ) : null}
        </div>
        {applied.length ? <HudAiPreview overlay={proposal.overlay} meta={proposal.meta} draftId={proposal.draftId} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {applied.length ? (
          <Btn size="sm" variant="primary" icon={Check} data-menu-item disabled={busy} onClick={onApply}>
            {t('ai_hud_apply', { defaultValue: 'Apply & test in game' })}
          </Btn>
        ) : null}
        <Btn size="sm" variant="ghost" data-menu-item disabled={busy} onClick={onDiscard}>
          {t('ai_discard', { defaultValue: 'Discard' })}
        </Btn>
        {onOpenEditor ? (
          <Btn size="sm" variant="ghost" icon={PencilRuler} data-menu-item onClick={onOpenEditor}>
            {t('ai_open_editor', { defaultValue: 'Open in editor' })}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}
