/**
 * The Options dialog (Source's GameUI property sheet: Keyboard, Mouse, Audio, Video, Voice,
 * Multiplayer — plus Controller and Touch), the same for TF2, Half-Life 2 and Portal, from the main
 * menu and the pause menus. Every control is a console variable (lib/tf2-game/client/menus/options.ts
 * reads and writes them through lib/tf2-game/console/settings-cvars.ts), so the dialog, the console
 * and autoexec.cfg show one value; the caller persists `onChange` (the settings record).
 *
 * What the game's files say, they say here: the key list is the game's `scripts/kb_act.lst` (its
 * sections and `#Valve_*` labels), the controls' labels and tooltips are the game's option pages'
 * (`resource/OptionsSubMouse.res`…), the Multiplayer tab's Advanced section is TF2's own
 * `cfg/user_default.scr` — each localised at run time; before they are published, or where a file has
 * nothing, the controls keep this game's own short words. Options the game has no setting for are left
 * out; voice chat and sprays are shown disabled with a note.
 *
 * Mouse, keyboard (tabs, Tab / arrows, Enter), gamepad (the lobby's / the HUD's focus navigation) and
 * touch (44 px targets and 16 px fields on coarse pointers, from the TF2 Hub's controls).
 */
'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Maximize } from 'lucide-react';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import { defaultKeybinds, mouseCode, unbind, type Action } from '@/lib/tf2-game/client/input/actions';
import { keyLabel } from '@/lib/tf2-game/client/input/keyboard-mouse';
import { defaultSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import { advancedGroups, parseUserScr, USER_SCR_FILE } from '@/lib/tf2-game/client/menus/advanced-options';
import { kbActFile, keyListRows, parseKbAct, rebindChecked } from '@/lib/tf2-game/client/menus/kb-act';
import {
  ADVANCED_FALLBACK,
  ADVANCED_LABELS,
  advancedControl,
  controlRange,
  controlValue,
  hasOptionCvar,
  OPTIONS_TABS,
  resText,
  setControl,
  TAB_TOKENS,
  tabControls,
  type OptionControl,
  type OptionsTab,
} from '@/lib/tf2-game/client/menus/options';
import type { MenuSource } from '@/lib/tf2-game/client/menus/source';
import { isFullscreen, toggleFullscreen } from '@/lib/shared/platform';
import { Btn, RangeField, SelectField, TextField, Toggle } from '../../tf2-hud/ui';
import { TfTabs } from '../../tf2-hud/TfTabs';
import { CrosshairGlyph } from '../tf2/Crosshair';
import { useActionLabels } from './action-labels';
import { useOptionStrings } from './option-strings';
import { gameText } from './use-menu-source';
import './menus.css';

const subscribeFullscreen = (cb: () => void) => {
  document.addEventListener('fullscreenchange', cb);
  return () => document.removeEventListener('fullscreenchange', cb);
};

export interface OptionsDialogProps {
  game: HudGame;
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  /** The game's files (labels, the key list, the advanced options); null before they load. */
  source: MenuSource | null;
  initialTab?: OptionsTab;
  /** Open the tab's Advanced section (the main menu's TF2 Advanced Options button). */
  initialAdvanced?: boolean;
  /** The player's name: the signed-in account's (read-only), or null signed out. */
  accountName?: string | null;
}

function formatValue(c: OptionControl, v: number): string {
  switch (c.format) {
    case 'pct':
      return `${Math.round(v * 100)}%`;
    case 'deg':
      return `${Math.round(v)}°`;
    case 'int':
      return String(Math.round(v));
    case 'fixed3':
      return v.toFixed(3);
    default:
      return v.toFixed(2);
  }
}

/** One control row: the label wraps (the game's labels are sentences), the control on its right. */
function OptionRow({ tooltip, children, stacked }: { label?: string; tooltip?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col gap-1 py-1'
          : 'grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-0.5 pointer-coarse:min-h-11'
      }
      title={tooltip}
    >
      {children}
    </div>
  );
}

