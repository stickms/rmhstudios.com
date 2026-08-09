'use client';

/**
 * Slice It — the settings drawer.
 *
 * Lifted out of `MainMenu.tsx` when it stopped being a drawer and became the
 * surface for most of the game's per-player configuration. The split is not
 * cosmetic: the store has carried `reducedFlash`, `lanePalette`,
 * `effectIntensity`, the four `H9` HUD fields, `metronome`/`assistTick`,
 * `inputOffset`, `extraBinds`, `linePosition` and `modifierPresets` — all
 * persisted, most of them already read by the engine or the renderer — with no
 * control anywhere that could set them. A setting the player cannot reach is
 * the same as a setting that does not exist, and three of these
 * (`reducedFlash`, `lanePalette`, `effectIntensity`) are accessibility
 * features, which makes their absence a defect rather than a gap.
 *
 * Everything here writes straight to `lib/slice-it/store.ts`. Nothing computes
 * gameplay: the engine and `GameCanvas` read these values themselves, so this
 * file only has to present them.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AudioManager } from '@/lib/audio/AudioManager';
import { asset } from '@/lib/storage/asset';
import {
  HIT_WINDOWS,
  JUDGEMENT_COLORS,
  JUDGEMENT_ORDER,
  MAX_LINE_POSITION,
  MAX_SCROLL_SPEED,
  MIN_LINE_POSITION,
  MIN_SCROLL_SPEED,
} from '@/lib/slice-it/constants';
import {
  DEFAULT_HIT_SOUND_ID,
  HIT_SOUND_OPTIONS,
  HIT_SOUND_SAMPLE_IDS,
  hitSoundPath,
  pickHitSound,
  RANDOM_HIT_SOUND_ID,
} from '@/lib/slice-it/hit-sound-pool';
import { bindsForLane, conflictingBinds } from '@/lib/slice-it/input';
import { LANE_PALETTE_IDS } from '@/lib/slice-it/palettes';
import { timingScale } from '@/lib/slice-it/scoring';
import { FREE_SKIN_IDS } from '@/lib/slice-it/skins';
import { useSliceItStore } from '@/lib/slice-it/store';

/**
 * ## Two rules this file follows that the rest of the game does not
 *
 * Both are `i18next-parser` limits, and both fail SILENTLY — the UI looks
 * right in English and every other locale serves the English `defaultValue`
 * forever, because the key never reaches `locales/`.
 *
 * 1. **The callee must literally be named `t`.** The idiom everywhere else here
 *    is `const { t: ts } = useTranslation('r-slice-it')`, and the parser does
 *    not recognise `ts(...)` as a translation call at all. That is why
 *    `locales/en/r-slice-it.json` has no `health-gauge`, no `quant-colors` and
 *    none of the other `ts()` keys in `MainMenu.tsx`.
 * 2. **The namespace argument must be a literal.** A `const NAMESPACES = [...]`
 *    referenced here reads as unresolvable and every key falls through to
 *    `defaultNamespace: 'common'`.
 *
 * So: one hook per component, the array written out, `r-slice-it` first so it
 * is the default, and an explicit `c-game:` prefix on the keys shared with the
 * rest of the game's chrome.
 */

const formatBind = (bind: string) =>
  bind
    .replace('Mouse0', 'LMB')
    .replace('Mouse1', 'MMB')
    .replace('Mouse2', 'RMB')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Key', '')
    .replace('Arrow', '');

/**
 * Listen for one key or mouse button and hand it back.
 *
 * Shared by the primary bind rows and `I1`'s extra binds, so both capture the
 * same way — including the `justAssigned` guard, without which the mouse-up
 * that ends the capture immediately re-opens it.
 */
function useBindCapture(onCapture: (code: string) => void) {
  const [listening, setListening] = React.useState(false);
  const justAssigned = React.useRef(false);

  React.useEffect(() => {
    if (!listening) return;

    const finish = (code: string | null) => {
      if (code) onCapture(code);
      setListening(false);
      justAssigned.current = true;
      setTimeout(() => (justAssigned.current = false), 100);
    };

    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      finish(e.code === 'Escape' ? null : e.code);
    };
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      finish(`Mouse${e.button}`);
    };
    const suppressContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', suppressContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', suppressContextMenu);
    };
  }, [listening, onCapture]);

  return {
    listening,
    start: () => {
      if (justAssigned.current) return;
      setListening(true);
    },
    toggle: () => {
      if (justAssigned.current) return;
      setListening((current) => !current);
    },
  };
}

const KeybindInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) => {
  const { t } = useTranslation(['r-slice-it', 'c-game']);
  const capture = useBindCapture(onChange);

  return (
    <div className="flex justify-between items-center bg-slice-bg p-3 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
      <span className="text-xs text-slice-text-muted uppercase font-bold">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        className={`font-mono text-xs w-32 rounded-lg ${capture.listening ? 'bg-blue-500/20 text-blue-400' : 'bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker'}`}
        onClick={capture.toggle}
      >
        {capture.listening
          ? t('c-game:press-key-btn', { defaultValue: 'PRESS KEY/BTN...' })
          : formatBind(value)}
      </Button>
    </div>
  );
};

