'use client';

/**
 * The AUTO panel — regenerate at four scopes, preview before apply.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §8.3.
 *
 * The panel is deliberately boring: four radios, one slider, two buttons. The
 * interesting decisions are all in `lib/slice-it/editor/generate.ts` — this is
 * the surface that has to make the default ("untouched notes only") the obvious
 * choice and make the destructive scope look destructive.
 *
 * **Nothing here commits.** Preview builds a plan and hands it to the store; the
 * timeline draws it in green and struck-through; Apply turns it into one undo
 * step. A regenerate that silently ate an author's work once is a feature they
 * will never press again.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dices, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { loadArtefacts, type EditorArtefacts } from '@/lib/slice-it/editor/artefacts';
import {
  buildGeneratePlan,
  defaultGenerateOptions,
  planCommand,
  scopeDiscardsAuthorWork,
  type GenerateOptions,
  type GenerateScope,
} from '@/lib/slice-it/editor/generate';
import { editorState, useEditorStore } from '@/lib/slice-it/editor/store';
import { toSlices } from '@/lib/slice-it/editor/types';
import type { Difficulty } from '@/lib/slice-it/editor/types';
import { formatTime } from './Timeline';

type ScopeKind = GenerateScope['kind'];

/** How far either side of the playhead "this section" reaches with no selection. */
const DEFAULT_RANGE_SECONDS = 12;