export default function OptionsDialog({ game, settings, onChange, source, initialTab = 'keyboard', initialAdvanced = false, accountName }: OptionsDialogProps) {
  const { t } = useTranslation('c-tf2-game');
  const words = useOptionStrings();
  const actionLabels = useActionLabels(game);
  const [tab, setTab] = useState<OptionsTab>(initialTab);
  const [advanced, setAdvanced] = useState<OptionsTab | null>(initialAdvanced ? initialTab : null);
  const [capturing, setCapturing] = useState<{ action: Action; row: string } | null>(null);
  const [notice, setNotice] = useState('');
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  const read = source?.source.readText;
  const env = source?.source.env;
  /** A control's label: the game's dialog file's (localised), its token, or this game's own words. */
  const labelOf = (c: OptionControl): { label: string; tooltip?: string } => {
    const own = c.key === 'opt_advanced_item' ? c.fallback : (words[c.key] ?? c.fallback);
    const res = read && env ? resText(read, env, c) : {};
    const label = gameText(source, res.label ?? c.token, own);
    const tip = res.tooltip ?? c.tooltipToken;
    const tooltip = tip ? gameText(source, tip, '') || undefined : undefined;
    return { label, tooltip };
  };
  const choiceLabel = (choice: NonNullable<OptionControl['choices']>[number]): string =>
    gameText(source, choice.token, choice.key === 'opt_advanced_choice' ? choice.fallback : (words[choice.key] ?? choice.fallback));

  const set = (c: OptionControl, v: string | number | boolean) => onChange(setControl(game, settings, c, v));

  // Rebinding: the next key or mouse button (capture phase: nothing else sees it); Escape cancels.
  useEffect(() => {
    if (!capturing) return undefined;
    const finish = (code: string | null) => {
      setCapturing(null);
      if (!code) return;
      const r = rebindChecked(settings.keybinds, capturing.action, code);
      if (!r.ok) {
        setNotice(t('opt_key_reserved', { defaultValue: '{{key}} is reserved (the menu and the console).', key: keyLabel(code) }));
        return;
      }
      onChange({ ...settings, keybinds: r.keybinds });
      setNotice(
        r.displaced.length
          ? t('opt_key_moved', {
              defaultValue: '{{key}} now does {{action}}; it no longer does {{other}}.',
              key: keyLabel(code),
              action: actionLabels[capturing.action],
              other: r.displaced.map((a) => actionLabels[a]).join(', '),
            })
          : t('opt_key_set', { defaultValue: '{{key}} now does {{action}}.', key: keyLabel(code), action: actionLabels[capturing.action] }),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(e.code === 'Escape' ? null : e.code);
    };
    const onMouse = (e: MouseEvent) => {
      // The click that started the capture is not a binding.
      if ((e.target as HTMLElement | null)?.closest?.(`[data-bind-row="${capturing.row}"]`) && e.button === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(mouseCode(e.button));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      finish(e.deltaY < 0 ? 'MWheelUp' : 'MWheelDown');
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [capturing, settings, onChange, t, actionLabels]);

  const keyRows = useMemo(() => {
    const text = read?.(kbActFile(game));
    return keyListRows(game, text ? parseKbAct(text) : null);
  }, [read, game]);

  const advancedItems = useMemo(() => {
    if (game !== 'tf2') return [];
    const text = read?.(USER_SCR_FILE);
    const items = text ? parseUserScr(text) : [];
    const groups = advancedGroups(items.length ? items : ADVANCED_FALLBACK, (c) => hasOptionCvar(game, c));
    return groups.length ? groups : advancedGroups(ADVANCED_FALLBACK, (c) => hasOptionCvar(game, c));
  }, [read, game]);

  const tabs = OPTIONS_TABS.map((id) => ({
    id,
    label: gameText(source, TAB_TOKENS[id], words[`tab_${id}`] ?? id),
  }));

  const control = (c: OptionControl) => {
    const { label, tooltip } = labelOf(c);
    const v = controlValue(game, settings, c);
    if (c.kind === 'toggle' || c.kind === 'fixed' || c.kind === 'unavailable') {
      return (
        <OptionRow key={c.id} label={label} tooltip={tooltip}>
          <label className="flex min-w-0 items-center gap-2 text-sm text-(--app-text)" data-cvar={c.cvar || undefined}>
            <Toggle label={label} checked={v === true} disabled={c.kind !== 'toggle'} onChange={(on) => set(c, on)} />
            <span className="min-w-0">{label}</span>
          </label>
          {c.kind === 'fixed' ? (
            <span className="text-xs text-(--app-text-dim)">{t('opt_fixed', { defaultValue: 'Always on in this game' })}</span>
          ) : c.kind === 'unavailable' ? (
            <span className="text-xs text-(--app-text-dim)">{t('opt_unavailable', { defaultValue: 'Not in this game yet' })}</span>
          ) : (
            <span />
          )}
        </OptionRow>
      );
    }
    if (c.kind === 'slider') {
      const { min, max } = controlRange(game, c);
      const n = Number(v);
      return (
        <OptionRow key={c.id} label={label} tooltip={tooltip} stacked>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-(--app-text)">{label}</span>
            <span className="shrink-0 tabular-nums text-(--app-text-muted)">{formatValue(c, n)}</span>
          </div>
          <div data-cvar={c.cvar}>
            <RangeField label={label} min={min} max={max} step={c.step ?? 0.01} value={n} onChange={(x) => set(c, x)} />
          </div>
        </OptionRow>
      );
    }
    return (
      <OptionRow key={c.id} label={label} tooltip={tooltip}>
        <span className="min-w-0 text-sm text-(--app-text)">{label}</span>
        <div data-cvar={c.cvar} className="min-w-36">
          <SelectField value={String(v)} onChange={(e) => set(c, e.target.value)} aria-label={label}>
            {(c.choices ?? []).map((ch) => (
              <option key={ch.value} value={ch.value}>
                {choiceLabel(ch)}
              </option>
            ))}
          </SelectField>
        </div>
      </OptionRow>
    );
  };

  const advancedToggle = (id: OptionsTab, body: ReactNode) => {
    const open = advanced === id;
    return (
      <div className="mt-2 border-t border-(--app-border) pt-2">
        <Btn size="sm" variant="ghost" icon={open ? ChevronDown : ChevronRight} aria-expanded={open} onClick={() => setAdvanced(open ? null : id)}>
          {gameText(source, '#GameUI_AdvancedEllipsis', t('opt_advanced', { defaultValue: 'Advanced…' }))}
        </Btn>
        {open ? <div className="mt-1 flex flex-col">{body}</div> : null}
      </div>
    );
  };

  const keyboard = (
    <>
      <div className="tf2m-keys" role="group" aria-label={gameText(source, TAB_TOKENS.keyboard, words.tab_keyboard)}>
        {keyRows.map((r) => {
          if (r.kind === 'title') {
            return (
              <p key={r.id} className="tf2m-keys-title">
                {gameText(source, r.label, '')}
              </p>
            );
          }
          const label = r.label ? gameText(source, r.label, actionLabels[r.action]) : actionLabels[r.action];
          const keys = settings.keybinds[r.action] ?? [];
          const active = capturing?.row === r.id;
          return (
            <div key={r.id} className="contents" data-bind-row={r.id}>
              <span className="min-w-0 text-sm text-(--app-text)">{label}</span>
              <Btn
                size="xs"
                variant={active ? 'primary' : 'secondary'}
                data-action={r.action}
                aria-label={t('bind_aria', { defaultValue: 'Change key for {{action}}', action: label })}
                onClick={() => setCapturing(active ? null : { action: r.action, row: r.id })}
              >
                {active ? t('bind_press', { defaultValue: 'Press a key…' }) : keys.length ? keys.map(keyLabel).join(' / ') : t('bind_none', { defaultValue: 'Unbound' })}
              </Btn>
              <Btn size="xs" variant="ghost" disabled={!keys.length} onClick={() => onChange({ ...settings, keybinds: unbind(settings.keybinds, r.action) })}>
                {gameText(source, '#GameUI_ClearKey', t('bind_clear', { defaultValue: 'Clear' }))}
              </Btn>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Btn size="sm" onClick={() => onChange({ ...settings, keybinds: defaultKeybinds(game) })}>
          {gameText(source, '#GameUI_UseDefaults', t('bind_defaults', { defaultValue: 'Use defaults' }))}
        </Btn>
      </div>
      {advancedToggle(
        'keyboard',
        <>
          {tabControls(game, 'keyboard', true).map(control)}
          <p className="text-[11px] text-(--app-text-dim) pointer-coarse:text-xs">
            {t('set_dev_console_hint', { defaultValue: 'Open it with the ` key, or from the pause menu.' })}
          </p>
        </>,
      )}
    </>
  );

  const crosshair = settings.crosshair;
  const multiplayer = (
    <>
      {game === 'tf2' ? (
      <OptionRow>
        <span className="min-w-0 text-sm text-(--app-text)">{gameText(source, '#GameUI_PlayerName', t('opt_name', { defaultValue: 'Name' }))}</span>
        <div className="min-w-44">
          <TextField
            value={accountName ?? ''}
            readOnly
            placeholder={t('opt_name_signed_out', { defaultValue: 'Sign in to play online' })}
            aria-label={t('opt_name_aria', { defaultValue: 'Your name (from your account)' })}
          />
        </div>
      </OptionRow>
      ) : null}
      {game === 'tf2' ? (
        <p className="text-[11px] text-(--app-text-dim) pointer-coarse:text-xs">
          {t('opt_name_hint', { defaultValue: 'Online, players are named by their account.' })}
        </p>
      ) : null}
      {tabControls(game, 'multiplayer').map(control)}
      <div className="flex items-center gap-3 py-1">
        {/* relative: the glyph is the HUD's centred crosshair, centred here in its box. */}
        <span className="relative inline-grid size-12 place-items-center rounded-(--app-radius-sm) bg-(--app-bg)" aria-hidden="true">
          <CrosshairGlyph style={crosshair.style} color={crosshair.color} size={32 * crosshair.scale} />
        </span>
        <span className="text-xs text-(--app-text-dim)">{t('opt_crosshair_preview', { defaultValue: 'Preview' })}</span>
      </div>
      {game === 'tf2' && advancedItems.length ? advancedToggle(
        'multiplayer',
        <>
          <p className="tf2hud-title text-lg">{gameText(source, '#TF_AdvancedOptions', t('opt_tf_advanced', { defaultValue: 'Advanced options' }))}</p>
          {advancedItems.map((g, i) => (
            <div key={`${g.title ?? ''}${i}`}>
              {g.title ? (
                <p className="tf2m-options-section">
                  {gameText(source, g.title, ADVANCED_LABELS[g.title] ? (words[ADVANCED_LABELS[g.title].key] ?? ADVANCED_LABELS[g.title].fallback) : g.title.replace(/^#/, ''))}
                </p>
              ) : null}
              {g.items.map((it) => control(advancedControl(game, it)))}
            </div>
          ))}
        </>,
      ) : null}
    </>
  );

  const video = (
    <>
      <OptionRow>
        <span className="min-w-0 text-sm text-(--app-text)">{gameText(source, '#GameUI_DisplayMode', t('opt_display_mode', { defaultValue: 'Display mode' }))}</span>
        <Btn
          size="sm"
          icon={Maximize}
          disabled={!canFullscreen}
          onClick={() => void toggleFullscreen(document.documentElement)}
          aria-pressed={fullscreen}
        >
          {fullscreen ? gameText(source, '#GameUI_Fullscreen', t('opt_fullscreen', { defaultValue: 'Full screen' })) : gameText(source, '#GameUI_Windowed', t('opt_windowed', { defaultValue: 'Windowed' }))}
        </Btn>
      </OptionRow>
      {!canFullscreen ? (
        <p className="text-[11px] text-(--app-text-dim) pointer-coarse:text-xs">{t('opt_fullscreen_na', { defaultValue: 'This browser does not allow full screen here.' })}</p>
      ) : null}
      {tabControls(game, 'video').map(control)}
      <p className="text-[11px] text-(--app-text-dim) pointer-coarse:text-xs">{t('opt_next_load', { defaultValue: 'Quality and detail apply when the next level loads.' })}</p>
      {advancedToggle('video', tabControls(game, 'video', true).map(control))}
    </>
  );

  const body = (() => {
    switch (tab) {
      case 'keyboard':
        return keyboard;
      case 'multiplayer':
        return multiplayer;
      case 'video':
        return video;
      case 'voice':
        return (
          <>
            {tabControls(game, 'voice').map(control)}
            <p className="text-xs text-(--app-text-muted)">{t('opt_voice_note', { defaultValue: 'Voice chat is not part of this game yet. Text chat and voice commands work as usual.' })}</p>
          </>
        );
      default: {
        const main = tabControls(game, tab);
        const adv = tabControls(game, tab, true);
        return (
          <>
            {main.map(control)}
            {adv.length ? advancedToggle(tab, adv.map(control)) : null}
          </>
        );
      }
    }
  })();

  return (
    <div className="flex flex-col gap-3" data-testid="tf2-options" data-tab={tab}>
      <TfTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as OptionsTab)} size="sm" aria-label={gameText(source, '#GameUI_Options', t('settings', { defaultValue: 'Options' }))} />
      <div className="flex flex-col">{body}</div>
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-(--app-text-muted)">
        {notice}
      </p>
      <div className="flex justify-end border-t border-(--app-border) pt-3">
        <Btn size="sm" variant="ghost" onClick={() => onChange(defaultSettings(game))}>
          {t('settings_reset', { defaultValue: 'Reset all options' })}
        </Btn>
      </div>
    </div>
  );
}