/**
 * A settings row that is a single on/off decision.
 *
 * Neumorphic depth rule (chart-editor doc §12.1): the container is inset, the
 * thing you can press is raised — and pressed-in when it is on, so the state is
 * legible from the shadow rather than from a colour alone.
 */
const ToggleRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    aria-pressed={value}
    onClick={() => onChange(!value)}
    className={`w-full flex items-center justify-between gap-4 text-left p-4 rounded-2xl bg-slice-bg transition-shadow ${
      value
        ? 'shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)]'
        : 'shadow-[4px_4px_10px_var(--slice-shadow-dark),-4px_-4px_10px_var(--slice-shadow-light)]'
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm font-black text-slice-text-darker">{label}</span>
      <span className="block text-[10px] text-slice-text-light font-bold leading-snug mt-0.5">
        {description}
      </span>
    </span>
    <span
      className={`shrink-0 text-[10px] font-black uppercase tracking-[0.2em] ${
        value ? 'text-blue-500' : 'text-slice-text-light'
      }`}
    >
      {value ? 'ON' : 'OFF'}
    </span>
  </button>
);

/**
 * A settings row that picks one of several options — the segmented-choice
 * sibling of `ToggleRow` above. Independent `aria-pressed` buttons, not a tab
 * strip: no tablist role, no selected-state ARIA attribute, because there is
 * no shared panel being switched, only N buttons where turning one on means
 * the others are understood to be off.
 */
const ChoiceRow = <T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) => (
  <div className="space-y-2">
    <span className="block text-sm font-black text-slice-text-darker">{label}</span>
    <span className="block text-[10px] text-slice-text-light font-bold leading-snug">
      {description}
    </span>
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-shadow ${
            value === opt.id
              ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.25)]'
              : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

/** A labelled 0–1 style slider with its own numeric readout. */
const SliderRow = ({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (next: number) => void;
}) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center gap-3">
      <span className="text-sm font-black text-slice-text-darker">{label}</span>
      <span className="text-blue-500 font-mono text-sm tabular-nums">{format(value)}</span>
    </div>
    {description && (
      <span className="block text-[10px] text-slice-text-light font-bold leading-snug">
        {description}
      </span>
    )}
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(vals) => onChange(vals[0])}
      aria-label={label}
    />
  </div>
);

/** The `± N ms` stepper shape used by both offsets. */
const OffsetStepper = ({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (next: number) => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">
      {label}
    </span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${label} −${step}ms`}
        className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
        onClick={() => onChange(value - step)}
      >
        −
      </button>
      <span className="text-sm font-bold text-slice-text-darker w-16 text-center font-mono tabular-nums">
        {value > 0 ? '+' : ''}
        {value}ms
      </span>
      <button
        type="button"
        aria-label={`${label} +${step}ms`}
        className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
        onClick={() => onChange(value + step)}
      >
        +
      </button>
    </div>
  </div>
);

/**
 * `I1` — the extra keys bound to one lane, beyond its primary.
 *
 * Alternating two keys on one lane is how a fast jack is played, and
 * `bindsForLane` has supported it since the store gained `extraBinds`. This is
 * the surface `lib/slice-it/input.ts` says conflicts are "surfaced in settings
 * rather than prevented" against — it did not exist until now.
 */
const ExtraBindRow = ({ lane }: { lane: 0 | 1 }) => {
  const { t } = useTranslation(['r-slice-it', 'c-game']);
  const keybinds = useSliceItStore((s) => s.keybinds);
  const extraBinds = useSliceItStore((s) => s.extraBinds);
  const setExtraBinds = useSliceItStore((s) => s.setExtraBinds);

  const add = React.useCallback(
    (code: string) => {
      const next = [extraBinds[0] ?? [], extraBinds[1] ?? []];
      // Capped at three extras: past that the list stops being readable and a
      // lane bound to half the keyboard is a misconfiguration, not a setup.
      if (next[lane].includes(code) || next[lane].length >= 3) return;
      next[lane] = [...next[lane], code];
      setExtraBinds(next);
    },
    [extraBinds, lane, setExtraBinds],
  );

  const capture = useBindCapture(add);

  const remove = (code: string) => {
    const next = [extraBinds[0] ?? [], extraBinds[1] ?? []];
    next[lane] = next[lane].filter((entry) => entry !== code);
    setExtraBinds(next);
  };

  // Primary first, then the extras — `bindsForLane` is the same order the
  // engine resolves in, so the list reads as what the lane actually answers to.
  const all = bindsForLane(keybinds, extraBinds, lane);
  const extras = all.slice(1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider mr-1">
        {lane === 0
          ? t('extra-binds-lane-a', { defaultValue: 'Lane A extras' })
          : t('extra-binds-lane-b', { defaultValue: 'Lane B extras' })}
      </span>
      {extras.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => remove(code)}
          className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
          aria-label={t('extra-binds-remove', {
            defaultValue: 'Remove {{bind}}',
            bind: formatBind(code),
          })}
          title={t('extra-binds-remove', {
            defaultValue: 'Remove {{bind}}',
            bind: formatBind(code),
          })}
        >
          {formatBind(code)} ✕
        </button>
      ))}
      {extras.length < 3 && (
        <Button
          variant="ghost"
          size="sm"
          className={`font-mono text-xs rounded-lg ${
            capture.listening
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
          }`}
          onClick={capture.start}
        >
          {capture.listening
            ? t('extra-binds-listening', { defaultValue: 'Press key…' })
            : t('extra-binds-add', { defaultValue: '+ Add key' })}
        </Button>
      )}
    </div>
  );
};