/** A stable starting seed per song, so reopening the editor regenerates the same. */
function seedFromSongId(songId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < songId.length; i++) {
    hash ^= songId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function GeneratePanel() {
  const { t } = useTranslation('r-slice-it');
  const song = useEditorStore((s) => s.song);
  const preview = useEditorStore((s) => s.preview);
  const setPreview = useEditorStore((s) => s.setPreview);
  const playtesting = useEditorStore((s) => s.playtesting);

  const [scopeKind, setScopeKind] = useState<ScopeKind>('auto-only');
  const [densityBias, setDensityBias] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [cascade, setCascade] = useState(true);
  const [preserveEdited, setPreserveEdited] = useState(true);
  const [minGapSeconds, setMinGap] = useState(0.5);
  const [seed, setSeed] = useState(() => seedFromSongId(song?.id ?? 'slice-it'));
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [artefacts, setArtefacts] = useState<EditorArtefacts | null>(null);

  /*
   * The range "this section" means.
   *
   * The selection first, because an author who has selected a bar and pressed
   * regenerate means that bar; then the A/B loop; then a window around the
   * playhead. Derived rather than stored so it cannot go stale against a
   * selection the author has since changed.
   *
   * Each store read returns a primitive or a stable reference, and the object is
   * assembled in `useMemo`: a selector that builds a fresh object every call
   * never satisfies `useSyncExternalStore`'s snapshot check and re-renders
   * forever. The playhead is read at whole seconds for the same class of reason —
   * a playtest writes it every frame, and this panel has no business re-rendering
   * at 60 Hz to move a ±12s window.
   */
  const notes = useEditorStore((s) => s.charts[s.active].notes);
  const loop = useEditorStore((s) => s.loop);
  const playheadSecond = useEditorStore((s) => Math.round(s.playhead));
  const duration = song?.duration ?? 0;

  const range = useMemo(() => {
    const selected = notes.filter((note) => note.selected);
    if (selected.length >= 2) {
      return { start: selected[0].time, end: selected[selected.length - 1].time };
    }
    if (loop) return { start: loop.start, end: loop.end };
    return {
      start: Math.max(0, playheadSecond - DEFAULT_RANGE_SECONDS),
      end: Math.min(
        duration || playheadSecond + DEFAULT_RANGE_SECONDS,
        playheadSecond + DEFAULT_RANGE_SECONDS,
      ),
    };
  }, [notes, loop, playheadSecond, duration]);

  const scope: GenerateScope = useMemo(() => {
    switch (scopeKind) {
      case 'replace-all':
        return { kind: 'replace-all' };
      case 'range':
        return { kind: 'range', start: range.start, end: range.end, preserveEdited };
      case 'fill-gaps':
        return { kind: 'fill-gaps', minGapSeconds };
      default:
        return { kind: 'auto-only' };
    }
  }, [scopeKind, range.start, range.end, preserveEdited, minGapSeconds]);

  const options: GenerateOptions = useMemo(
    () => ({ ...defaultGenerateOptions(seed), scope, difficulty, densityBias, cascade }),
    [seed, scope, difficulty, densityBias, cascade],
  );

  /* A plan is only ever shown for the settings that produced it. Changing any of
   * them drops it, so Apply can never commit a proposal the author is no longer
   * looking at. */
  useEffect(() => {
    setConfirmed(false);
    setPreview(null);
  }, [options, setPreview]);

  const ensureArtefacts = useCallback(async (): Promise<EditorArtefacts | null> => {
    if (artefacts) return artefacts;
    const state = editorState();
    if (!state.song) return null;
    // Expert is the densest tier and therefore the closest stand-in for the onset
    // pool when a song predates stored analysis; an empty Expert falls back to
    // whatever the author is looking at.
    const densest =
      state.charts.expert.notes.length > 0 ? state.charts.expert : state.charts[state.active];
    const loaded = await loadArtefacts({
      songId: state.song.id,
      duration: state.song.duration,
      bpm: state.song.bpm,
      fallbackSlices: toSlices(densest.notes),
    });
    setArtefacts(loaded);
    return loaded;
  }, [artefacts]);

  const onPreview = useCallback(async () => {
    setBusy(true);
    try {
      const loaded = await ensureArtefacts();
      const state = editorState();
      if (!loaded || !state.song) return;
      if (loaded.pool.length === 0) {
        toast.error(
          t('editor-generate-no-analysis', {
            defaultValue: 'This song has no stored analysis to re-chart from.',
          }),
        );
        return;
      }
      // Milliseconds: the expensive half of the pipeline ran at upload and this
      // is only the selection pass (§8.2), so it runs inline rather than behind a
      // worker or a round trip.
      setPreview(buildGeneratePlan(state.charts, loaded.pool, state.song.duration, options));
    } finally {
      setBusy(false);
    }
  }, [ensureArtefacts, options, setPreview, t]);

  const onApply = useCallback(() => {
    const state = editorState();
    const plan = state.preview;
    if (!plan) return;
    const command = planCommand(
      state.charts,
      plan,
      t('editor-generate-step', { defaultValue: 'Generate notes' }),
    );
    if (!command) {
      toast.info(t('editor-generate-nothing', { defaultValue: 'Nothing to change' }));
      setPreview(null);
      return;
    }
    state.apply(command);
    setPreview(null);
    setConfirmed(false);
    toast.success(
      t('editor-generate-applied', {
        defaultValue: '{{added}} notes generated, {{kept}} of yours kept',
        added: plan.totalGenerated,
        kept: plan.totalKeptAuthored,
      }),
    );
  }, [setPreview, t]);

  const destructive = scopeDiscardsAuthorWork(scope);
  const authoredAtRisk = preview
    ? Object.values(preview.byDifficulty).reduce(
        (total, entry) => total + entry.removed.filter((note) => !note.auto).length,
        0,
      )
    : 0;
  const blocked = destructive && authoredAtRisk > 0 && !confirmed;

  const scopes: { kind: ScopeKind; label: string; hint?: string }[] = [
    {
      kind: 'auto-only',
      label: t('editor-generate-scope-auto', { defaultValue: 'Untouched notes only' }),
      hint: t('editor-generate-scope-auto-hint', {
        defaultValue: 'Keeps everything you have edited',
      }),
    },
    {
      kind: 'range',
      label: t('editor-generate-scope-range', { defaultValue: 'This section' }),
      hint: `${formatTime(range.start)} – ${formatTime(range.end)}`,
    },
    {
      kind: 'fill-gaps',
      label: t('editor-generate-scope-gaps', { defaultValue: 'Fill gaps only' }),
      hint: t('editor-generate-scope-gaps-hint', { defaultValue: 'Adds notes, removes nothing' }),
    },
    {
      kind: 'replace-all',
      label: t('editor-generate-scope-all', { defaultValue: 'Replace everything' }),
      hint: t('editor-generate-scope-all-hint', { defaultValue: 'Discards your edits' }),
    },
  ];

  if (!song) return null;

  return (
    <section className="neumorphic flex flex-col gap-3 p-4" aria-labelledby="slice-generate-title">
      <h2 id="slice-generate-title" className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="h-4 w-4" aria-hidden />
        {t('editor-generate-title', { defaultValue: 'Auto-generate' })}
      </h2>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs opacity-70">
          {t('editor-generate-scope', { defaultValue: 'Scope' })}
        </legend>
        {scopes.map((entry) => (
          <label
            key={entry.kind}
            className={cn(
              'flex cursor-pointer items-start gap-2 px-2.5 py-2 text-sm',
              scopeKind === entry.kind ? 'neumorphic-inset' : 'neumorphic-sm',
            )}
          >
            <input
              type="radio"
              name="slice-generate-scope"
              className="mt-0.5 accent-current"
              value={entry.kind}
              checked={scopeKind === entry.kind}
              onChange={() => setScopeKind(entry.kind)}
            />
            <span className="min-w-0">
              <span className="block">{entry.label}</span>
              {entry.hint ? (
                <span className="block text-xs opacity-60 tabular-nums">{entry.hint}</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      {scopeKind === 'range' ? (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="opacity-70">
            {t('editor-generate-preserve', { defaultValue: 'Keep my notes inside it' })}
          </span>
          <Switch
            checked={preserveEdited}
            onCheckedChange={setPreserveEdited}
            aria-label={t('editor-generate-preserve', { defaultValue: 'Keep my notes inside it' })}
          />
        </label>
      ) : null}

      {scopeKind === 'fill-gaps' ? (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="slice-generate-gap" className="text-xs opacity-70">
            {t('editor-generate-gap', { defaultValue: 'Smallest gap to fill' })}
          </label>
          <Select
            id="slice-generate-gap"
            controlSize="sm"
            value={String(minGapSeconds)}
            onChange={(event) => setMinGap(Number(event.target.value))}
          >
            <option value="0.25">0.25s</option>
            <option value="0.5">0.5s</option>
            <option value="1">1s</option>
            <option value="2">2s</option>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="slice-generate-density" className="flex justify-between text-xs opacity-70">
          <span>{t('editor-generate-density', { defaultValue: 'Density' })}</span>
          <span className="tabular-nums">{densityBias > 0 ? `+${densityBias}` : densityBias}</span>
        </label>
        <input
          id="slice-generate-density"
          type="range"
          min={-2}
          max={2}
          step={1}
          value={densityBias}
          onChange={(event) => setDensityBias(Number(event.target.value))}
          className="neumorphic-inset h-2 w-full appearance-none"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <label htmlFor="slice-generate-difficulty" className="text-xs opacity-70">
          {t('editor-generate-difficulty', { defaultValue: 'Difficulty' })}
        </label>
        <Select
          id="slice-generate-difficulty"
          controlSize="sm"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty | 'all')}
        >
          <option value="all">
            {t('editor-generate-all-tiers', { defaultValue: 'All tiers' })}
          </option>
          <option value="easy">{t('editor-difficulty-easy', { defaultValue: 'Easy' })}</option>
          <option value="normal">
            {t('editor-difficulty-normal', { defaultValue: 'Normal' })}
          </option>
          <option value="hard">{t('editor-difficulty-hard', { defaultValue: 'Hard' })}</option>
          <option value="expert">
            {t('editor-difficulty-expert', { defaultValue: 'Expert' })}
          </option>
        </Select>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="opacity-70">
          {t('editor-generate-cascade', { defaultValue: 'Keep tiers nested' })}
        </span>
        <Switch
          checked={cascade}
          onCheckedChange={setCascade}
          aria-label={t('editor-generate-cascade', { defaultValue: 'Keep tiers nested' })}
        />
      </label>

      {preview ? (
        <p className="text-xs tabular-nums" aria-live="polite">
          {t('editor-generate-counts', {
            defaultValue: '{{generated}} generated · {{kept}} yours (kept) · {{removed}} removed',
            generated: preview.totalGenerated,
            kept: preview.totalKeptAuthored,
            removed: preview.totalRemoved,
          })}
        </p>
      ) : (
        <p className="text-xs opacity-60">
          {t('editor-generate-preview-hint', {
            defaultValue: 'Preview shows added notes in green and removed notes struck through.',
          })}
        </p>
      )}

      {destructive && authoredAtRisk > 0 ? (
        <label className="neumorphic-inset flex items-start gap-2 p-2.5 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            {t('editor-generate-confirm', {
              defaultValue: 'I understand this deletes {{count}} notes I edited myself.',
              count: authoredAtRisk,
            })}
          </span>
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="neumorphic-sm flex h-9 flex-1 items-center justify-center gap-2 px-3 text-sm disabled:opacity-40"
          onClick={() => void onPreview()}
          disabled={busy || playtesting}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {t('editor-generate-preview', { defaultValue: 'Preview' })}
        </button>
        <button
          type="button"
          className="neumorphic-sm flex h-9 flex-1 items-center justify-center gap-2 px-3 text-sm disabled:opacity-40"
          onClick={onApply}
          disabled={!preview || blocked || playtesting}
        >
          {t('editor-generate-apply', { defaultValue: 'Apply' })}
        </button>
        <button
          type="button"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center"
          onClick={() => setSeed((value) => (value + 0x9e3779b1) >>> 0)}
          title={t('editor-generate-reseed', { defaultValue: 'New variation' })}
        >
          <Dices className="h-4 w-4" aria-hidden />
          <span className="sr-only">
            {t('editor-generate-reseed', { defaultValue: 'New variation' })}
          </span>
        </button>
      </div>

      {preview ? (
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 text-xs opacity-70"
          onClick={() => setPreview(null)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t('editor-generate-discard', { defaultValue: 'Discard preview' })}
        </button>
      ) : null}

      {artefacts?.source === 'chart' ? (
        <p className="text-xs opacity-60">
          {t('editor-generate-from-chart', {
            defaultValue:
              'No stored analysis for this song — re-charting from the existing Expert chart.',
          })}
        </p>
      ) : null}
    </section>
  );
}
