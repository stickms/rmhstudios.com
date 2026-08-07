'use client';

/**
 * The editor's transport bar: tools, snap, zoom, history, save.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §12.4.
 *
 * Neumorphism's affordance is depth, so the selected tool is the raised surface
 * becoming inset (`.neumorphic-active`) rather than a border or a fill — §12.2.
 * Every control here also has a keyboard path in §13; this bar is the discovery
 * surface for them, not the only way to reach them.
 */

import { useTranslation } from 'react-i18next';
import {
  Eraser,
  Gauge,
  Ghost,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Timer,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SLICE_TYPES } from '@/lib/slice-it/constants';
import { SNAP_DIVISIONS } from '@/lib/slice-it/editor/types';
import type { EditorTool, SliceType, SnapDivision } from '@/lib/slice-it/editor/types';
import { useEditorStore } from '@/lib/slice-it/editor/store';
import { formatTime } from './Timeline';
import { PlaytestControls } from './PlaytestControls';

interface ToolbarProps {
  onSave: () => void;
}

export function Toolbar({ onSave }: ToolbarProps) {
  const { t } = useTranslation('r-slice-it');
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const snap = useEditorStore((s) => s.snap);
  const setSnap = useEditorStore((s) => s.setSnap);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const placeType = useEditorStore((s) => s.placeType);
  const setPlaceType = useEditorStore((s) => s.setPlaceType);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const playhead = useEditorStore((s) => s.playhead);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.undoStack.length > 0);
  const canRedo = useEditorStore((s) => s.redoStack.length > 0);
  const saving = useEditorStore((s) => s.saving);
  const dirty = useEditorStore((s) => s.revision !== s.lastSavedRevision);
  const showGhosts = useEditorStore((s) => s.showGhosts);
  const setShowGhosts = useEditorStore((s) => s.setShowGhosts);

  const tools: { id: EditorTool; label: string; icon: typeof MousePointer2 }[] = [
    {
      id: 'select',
      label: t('editor-tool-select', { defaultValue: 'Select' }),
      icon: MousePointer2,
    },
    { id: 'place', label: t('editor-tool-place', { defaultValue: 'Place' }), icon: Plus },
    { id: 'hold', label: t('editor-tool-hold', { defaultValue: 'Hold' }), icon: Timer },
    { id: 'erase', label: t('editor-tool-erase', { defaultValue: 'Erase' }), icon: Eraser },
    // Selecting the timing tool is what opens the timing/SV panel in the rail.
    { id: 'timing', label: t('editor-tool-timing', { defaultValue: 'Timing' }), icon: Gauge },
  ];

  return (
    <div className="neumorphic flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-[5.5rem] font-mono text-sm tabular-nums" aria-live="off">
        {formatTime(playhead)}
      </span>

      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label={t('editor-tools', { defaultValue: 'Tools' })}
      >
        {tools.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={tool === entry.id}
              title={entry.label}
              onClick={() => setTool(entry.id)}
              className={cn(
                'flex h-9 w-9 items-center justify-center transition-colors',
                tool === entry.id ? 'neumorphic-active' : 'neumorphic-sm',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{entry.label}</span>
            </button>
          );
        })}
      </div>

      <label htmlFor="slice-place-type" className="sr-only">
        {t('editor-place-type', { defaultValue: 'Note type' })}
      </label>
      <Select
        id="slice-place-type"
        controlSize="sm"
        value={placeType}
        onChange={(event) => setPlaceType(event.target.value as SliceType)}
      >
        {SLICE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </Select>

      <div className="flex items-center gap-2">
        <label htmlFor="slice-snap" className="text-xs opacity-70">
          {t('editor-snap', { defaultValue: 'Snap' })}
        </label>
        <Select
          id="slice-snap"
          controlSize="sm"
          value={String(snap)}
          onChange={(event) => setSnap(Number(event.target.value) as SnapDivision)}
        >
          {SNAP_DIVISIONS.map((division) => (
            <option key={division} value={division}>
              1/{division * 4}
            </option>
          ))}
        </Select>
        <Switch
          checked={snapEnabled}
          onCheckedChange={setSnapEnabled}
          aria-label={t('editor-snap-toggle', { defaultValue: 'Snap to grid' })}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center"
          onClick={() => setZoom(zoom / 1.25)}
          title={t('editor-zoom-out', { defaultValue: 'Zoom out' })}
        >
          <ZoomOut className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('editor-zoom-out', { defaultValue: 'Zoom out' })}</span>
        </button>
        <button
          type="button"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center"
          onClick={() => setZoom(zoom * 1.25)}
          title={t('editor-zoom-in', { defaultValue: 'Zoom in' })}
        >
          <ZoomIn className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('editor-zoom-in', { defaultValue: 'Zoom in' })}</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center disabled:opacity-40"
          onClick={undo}
          disabled={!canUndo}
          title={t('editor-undo', { defaultValue: 'Undo' })}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('editor-undo', { defaultValue: 'Undo' })}</span>
        </button>
        <button
          type="button"
          className="neumorphic-sm flex h-9 w-9 items-center justify-center disabled:opacity-40"
          onClick={redo}
          disabled={!canRedo}
          title={t('editor-redo', { defaultValue: 'Redo' })}
        >
          <Redo2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('editor-redo', { defaultValue: 'Redo' })}</span>
        </button>
      </div>

      {/* Ghosts are dense on a busy track, and sometimes the author wants to see
          the chart they have rather than every candidate for one (§6). */}
      <button
        type="button"
        aria-pressed={showGhosts}
        title={t('editor-ghosts', { defaultValue: 'Onset ghosts' })}
        onClick={() => setShowGhosts(!showGhosts)}
        className={cn(
          'flex h-9 w-9 items-center justify-center transition-colors',
          showGhosts ? 'neumorphic-active' : 'neumorphic-sm',
        )}
      >
        <Ghost className="h-4 w-4" aria-hidden />
        <span className="sr-only">{t('editor-ghosts', { defaultValue: 'Onset ghosts' })}</span>
      </button>

      <PlaytestControls />

      <button
        type="button"
        className="neumorphic-sm ml-auto flex h-9 items-center gap-2 px-3 text-sm disabled:opacity-40"
        onClick={onSave}
        disabled={saving || !dirty}
      >
        <Save className="h-4 w-4" aria-hidden />
        {saving
          ? t('editor-saving', { defaultValue: 'Saving…' })
          : dirty
            ? t('editor-save', { defaultValue: 'Save' })
            : t('editor-saved', { defaultValue: 'Saved' })}
      </button>
    </div>
  );
}