/**
 * `M7` — named modifier presets.
 *
 * The store has saved, applied and deleted presets since the field was added;
 * nothing ever called any of the three. Saving captures whatever is currently
 * selected, which is why the panel lives here rather than in the per-song
 * modifier picker — the point is the round trip, not the picker.
 */
const ModifierPresets = () => {
  const { t } = useTranslation(['r-slice-it', 'c-game']);
  const presets = useSliceItStore((s) => s.modifierPresets);
  const savePreset = useSliceItStore((s) => s.saveModifierPreset);
  const applyPreset = useSliceItStore((s) => s.applyModifierPreset);
  const deletePreset = useSliceItStore((s) => s.deleteModifierPreset);
  const [name, setName] = React.useState('');

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    savePreset(trimmed);
    setName('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder={t('preset-name-placeholder', { defaultValue: 'Name this setup' })}
          aria-label={t('preset-name-label', { defaultValue: 'Preset name' })}
          className="flex-1 min-w-0 bg-slice-bg shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] rounded-xl px-4 py-3 text-sm font-bold text-slice-text focus:outline-none"
        />
        <Button
          variant="ghost"
          disabled={!name.trim()}
          onClick={save}
          className="shrink-0 rounded-xl px-4 font-black uppercase tracking-wide text-xs bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] disabled:opacity-40"
        >
          {t('preset-save', { defaultValue: 'Save' })}
        </Button>
      </div>

      {presets.length === 0 ? (
        <p className="text-[10px] text-slice-text-light font-bold leading-snug">
          {t('preset-empty', {
            defaultValue:
              'No presets yet. Set your modifiers on a track, then come back and name the setup — it will be one tap to get back to it.',
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {presets.map((preset) => (
            <li key={preset.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="flex-1 min-w-0 text-left px-4 py-3 rounded-xl text-sm font-black text-slice-text-darker bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] truncate"
              >
                {preset.name}
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deletePreset(preset.id)}
                aria-label={t('preset-delete', {
                  defaultValue: 'Delete {{name}}',
                  name: preset.name,
                })}
                className="shrink-0 rounded-xl text-red-400 hover:text-red-500 font-black text-xs"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** A titled block. One shape for every section so the drawer reads as a list. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4">
    <h3 className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
      {title}
    </h3>
    {children}
  </div>
);

/** The inset card the slider/choice sections sit on. */
const Well = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-5">
    {children}
  </div>
);

interface SettingsPanelProps {
  onClose: () => void;
  onCalibrate: () => void;
}

export function SettingsPanel({ onClose, onCalibrate }: SettingsPanelProps) {
  const { t } = useTranslation(['r-slice-it', 'c-game']);

  const userName = useSliceItStore((s) => s.userName);
  const setUserName = useSliceItStore((s) => s.setUserName);
  const keybinds = useSliceItStore((s) => s.keybinds);
  const setKeybinds = useSliceItStore((s) => s.setKeybinds);
  const volume = useSliceItStore((s) => s.volume);
  const setVolume = useSliceItStore((s) => s.setVolume);
  const sfxVolume = useSliceItStore((s) => s.sfxVolume);
  const setSfxVolume = useSliceItStore((s) => s.setSfxVolume);
  const hitSound = useSliceItStore((s) => s.hitSound);
  const setHitSound = useSliceItStore((s) => s.setHitSound);
  const audioOffset = useSliceItStore((s) => s.audioOffset);
  const inputOffset = useSliceItStore((s) => s.inputOffset);
  const setInputOffset = useSliceItStore((s) => s.setInputOffset);
  const extraBinds = useSliceItStore((s) => s.extraBinds);
  const modifiers = useSliceItStore((s) => s.modifiers);
  const setModifiers = useSliceItStore((s) => s.setModifiers);
  const quantColors = useSliceItStore((s) => s.quantColors);
  const setQuantColors = useSliceItStore((s) => s.setQuantColors);
  const noteSkin = useSliceItStore((s) => s.noteSkin);
  const setNoteSkin = useSliceItStore((s) => s.setNoteSkin);
  const lanePalette = useSliceItStore((s) => s.lanePalette);
  const setLanePalette = useSliceItStore((s) => s.setLanePalette);
  const reducedFlash = useSliceItStore((s) => s.reducedFlash);
  const setReducedFlash = useSliceItStore((s) => s.setReducedFlash);
  const effectIntensity = useSliceItStore((s) => s.effectIntensity);
  const setEffectIntensity = useSliceItStore((s) => s.setEffectIntensity);
  const showJudgementsBelow = useSliceItStore((s) => s.showJudgementsBelow);
  const setShowJudgementsBelow = useSliceItStore((s) => s.setShowJudgementsBelow);
  const judgementScale = useSliceItStore((s) => s.judgementScale);
  const setJudgementScale = useSliceItStore((s) => s.setJudgementScale);
  const judgementOpacity = useSliceItStore((s) => s.judgementOpacity);
  const setJudgementOpacity = useSliceItStore((s) => s.setJudgementOpacity);
  const comboPosition = useSliceItStore((s) => s.comboPosition);
  const setComboPosition = useSliceItStore((s) => s.setComboPosition);
  const metronome = useSliceItStore((s) => s.metronome);
  const setMetronome = useSliceItStore((s) => s.setMetronome);
  const assistTick = useSliceItStore((s) => s.assistTick);
  const setAssistTick = useSliceItStore((s) => s.setAssistTick);
  const mirror = useSliceItStore((s) => s.mirror);
  const setMirror = useSliceItStore((s) => s.setMirror);
  const scrollSpeed = useSliceItStore((s) => s.scrollSpeed);
  const setScrollSpeed = useSliceItStore((s) => s.setScrollSpeed);
  const scrollMode = useSliceItStore((s) => s.scrollMode);
  const setScrollMode = useSliceItStore((s) => s.setScrollMode);
  const visibilityMode = useSliceItStore((s) => s.visibilityMode);
  const setVisibilityMode = useSliceItStore((s) => s.setVisibilityMode);
  const linePosition = useSliceItStore((s) => s.linePosition);
  const setLinePosition = useSliceItStore((s) => s.setLinePosition);

  const [previewingSound, setPreviewingSound] = React.useState<string | null>(null);
  const [loadingSound, setLoadingSound] = React.useState<string | null>(null);

  // What Shuffle previewed last, so tapping it repeatedly demonstrates the
  // no-repeat rule rather than accidentally contradicting it.
  const lastShuffled = React.useRef<string | null>(null);

  const previewHitSound = React.useCallback(async (soundId: string) => {
    const am = AudioManager.getInstance();
    am.initialize();
    const sfxVol = useSliceItStore.getState().sfxVolume / 100;
    if (soundId === DEFAULT_HIT_SOUND_ID) {
      setPreviewingSound(soundId);
      am.playSfX(880, 'triangle', 0.1, sfxVol);
      setTimeout(() => setPreviewingSound(null), 300);
      return;
    }
    // The button stays keyed by the option id — `random` highlights the
    // Shuffle tile, not whichever sample it happened to draw.
    let sample: string | null = soundId;
    if (soundId === RANDOM_HIT_SOUND_ID) {
      sample = pickHitSound(HIT_SOUND_SAMPLE_IDS, lastShuffled.current);
      lastShuffled.current = sample;
    }
    if (!sample) return;
    const url = asset(hitSoundPath(sample));
    if (!am.isHitSoundCached(url)) {
      setLoadingSound(soundId);
      try {
        await am.preloadHitSound(url);
      } catch {
        setLoadingSound(null);
        return;
      }
      setLoadingSound(null);
    }
    setPreviewingSound(soundId);
    am.playHitSoundFile(url, sfxVol);
    setTimeout(() => setPreviewingSound(null), 300);
  }, []);

  // I1 — a key bound to both lanes resolves to lane 0 and the other lane goes
  // dead. Shown rather than refused: a player mid-rebind holds a conflict for a
  // moment, and rejecting the keystroke is more confusing than naming the clash.
  const conflicts = conflictingBinds(keybinds, extraBinds);

  /**
   * A3 — one literal `t()` per palette rather than `t(\`lane-palette-${id}\`)`.
   *
   * `i18next-parser` cannot read a template-literal key, so the interpolated
   * form extracts to nothing and every locale falls back to the raw id
   * (`deuteranopia`) as its label. Keyed by `LanePaletteId`, so adding a palette
   * to `palettes.ts` is a type error here until it has a name.
   */
  const paletteLabels: Record<(typeof LANE_PALETTE_IDS)[number], string> = {
    default: t('lane-palette-default', { defaultValue: 'Default' }),
    deuteranopia: t('lane-palette-deuteranopia', { defaultValue: 'Blue / Orange' }),
    tritanopia: t('lane-palette-tritanopia', { defaultValue: 'Amber / Teal' }),
    monochrome: t('lane-palette-monochrome', { defaultValue: 'Brightness only' }),
  };

  const hitSoundCategories = React.useMemo(
    () => [...new Set(HIT_SOUND_OPTIONS.map((s) => s.category))],
    [],
  );

  return (
    <div className="absolute inset-0 z-80 bg-slice-bg p-5 sm:p-12 flex flex-col overflow-y-auto overflow-x-hidden">
      {/* `gap-3` + `min-w-0` + `shrink-0`, and the big type gated on width AND
          height — all four are one bug.

          `sm:text-5xl` alone is a WIDTH test, and a landscape phone (852×393)
          passes it with 393px of stage. "System Configuration" at `text-5xl` is
          ~564px of unbreakable words against a 144px CLOSE button, which
          overflowed the drawer horizontally: the heading ran under the button,
          both were clipped, and the whole panel scrolled sideways with its left
          edge — the operator field, the section labels — off screen. The auth
          splash in `MainMenu.tsx` carries the same width-AND-height guard for
          exactly this viewport. */}
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-12">
        <h2 className="min-w-0 text-xl [@media(min-width:640px)_and_(min-height:620px)]:text-5xl font-black text-slice-text tracking-tighter uppercase italic text-balance">
          {t('c-game:system-configuration', { defaultValue: 'System Configuration' })}
        </h2>
        <Button
          variant="ghost"
          className="shrink-0 bg-slice-bg shadow-[5px_5px_12px_var(--slice-shadow-dark),-5px_-5px_12px_var(--slice-shadow-light)] active:shadow-inner text-slice-text-muted hover:text-slice-text font-black uppercase tracking-[0.2em] px-5 [@media(min-width:640px)_and_(min-height:620px)]:px-10 h-10 [@media(min-width:640px)_and_(min-height:620px)]:h-16 rounded-2xl text-sm"
          onClick={onClose}
        >
          {t('c-game:close', { defaultValue: 'CLOSE' })}
        </Button>
      </div>

      <div className="max-w-3xl mx-auto w-full space-y-8 sm:space-y-12">
        <Section title={t('c-game:authorized-operator', { defaultValue: 'Authorized Operator' })}>
          <input
            type="text"
            className="w-full bg-slice-bg shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] rounded-2xl p-6 text-xl font-bold text-slice-text focus:outline-none transition-shadow"
            placeholder={t('c-game:enter-name', { defaultValue: 'Enter name' })}
            aria-label={t('c-game:authorized-operator', { defaultValue: 'Authorized Operator' })}
            maxLength={32}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </Section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          <Section title={t('c-game:audio-output-level', { defaultValue: 'Audio Output Level' })}>
            <div className="bg-slice-bg p-8 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-6">
              <div className="flex justify-between text-sm font-black text-slice-text-darker">
                <span>{t('c-game:master', { defaultValue: 'Master' })}</span>
                <span className="text-blue-500 font-mono tabular-nums">{volume}%</span>
              </div>
              <Slider
                value={[volume]}
                max={100}
                step={1}
                onValueChange={(vals) => setVolume(vals[0])}
                aria-label={t('c-game:master', { defaultValue: 'Master' })}
              />

              <div className="flex justify-between text-sm font-black text-slice-text-darker pt-4">
                <span>{t('c-game:effects', { defaultValue: 'Effects' })}</span>
                <span className="text-blue-500 font-mono tabular-nums">{sfxVolume}%</span>
              </div>
              <Slider
                value={[sfxVolume]}
                max={100}
                step={1}
                onValueChange={(vals) => setSfxVolume(vals[0])}
                aria-label={t('c-game:effects', { defaultValue: 'Effects' })}
              />
            </div>
          </Section>

          <Section title={t('c-game:input-mapping', { defaultValue: 'Input Mapping' })}>
            <div className="space-y-4">
              <KeybindInput
                label={t('c-game:lane-a', { defaultValue: 'Lane A' })}
                value={keybinds.lane1}
                onChange={(k) => setKeybinds({ ...keybinds, lane1: k })}
              />
              <KeybindInput
                label={t('c-game:lane-b', { defaultValue: 'Lane B' })}
                value={keybinds.lane2}
                onChange={(k) => setKeybinds({ ...keybinds, lane2: k })}
              />
            </div>

            {/* I1 — more than one key per lane. */}
            <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] space-y-3">
              <p className="text-[10px] text-slice-text-light font-bold leading-snug">
                {t('extra-binds-hint', {
                  defaultValue:
                    'A lane can answer to more than one key. Alternating two keys on one lane is how a fast jack is played.',
                })}
              </p>
              <ExtraBindRow lane={0} />
              <ExtraBindRow lane={1} />
              {conflicts.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-wider text-red-400">
                  {t('extra-binds-conflict', {
                    defaultValue: 'Bound to both lanes, so Lane B never sees it: {{binds}}',
                    binds: conflicts.map(formatBind).join(', '),
                  })}
                </p>
              )}
            </div>

            {/* A6 / I5 — input latency, separate from the audio offset. The
                calibration screen writes the audio one; this is the hand. */}
            <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] space-y-3">
              <OffsetStepper
                label={t('input-offset', { defaultValue: 'Input Offset' })}
                value={inputOffset}
                step={5}
                onChange={setInputOffset}
              />
              <p className="text-[10px] text-slice-text-light font-bold leading-snug">
                {t('input-offset-hint', {
                  defaultValue:
                    'Shifts when your press is judged, without moving the music. Positive if you consistently read EARLY — the audio offset is for the other half, and calibration sets that one.',
                })}
              </p>
            </div>

            <div className="pt-2">
              <Button
                className="w-full h-16 bg-slice-bg text-slice-text-darker shadow-[8px_8px_16px_var(--slice-shadow-dark),-8px_-8px_16px_var(--slice-shadow-light)] active:shadow-inner rounded-2xl font-black text-sm tracking-widest uppercase transition"
                onClick={onCalibrate}
              >
                {t('c-game:calibrate-synchronization', {
                  defaultValue: 'Calibrate Synchronization',
                })}
              </Button>
              <div className="text-center text-[10px] text-slice-text-light font-mono mt-3 uppercase tracking-[0.2em]">
                Offset: {audioOffset}ms
              </div>
            </div>
          </Section>
        </div>

        <Section title={t('gameplay', { defaultValue: 'Gameplay' })}>
          <div className="space-y-3">
            <ToggleRow
              label={t('health-gauge', { defaultValue: 'Health Gauge' })}
              description={t('health-gauge-hint', {
                defaultValue:
                  'Misses drain a gauge. Solo, emptying it ends the run; in a match it only costs the bonus. Worth a score multiplier.',
              })}
              value={modifiers.healthGauge}
              onChange={(next) => setModifiers({ ...modifiers, healthGauge: next })}
            />
            <ToggleRow
              label={t('quant-colors', { defaultValue: 'Rhythm Colours' })}
              description={t('quant-colors-hint', {
                defaultValue:
                  'Colour notes by where they land in the beat — red on the beat, blue on eighths, purple on triplets, yellow on sixteenths.',
              })}
              value={quantColors}
              onChange={setQuantColors}
            />
            <ToggleRow
              label={t('mod-mirror', { defaultValue: 'Mirror' })}
              description={t('mod-mirror-hint', {
                defaultValue:
                  'Swap every lane. Not harder, so it earns no score bonus — it just turns every chart into a second chart to practise on.',
              })}
              value={mirror}
              onChange={setMirror}
            />
            {/* M6 — same family as Health Gauge above: a fail condition the
                player opts into, not a thing that happens to them. */}
            <ToggleRow
              label={t('mod-perfectionist', { defaultValue: 'Perfectionist' })}
              description={t('mod-perfectionist-hint', {
                defaultValue:
                  'Anything short of PERFECT ends the run — not just a MISS. Same family as Sudden Death, and mutually exclusive with it: turning this on turns that off. The biggest score bonus in the game.',
              })}
              value={!!modifiers.perfectionist}
              onChange={(next) => setModifiers({ ...modifiers, perfectionist: next })}
            />
          </div>
        </Section>

        {/* P4 — the two guide sounds. Learning tools, so they sit together and
            away from the modifier list: neither changes the chart or the score,
            and grouping them with the challenge switches implies they do. */}
        <Section title={t('practice-aids', { defaultValue: 'Practice Aids' })}>
          <div className="space-y-3">
            <ToggleRow
              label={t('metronome', { defaultValue: 'Metronome' })}
              description={t('metronome-hint', {
                defaultValue:
                  'A click on every beat, whether or not there is a note there. The fastest way to hear that you are rushing a section rather than misreading it.',
              })}
              value={metronome}
              onChange={setMetronome}
            />
            <ToggleRow
              label={t('assist-tick', { defaultValue: 'Assist Tick' })}
              description={t('assist-tick-hint', {
                defaultValue:
                  'A click on every note at the moment it should be hit, played whether you hit it or not — so a missed note still tells you where it was.',
              })}
              value={assistTick}
              onChange={setAssistTick}
            />
          </div>
        </Section>

        {/* A9 — Lenient Timing and the windows it produces. Kept as its own
            section rather than folded into Gameplay: the whole point is to
            make the abstraction visible, and a toggle sitting right above
            the numbers it changes is what makes that legible. */}
        <Section title={t('timing-windows', { defaultValue: 'Judgement Windows' })}>
          <div className="space-y-3">
            <ToggleRow
              label={t('mod-lenient-timing', { defaultValue: 'Lenient Timing' })}
              description={t('mod-lenient-timing-hint', {
                defaultValue:
                  'Widens every window instead of shrinking it — the mirror of Strict Timing. Unranked: a run played on wider windows is not comparable to one played on the stock ones, not because it is any less real.',
              })}
              value={!!modifiers.lenientTiming}
              onChange={(next) => setModifiers({ ...modifiers, lenientTiming: next })}
            />
            <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
              <div className="text-[10px] text-slice-text-light font-bold leading-snug mb-3">
                {t('timing-windows-hint', {
                  defaultValue:
                    'The actual size of each window right now, at this speed and these modifiers.',
                })}
              </div>
              <dl className="space-y-1.5">
                {Object.entries(HIT_WINDOWS).map(([name, seconds]) => (
                  <div key={name} className="flex items-center justify-between gap-3">
                    <dt
                      className="text-[10px] font-black uppercase tracking-wider"
                      style={{ color: JUDGEMENT_COLORS[name as keyof typeof JUDGEMENT_COLORS] }}
                    >
                      {name}
                    </dt>
                    <dd className="font-mono text-xs font-bold text-slice-text-darker tabular-nums">
                      ±{Math.round(seconds * timingScale(modifiers) * 1000)} ms
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Section>

        {/* Scroll Speed (G9) and the judgement line (G11) — both are "where on
            screen does a note spend its approach", so they read together. */}
        <Section title={t('scroll-speed', { defaultValue: 'Scroll Speed' })}>
          <Well>
            <ChoiceRow
              label={t('scroll-speed-mode', { defaultValue: 'Mode' })}
              description={t('scroll-speed-mode-hint', {
                defaultValue:
                  "Constant keeps the same pace on every song. BPM-locked scales the pace with each song's tempo, so beat spacing looks the same everywhere.",
              })}
              value={scrollMode}
              options={[
                {
                  id: 'constant' as const,
                  label: t('scroll-speed-mode-constant', { defaultValue: 'Constant' }),
                },
                {
                  id: 'bpm' as const,
                  label: t('scroll-speed-mode-bpm', { defaultValue: 'BPM-Locked' }),
                },
              ]}
              onChange={setScrollMode}
            />
            <SliderRow
              label={t('scroll-speed-value', { defaultValue: 'Speed' })}
              value={scrollSpeed}
              min={MIN_SCROLL_SPEED}
              max={MAX_SCROLL_SPEED}
              step={0.1}
              format={(v) => `x${v.toFixed(1)}`}
              onChange={setScrollSpeed}
            />
            {/* G11 — how far in from the edge the judgement line sits. Scroll
                speed decides how LONG a note is visible; this decides where on
                screen that time is spent. */}
            <SliderRow
              label={t('line-position', { defaultValue: 'Judgement line' })}
              description={t('line-position-hint', {
                defaultValue:
                  'How far in from the edge the hit line sits. Further in gives you more runway to read the approach and less room after it.',
              })}
              value={linePosition}
              min={MIN_LINE_POSITION}
              max={MAX_LINE_POSITION}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setLinePosition}
            />
          </Well>
        </Section>

        {/* Visibility (M3) — only meaningful while Invisible is on; the
            toggle itself lives in the per-song modifier picker. */}
        {modifiers.invisible && (
          <Section title={t('visibility-mode', { defaultValue: 'Visibility' })}>
            <Well>
              <ChoiceRow
                label={t('visibility-mode-label', { defaultValue: 'Effect' })}
                description={t('visibility-mode-hint', {
                  defaultValue:
                    'Which way the Invisible modifier hides notes. Lane Cover is tuned live from the in-run pause menu, where the reaction window is shown in milliseconds.',
                })}
                value={visibilityMode}
                options={[
                  {
                    id: 'fadeOut' as const,
                    label: t('visibility-mode-fadeout', { defaultValue: 'Fade Out' }),
                  },
                  {
                    id: 'fadeIn' as const,
                    label: t('visibility-mode-fadein', { defaultValue: 'Fade In' }),
                  },
                  {
                    id: 'flashlight' as const,
                    label: t('visibility-mode-flashlight', { defaultValue: 'Flashlight' }),
                  },
                  {
                    id: 'laneCover' as const,
                    label: t('visibility-mode-lanecover', { defaultValue: 'Lane Cover' }),
                  },
                ]}
                onChange={setVisibilityMode}
              />
            </Well>
          </Section>
        )}

        <Section title={t('note-skin', { defaultValue: 'Note Skin' })}>
          <Well>
            <ChoiceRow
              label={t('note-skin-label', { defaultValue: 'Note style' })}
              description={t('note-skin-hint', {
                defaultValue:
                  'Notation draws each tap as the note it is — a head, a stem, and a flag per subdivision — so the rhythm reads from the shape and not only from the colour. Every skin keeps the same hit target.',
              })}
              value={noteSkin}
              options={[
                { id: 'default', label: t('skin-notation', { defaultValue: 'Notation' }) },
                { id: 'keys', label: t('skin-keys', { defaultValue: 'Keys' }) },
                { id: 'orbs', label: t('skin-orbs', { defaultValue: 'Orbs' }) },
                { id: 'arrows', label: t('skin-arrows', { defaultValue: 'Arrows' }) },
                { id: 'minimal', label: t('skin-minimal', { defaultValue: 'Minimal' }) },
              ].filter((option) => FREE_SKIN_IDS.includes(option.id))}
              onChange={setNoteSkin}
            />
          </Well>
        </Section>

        {/* A2 / A3 / A7 — the comfort axis. Grouped and named as accessibility
            rather than scattered through the cosmetic sections: a player who
            needs one of these needs to be able to find all three, and the game
            declares `descriptors: ['flashing']` in the catalog with — until now
            — nothing in the UI to turn it off. */}
        <Section title={t('accessibility', { defaultValue: 'Accessibility & Comfort' })}>
          <Well>
            {/* A3 — the palette outranks the skin's own colours by design; see
                `lanePalette` in the store. */}
            <ChoiceRow
              label={t('lane-palette', { defaultValue: 'Lane colours' })}
              description={t('lane-palette-hint', {
                defaultValue:
                  'Colour-vision-safe lane pairs. Each one is separated in brightness as well as hue, because two mid-tone blobs moving at speed are hard to tell apart however different their colour is. Overrides the skin.',
              })}
              value={lanePalette}
              options={LANE_PALETTE_IDS.map((id) => ({ id, label: paletteLabels[id] }))}
              onChange={setLanePalette}
            />
          </Well>
          <div className="space-y-3">
            <ToggleRow
              label={t('reduced-flash', { defaultValue: 'Reduced Flash' })}
              description={t('reduced-flash-hint', {
                defaultValue:
                  'Caps how much the screen may brighten between frames and drops the decorative flashes entirely. Separate from the performance tier — a fast machine still gets the full effect unless you turn this on.',
              })}
              value={reducedFlash}
              onChange={setReducedFlash}
            />
          </div>
          <Well>
            <SliderRow
              label={t('effect-intensity', { defaultValue: 'Effect Intensity' })}
              description={t('effect-intensity-hint', {
                defaultValue:
                  'Scales screen shake, playfield rotation and particles together. At 0 the playfield holds still and only the notes move.',
              })}
              value={effectIntensity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setEffectIntensity}
            />
          </Well>
        </Section>

        {/* H9 — judgement popups and the combo counter. */}
        <Section title={t('hud', { defaultValue: 'HUD' })}>
          <Well>
            <ChoiceRow
              label={t('judgement-floor', { defaultValue: 'Show judgements down to' })}
              description={t('judgement-floor-hint', {
                defaultValue:
                  'The worst judgement that still gets a popup. Set it to GREAT and MARVELOUS/PERFECT stop firing — on a good run those two are constant, carry no information, and sit on top of the notes behind them.',
              })}
              value={showJudgementsBelow}
              options={JUDGEMENT_ORDER.map((judgement) => ({
                id: judgement as string,
                label: judgement,
              }))}
              onChange={setShowJudgementsBelow}
            />
            <SliderRow
              label={t('judgement-scale', { defaultValue: 'Popup size' })}
              value={judgementScale}
              min={0.5}
              max={1.5}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setJudgementScale}
            />
            <SliderRow
              label={t('judgement-opacity', { defaultValue: 'Popup opacity' })}
              value={judgementOpacity}
              min={0.2}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setJudgementOpacity}
            />
            <ChoiceRow
              label={t('combo-position', { defaultValue: 'Combo counter' })}
              description={t('combo-position-hint', {
                defaultValue:
                  'Where the combo sits, or whether it appears at all. Centre is over the playfield, which is where it is most readable and most in the way.',
              })}
              value={comboPosition}
              options={[
                { id: 'center' as const, label: t('combo-center', { defaultValue: 'Centre' }) },
                { id: 'left' as const, label: t('combo-left', { defaultValue: 'Left' }) },
                { id: 'right' as const, label: t('combo-right', { defaultValue: 'Right' }) },
                { id: 'hidden' as const, label: t('combo-hidden', { defaultValue: 'Hidden' }) },
              ]}
              onChange={setComboPosition}
            />
          </Well>
        </Section>

        {/* M7 — named modifier presets. */}
        <Section title={t('modifier-presets', { defaultValue: 'Modifier Presets' })}>
          <Well>
            <p className="text-[10px] text-slice-text-light font-bold leading-snug">
              {t('modifier-presets-hint', {
                defaultValue:
                  'Save the modifiers you have selected right now under a name, and get back to them in one tap instead of re-toggling nine switches.',
              })}
            </p>
            <ModifierPresets />
          </Well>
        </Section>

        <Section title={t('c-game:hit-sound-effect', { defaultValue: 'Hit Sound Effect' })}>
          <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
            {hitSoundCategories.map((category) => (
              <div key={category} className="mb-4 last:mb-0">
                <div className="text-[9px] text-slice-text-light uppercase tracking-[0.3em] font-black mb-2 ml-1">
                  {category}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HIT_SOUND_OPTIONS.filter((s) => s.category === category).map((sound) => (
                    <button
                      key={sound.id}
                      type="button"
                      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                        hitSound === sound.id
                          ? 'bg-blue-500 text-white shadow-[3px_3px_8px_rgba(59,130,246,0.4),-3px_-3px_8px_var(--slice-shadow-light)]'
                          : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] hover:shadow-[1px_1px_3px_var(--slice-shadow-dark),-1px_-1px_3px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]'
                      }`}
                      onClick={() => {
                        setHitSound(sound.id);
                        previewHitSound(sound.id);
                      }}
                    >
                      <span className="truncate flex-1 text-left">{sound.label}</span>
                      <span
                        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-transform ${
                          previewingSound === sound.id ? 'scale-110' : ''
                        } ${
                          hitSound === sound.id
                            ? 'bg-blue-400/40 text-white'
                            : 'bg-slice-shadow-dark/60 text-slice-text-light group-hover:text-slice-text-darker'
                        }`}
                      >
                        {loadingSound === sound.id ? (
                          <svg
                            className="animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="10" opacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden
                          >
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
