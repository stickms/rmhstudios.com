'use client';

/**
 * The chart editor shell: layout, the keyboard bus, and the autosave loop.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §3.1, §12.4, §13, §14.
 *
 * Phases 1–8 of §16: the document loads, the timeline draws it, edits go through
 * the command stack, four difficulties stay nested, the work survives a closed
 * tab, the real `GameEngine` plays the edited chart from the playhead (§10), the
 * generator can be re-run at four scopes with a preview (§8), the analyser's
 * waveform and rejected onset candidates are drawn and clickable (§6), the
 * linter runs off the edit path and gates publish (§9), and timing/SV markers
 * are editable (§4.2).
 *
 * What remains is recorded in `docs/_handoff/editor-phase678-requests.md`: the
 * engine does not yet READ the SV markers this shell can author, and the miss
 * heatmap (§4.4b) waits on `O1`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Keyboard, Loader2 } from 'lucide-react';
import { DIFFICULTIES } from '@/lib/slice-it/constants';
import { loadArtefacts } from '@/lib/slice-it/editor/artefacts';
import { loadEditorDocument, saveChart } from '@/lib/slice-it/editor/api-client';
import { retypeNotes } from '@/lib/slice-it/editor/commands';
import { nestedDelete, nestedMove } from '@/lib/slice-it/editor/nesting';
import { meterAt, snapStepSeconds } from '@/lib/slice-it/editor/snap';
import { startEditorPlaytest, stopEditorPlaytest } from '@/lib/slice-it/editor/playtest';
import { editorState, useEditorStore } from '@/lib/slice-it/editor/store';
import { SNAP_DIVISIONS, toSlices } from '@/lib/slice-it/editor/types';
import type { Difficulty, EditorNote, SliceType, SnapDivision } from '@/lib/slice-it/editor/types';
import { useLintRunner } from '@/lib/slice-it/editor/useLint';
import { DifficultyTabs } from './DifficultyTabs';
import { GeneratePanel } from './GeneratePanel';
import { LintPanel } from './LintPanel';
import { NoteInspector } from './NoteInspector';
import { TimingPanel } from './TimingPanel';
import { ShortcutSheet } from './ShortcutSheet';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';

/** Autosave cadence. See the note on the effect below. */
const AUTOSAVE_MS = 20_000;

