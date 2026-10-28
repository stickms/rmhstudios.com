/**
 * The bar above the preview: which page, what resolution and zoom, and the
 * switches that change what is drawn (hidden panels, bounds, minmode, platform).
 */
'use client';

import {
  ArrowLeftRight,
  Box,
  Eye,
  EyeOff,
  Maximize,
  MonitorSmartphone,
  Minimize2,
  Play,
  Scan,
  UserRound,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PAGES, PAGE_GROUPS, SINGLE_FILE_PREFIX, resolvePage } from '@/lib/tf2-hud/pages';
import { COND_ENVS, type CondEnvName } from '@/lib/tf2-hud/scheme/cond';
import { useEditor } from '@/lib/tf2-hud/store';
import {
  ASPECTS,
  RESOLUTIONS,
  ZOOM_STEPS,
  aspectLabel,
  clampResolution,
  screenOf,
  virtualSize,
  widthForAspect,
} from '@/lib/tf2-hud/view';
import LanguageControl from './LanguageControl';
import { IconBtn, SelectField } from './ui';

const ENV_LABELS: Record<CondEnvName, string> = {
  windows: 'Windows',
  linux: 'Linux',
  mac: 'macOS',
  x360: 'Console',
};

export default function PreviewToolbar() {
  const { t } = useTranslation('c-tf2-hud');
  const pageId = useEditor((s) => s.pageId);
  const setPage = useEditor((s) => s.setPage);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const setPlay = useEditor((s) => s.setPlay);

  const current = resolvePage(pageId);
  const zoomValue = view.zoom === 'fit' ? 'fit' : String(view.zoom);
  const screen = screenOf(view);
  const virtual = virtualSize(screen.w, screen.h);

  const stepZoom = (dir: 1 | -1) => {
    const cur = view.zoom === 'fit' ? 1 : view.zoom;
    const next =
      dir === 1
        ? (ZOOM_STEPS.find((z) => z > cur + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
        : ([...ZOOM_STEPS].reverse().find((z) => z < cur - 1e-6) ?? ZOOM_STEPS[0]);
    setView({ zoom: next });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--app-border) bg-(--app-bg-subtle) px-3 py-2">
      <SelectField
        aria-label={t('page', { defaultValue: 'HUD page' })}
        value={pageId}
        onChange={(e) => setPage(e.target.value)}
        className="w-48"
      >
        {PAGE_GROUPS.map((group) => {
          const pages = PAGES.filter((p) => p.group === group);
          if (!pages.length) return null;
          return (
            <optgroup key={group} label={group}>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          );
        })}
        {pageId.startsWith(SINGLE_FILE_PREFIX) && current ? (
          <optgroup label={t('single-file', { defaultValue: 'Single file' })}>
            <option value={pageId}>{current.label}</option>
          </optgroup>
        ) : null}
      </SelectField>

      <SelectField
        aria-label={t('resolution', { defaultValue: 'Resolution' })}
        value={view.resolution}
        onChange={(e) => setView({ resolution: e.target.value })}
        className="w-44"
      >
        {RESOLUTIONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
        <option value="custom">{t('custom-res', { defaultValue: 'Custom…' })}</option>
      </SelectField>

      {view.resolution === 'custom' ? (
        <div className="flex items-center gap-1 text-xs text-(--app-text-muted)">
          <input
            type="number"
            aria-label={t('width', { defaultValue: 'Width' })}
            value={view.custom.w}
            min={320}
            max={7680}
            onChange={(e) => setView({ custom: { ...view.custom, w: Number(e.target.value) } })}
            className="h-8 w-16 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) px-1.5 text-xs"
          />
          ×
          <input
            type="number"
            aria-label={t('height', { defaultValue: 'Height' })}
            value={view.custom.h}
            min={320}
            max={7680}
            onChange={(e) => setView({ custom: { ...view.custom, h: Number(e.target.value) } })}
            className="h-8 w-16 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) px-1.5 text-xs"
          />
          <IconBtn
            icon={ArrowLeftRight}
            label={t('swap-orientation', { defaultValue: 'Swap width and height' })}
            onClick={() => setView({ custom: { w: view.custom.h, h: view.custom.w } })}
          />
          <SelectField
            aria-label={t('snap-aspect', { defaultValue: 'Snap to aspect ratio' })}
            value=""
            onChange={(e) => {
              const a = ASPECTS.find((x) => x.id === e.target.value);
              if (a)
                setView({
                  custom: { w: widthForAspect(a.value, view.custom.h), h: view.custom.h },
                });
            }}
            className="w-24"
          >
            <option value="">{t('aspect', { defaultValue: 'Aspect' })}</option>
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ))}
          </SelectField>
          <IconBtn
            icon={MonitorSmartphone}
            label={t('match-screen', { defaultValue: 'Use this screen’s resolution' })}
            onClick={() => {
              const dpr = window.devicePixelRatio || 1;
              setView({
                custom: clampResolution(window.screen.width * dpr, window.screen.height * dpr),
              });
            }}
          />
        </div>
      ) : null}

      <span
        className="hidden font-mono text-[11px] text-(--app-text-dim) xl:inline"
        title={t('virtual-hint', {
          defaultValue:
            'Proportional values lay out on a canvas 480 units high; this is its width.',
        })}
      >
        {aspectLabel(screen.w, screen.h)} · {virtual.w}×{virtual.h}
      </span>

      <div className="flex items-center">
        <IconBtn
          icon={ZoomOut}
          label={t('zoom-out', { defaultValue: 'Zoom out' })}
          onClick={() => stepZoom(-1)}
        />
        <SelectField
          aria-label={t('zoom', { defaultValue: 'Zoom' })}
          value={zoomValue}
          onChange={(e) =>
            setView({ zoom: e.target.value === 'fit' ? 'fit' : Number(e.target.value) })
          }
          className="w-20"
        >
          <option value="fit">{t('fit', { defaultValue: 'Fit' })}</option>
          {ZOOM_STEPS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </SelectField>
        <IconBtn
          icon={ZoomIn}
          label={t('zoom-in', { defaultValue: 'Zoom in' })}
          onClick={() => stepZoom(1)}
        />
        <IconBtn
          icon={view.zoom === 'fit' ? Minimize2 : Maximize}
          label={t('fit-screen', { defaultValue: 'Fit to window' })}
          onClick={() => setView({ zoom: 'fit' })}
          active={view.zoom === 'fit'}
        />
      </div>

      <div className="ms-auto flex items-center gap-1">
        <LanguageControl />
        <IconBtn
          icon={view.showHidden ? Eye : EyeOff}
          label={t('show-hidden', { defaultValue: 'Show hidden panels' })}
          active={view.showHidden}
          onClick={() => setView({ showHidden: !view.showHidden })}
        />
        <IconBtn
          icon={Box}
          label={t('models-3d', {
            defaultValue: 'Show 3D models and a backpack of items in the panels that use them',
          })}
          active={view.models3d}
          onClick={() => setView({ models3d: !view.models3d })}
        />
        <IconBtn
          icon={UserRound}
          label={t('player-3d', { defaultValue: 'Show a 3D player behind the HUD' })}
          active={view.player3d}
          onClick={() => setView({ player3d: !view.player3d })}
        />
        <IconBtn
          icon={Play}
          label={t('play-mode', {
            defaultValue: 'Play mode: click buttons and run a little match',
          })}
          active={view.play}
          onClick={() => setPlay(!view.play)}
        />
        <IconBtn
          icon={Scan}
          label={t('show-bounds', { defaultValue: 'Show panel bounds' })}
          active={view.showBounds}
          onClick={() => setView({ showBounds: !view.showBounds })}
        />
        <button
          type="button"
          aria-pressed={view.minmode}
          onClick={() => setView({ minmode: !view.minmode })}
          title={t('minmode-hint', { defaultValue: 'Preview the compact "minmode" layout' })}
          className={`h-8 rounded-(--app-radius-sm) px-2 text-xs font-semibold ${
            view.minmode
              ? 'bg-(--app-accent-dim) text-(--app-accent-text)'
              : 'text-(--app-text-muted) hover:bg-(--app-surface-hover)'
          }`}
        >
          {t('minmode', { defaultValue: 'Minmode' })}
        </button>
        <SelectField
          aria-label={t('platform', { defaultValue: 'Platform conditionals' })}
          value={view.env}
          onChange={(e) => setView({ env: e.target.value as CondEnvName })}
          className="w-28"
        >
          {(Object.keys(COND_ENVS) as CondEnvName[]).map((k) => (
            <option key={k} value={k}>
              {ENV_LABELS[k]}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