/** Never swallow keys destined for a text field (§13). */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function ChartEditor({ songId }: { songId: string }) {
  const { t } = useTranslation('r-slice-it');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [announcement, setAnnounce] = useState('');
  const savingRef = useRef(false);

  const loadState = useEditorStore((s) => s.loadState);
  const error = useEditorStore((s) => s.error);
  const song = useEditorStore((s) => s.song);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  // The timing panel is the timing TOOL's inspector, not a permanent card: a
  // rail with four cards in it pushes the generate panel off the bottom on a
  // laptop, and timing is edited in bursts and then left alone for hours.
  const tool = useEditorStore((s) => s.tool);

  /* The linter runs off the edit path in a worker (§9). Mounted here, once, so
   * the result is available to the timeline's note rings and the tab badges
   * whether or not the lint panel itself is on screen. */
  useLintRunner();

  /* ── Load ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    const state = editorState();
    state.reset();
    useEditorStore.setState({ loadState: 'loading' });
    loadEditorDocument(songId)
      .then((payload) => {
        if (!cancelled) editorState().load(payload);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        editorState().fail(cause instanceof Error ? cause.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  /* ── Analysis artefacts (§6) ──────────────────────────────────────────── */
  //
  // Fetched once the document is open, not before: the waveform is an aid, not
  // a prerequisite, so blocking the editor on a few hundred KB of envelope
  // would trade the thing that makes it feel instant for the thing that makes
  // it feel informed. Failure is silent by design — a song analysed before
  // artefacts were persisted simply has no waveform and no ghosts.
  useEffect(() => {
    if (loadState !== 'ready') return;
    let cancelled = false;
    const state = editorState();
    if (!state.song) return;
    const densest =
      state.charts.expert.notes.length > 0 ? state.charts.expert : state.charts[state.active];
    void loadArtefacts({
      songId: state.song.id,
      duration: state.song.duration,
      bpm: state.song.bpm,
      fallbackSlices: toSlices(densest.notes),
    })
      .then((loaded) => {
        if (!cancelled) editorState().setArtefacts(loaded);
      })
      .catch(() => {
        /* No waveform, no ghosts. The editor works without them. */
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, songId]);

  /* ── Saving ───────────────────────────────────────────────────────────── */
  /**
   * Push every dirty difficulty.
   *
   * One PATCH per difficulty rather than one for the document: `Chart` is a row
   * per difficulty (§1.1), so a combined endpoint would be four writes behind one
   * request and a partial failure would have no honest status to return.
   */
  const save = useCallback(
    async (kind: 'autosave' | 'manual', options?: { keepalive?: boolean }) => {
      const state = editorState();
      if (savingRef.current) return;
      const revision = state.revision;
      if (revision === state.lastSavedRevision) return;

      const pending = DIFFICULTIES.filter(
        (difficulty) => state.charts[difficulty].dirty && state.chartIds[difficulty],
      );
      if (pending.length === 0) {
        state.markSaved(revision, {});
        return;
      }

      // The exact arrays being sent, so `markSaved` can tell an edit that landed
      // mid-flight from one that was included in the write.
      const sent: Partial<Record<(typeof pending)[number], readonly EditorNote[]>> = {};
      for (const difficulty of pending) sent[difficulty] = state.charts[difficulty].notes;

      savingRef.current = true;
      state.setSaving(true);
      try {
        await Promise.all(
          pending.map((difficulty) =>
            saveChart({
              chartId: state.chartIds[difficulty] as string,
              notes: toSlices(state.charts[difficulty].notes),
              // Every row carries the same timing map (§4.2): it is a property
              // of the song, and a tier saved without it would describe a grid
              // the other three no longer use.
              timingPoints: state.timingPoints,
              svPoints: state.svPoints,
              kind,
              keepalive: options?.keepalive,
            }),
          ),
        );
        editorState().markSaved(revision, sent);
        if (kind === 'manual') {
          toast.success(t('editor-save-ok', { defaultValue: 'Chart saved' }));
        }
      } catch (cause: unknown) {
        editorState().setSaving(false);
        toast.error(
          cause instanceof Error
            ? cause.message
            : t('editor-save-failed', { defaultValue: 'Could not save the chart' }),
        );
      } finally {
        savingRef.current = false;
      }
    },
    [t],
  );

  /**
   * Autosave on a timer, not on every change.
   *
   * Saving per mutation means a PATCH per note placement — a 200-note editing
   * session is 200 round trips, and a dropped one mid-drag leaves the server
   * holding half a gesture. The timer batches to a consistent document.
   */
  useEffect(() => {
    if (loadState !== 'ready') return;
    const timer = setInterval(() => void save('autosave'), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [loadState, save]);

  /* And on the way out, because a closed tab is the common case, not the rare
   * one. `keepalive` survives the unload; a normal fetch is cancelled with the
   * document. (`sendBeacon` cannot send a PATCH, and a POST-only autosave
   * endpoint would be a second write path with a second authorisation check.) */
  useEffect(() => {
    if (loadState !== 'ready') return;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const state = editorState();
      if (state.revision === state.lastSavedRevision) return;
      void save('autosave', { keepalive: true });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [loadState, save]);

  /* ── Keyboard bus ─────────────────────────────────────────────────────── */
  //
  // One keydown listener on the window with a command map, not per-component
  // handlers — a shortcut that works only when the timeline has focus is a
  // shortcut that appears broken (§13).
  useEffect(() => {
    if (loadState !== 'ready') return;

    const announce = (message: string) => setAnnounce(message);

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const state = editorState();
      const chart = state.charts[state.active];
      const selection = chart.notes.filter((note) => note.selected);
      const mod = event.ctrlKey || event.metaKey;
      const step = snapStepSeconds(state.playhead, state.snap, state.timingPoints);

      /* Playtest owns the keyboard while it runs (§10, §13). Space starts it from
       * the playhead — never from the start of the song — and Ctrl+Space loops the
       * selection; both stop it. Everything else is forwarded to the engine by
       * `PlaytestControls`, so an editing shortcut cannot fire mid-run and leave
       * the author playing a chart that is no longer the one on screen. */
      if (event.code === 'Space') {
        event.preventDefault();
        if (state.playtesting) {
          stopEditorPlaytest();
          announce(t('editor-announce-playtest-stopped', { defaultValue: 'Playtest stopped' }));
        } else {
          void startEditorPlaytest({ loop: mod });
        }
        return;
      }
      if (state.playtesting) {
        if (event.key === 'Escape') {
          event.preventDefault();
          stopEditorPlaytest();
        }
        return;
      }

      const move = (deltaTime: number, deltaLane: number) => {
        if (selection.length === 0) return false;
        state.apply(
          nestedMove(
            state.nestingMode,
            state.charts,
            state.active,
            selection,
            deltaTime,
            deltaLane,
            state.keys,
          ),
        );
        announce(
          t('editor-announce-moved', {
            defaultValue: 'Moved {{count}} notes',
            count: selection.length,
          }),
        );
        return true;
      };

      switch (event.key) {
        case '?':
          event.preventDefault();
          setShowShortcuts((open) => !open);
          return;
        case 'Escape':
          state.clearSelection();
          return;
        case 'Delete':
        case 'Backspace': {
          if (selection.length === 0) return;
          event.preventDefault();
          state.apply(nestedDelete(state.nestingMode, state.charts, state.active, selection));
          announce(
            t('editor-announce-deleted', {
              defaultValue: 'Deleted {{count}} notes',
              count: selection.length,
            }),
          );
          return;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          const sign = event.key === 'ArrowUp' ? 1 : -1;
          if (mod) {
            state.setZoom(state.zoom * (sign > 0 ? 1.25 : 0.8));
            return;
          }
          // Alt is the unsnapped nudge (§5.2) — 1 ms, for fixing a note the grid
          // disagrees with.
          if (event.altKey) {
            move(sign * 0.001, 0);
            return;
          }
          if (event.shiftKey) {
            move(sign * step, 0);
            return;
          }
          state.setPlayhead(state.playhead + sign * step);
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (selection.length === 0) return;
          event.preventDefault();
          move(0, event.key === 'ArrowRight' ? 1 : -1);
          return;
        }
        case 'PageUp':
        case 'PageDown': {
          event.preventDefault();
          const meter = meterAt(state.playhead, state.timingPoints);
          const bar = snapStepSeconds(state.playhead, 1, state.timingPoints) * meter;
          state.setPlayhead(state.playhead + (event.key === 'PageUp' ? bar : -bar));
          return;
        }
        case 'Home':
          event.preventDefault();
          state.setPlayhead(0);
          return;
        case 'End':
          event.preventDefault();
          state.setPlayhead(state.song?.duration ?? 0);
          return;
        case '[':
        case ']': {
          event.preventDefault();
          const index = SNAP_DIVISIONS.indexOf(state.snap);
          const next = event.key === ']' ? index + 1 : index - 1;
          const clamped = Math.max(0, Math.min(SNAP_DIVISIONS.length - 1, next));
          state.setSnap(SNAP_DIVISIONS[clamped] as SnapDivision);
          return;
        }
        case 'Tab': {
          event.preventDefault();
          const order = DIFFICULTIES as readonly Difficulty[];
          const index = order.indexOf(state.active);
          state.setActive(order[(index + (event.shiftKey ? order.length - 1 : 1)) % order.length]);
          return;
        }
        default:
          break;
      }

      if (mod) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          state.redo();
          return;
        }
        if (key === 'a') {
          event.preventDefault();
          state.selectAll();
          return;
        }
        if (key === 's') {
          event.preventDefault();
          void save('manual');
          return;
        }
        // TODO(phase 2 extension — §5.2): Ctrl+C/X/V, Ctrl+Shift+V (paste
        // mirrored), Ctrl+D (duplicate a measure on), Ctrl+I / Ctrl+Shift+I
        // (insert / remove time). They are clipboard operations on a selection,
        // which needs a clipboard model this shell does not have yet.
        return;
      }

      if (event.key === 's' || event.key === 'S') {
        state.setSnapEnabled(!state.snapEnabled);
        return;
      }

      const typeIndex = Number(event.key);
      if (Number.isInteger(typeIndex) && typeIndex >= 1 && typeIndex <= 7) {
        const types: SliceType[] = [
          'STANDARD',
          'MOVING',
          'LONG',
          'SILENT',
          'SPEED',
          'BOMB',
          'SWITCH',
        ];
        const type = types[typeIndex - 1];
        state.setPlaceType(type);
        if (selection.length > 0) state.apply(retypeNotes(state.active, selection, type));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadState, save, t]);

  /* ── Render ───────────────────────────────────────────────────────────── */
  if (loadState === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm opacity-80">
          {error ?? t('editor-load-failed', { defaultValue: 'Could not open this chart.' })}
        </p>
        <Link to="/slice-it" className="neumorphic-sm px-4 py-2 text-sm">
          {t('editor-back', { defaultValue: 'Back to Slice It' })}
        </Link>
      </div>
    );
  }

  if (loadState !== 'ready' || !song) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 p-8">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm opacity-80">
          {t('editor-loading', { defaultValue: 'Opening the chart…' })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col gap-3 overflow-hidden p-3">
      <header className="neumorphic flex flex-wrap items-center gap-3 px-4 py-3">
        <Link
          to="/slice-it"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center"
          aria-label={t('editor-back', { defaultValue: 'Back to Slice It' })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{song.title}</h1>
          <p className="truncate text-xs opacity-70">{song.artist}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs opacity-70">
            {lastSavedAt
              ? t('editor-last-saved', {
                  defaultValue: 'Saved {{time}}',
                  time: new Date(lastSavedAt).toLocaleTimeString(),
                })
              : t('editor-not-saved', { defaultValue: 'Not saved yet' })}
          </span>
          <button
            type="button"
            className="neumorphic-sm flex h-9 w-9 items-center justify-center"
            onClick={() => setShowShortcuts(true)}
            aria-label={t('editor-shortcuts-open', { defaultValue: 'Keyboard shortcuts' })}
          >
            <Keyboard className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <DifficultyTabs />

      <div className="flex min-h-0 flex-1 gap-3">
        {/*
          TODO(phase 6 — §6): the waveform + onset-ghost strips are a third
          column to the left of the timeline. They need the analyser's rejected
          onset candidates persisted, which is a change to the beatmap pipeline.
        */}
        <div className="min-w-0 flex-1">
          <Timeline />
        </div>
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto lg:flex">
          <NoteInspector />
          <LintPanel onBeforePublish={() => save('manual')} />
          {tool === 'timing' && <TimingPanel />}
          <GeneratePanel />
        </aside>
      </div>

      <Toolbar onSave={() => void save('manual')} />

      {/*
        TODO(phase 2 extension — §12.4): the whole-song density minimap strip
        sits below the toolbar.
      */}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ShortcutSheet open={showShortcuts} onOpenChange={setShowShortcuts} />
    </div>
  );
}
