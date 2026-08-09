'use client';

/**
 * Remap every button.
 *
 * This screen **is** the `remappable-input` accessibility claim in
 * `lib/game-capabilities.ts` (§4.5). The honesty rule there says drop the claim
 * rather than ship it aspirationally, so everything the claim implies is here:
 * every action, every alternate, per-device profiles, conflict detection with a
 * swap offer instead of a silent steal, reset-to-defaults, and persistence that
 * survives a signed-out player closing the tab.
 *
 * Three things it gets right that a naive remap table gets wrong:
 *
 * 1. **It shows the DETECTED pad's glyphs.** A PlayStation player rebinding
 *    grab sees `R2`, not `RT` (§4.1). `glyphForBinding` is the single place
 *    that decides, so the table, the join card and the tutorial notes agree.
 * 2. **Aim is four bindings on a keyboard and one on a stick.** A key can only
 *    push one axis one way, so a keyboard alternate carries an `axis` and the
 *    rebind preserves it — otherwise remapping "aim left, left" would silently
 *    turn it into a whole-vector binding that does nothing.
 * 3. **Touch buttons are shown, not offered.** `btn-emote` IS the emote button
 *    on screen; "rebinding" it would rename a thing to itself. They are listed
 *    read-only, with a line saying so, rather than quietly missing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, X } from 'lucide-react';
import {
  ACTION_IDS,
  bindAction,
  glyphForBinding,
  pollGamepads,
  type ActionId,
  type Binding,
  type BindingConflict,
  type BindingSet,
  type DeviceProfileKind,
  type PadBrand,
} from '@/lib/bums-rush/input';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import { ScreenFrame } from './ScreenFrame';

interface BindingsScreenProps {
  /** Which profile is open, and the set it currently holds. */
  profile: DeviceProfileKind;
  onProfileChange: (profile: DeviceProfileKind) => void;
  bindingSet: BindingSet;
  onChange: (set: BindingSet) => void;
  onReset: () => void;
  padBrand: PadBrand;
  onBack: () => void;
}

type ListenTarget = { action: ActionId; slot: number } | null;

const PROFILE_ORDER: readonly DeviceProfileKind[] = ['keyboard-p1', 'keyboard-p2', 'gamepad', 'touch'];

/** Which sources a profile may capture. Touch captures nothing — see the header. */
const CAPTURES: Record<DeviceProfileKind, ReadonlyArray<Binding['source']>> = {
  'keyboard-p1': ['keyboard', 'mouse'],
  'keyboard-p2': ['keyboard'],
  gamepad: ['gamepad'],
  touch: [],
};

export function BindingsScreen({
  profile,
  onProfileChange,
  bindingSet,
  onChange,
  onReset,
  padBrand,
  onBack,
}: BindingsScreenProps) {
  const { t } = useTranslation('c-bums-rush');
  const [listening, setListening] = useState<ListenTarget>(null);
  const [conflicts, setConflicts] = useState<{ candidate: Binding; target: NonNullable<ListenTarget>; found: BindingConflict[] } | null>(null);

  const actionLabels = useMemo(() => buildActionLabels(t), [t]);
  const canCapture = CAPTURES[profile].length > 0;

  const apply = useCallback(
    (target: NonNullable<ListenTarget>, candidate: Binding, swap: boolean) => {
      const existing = bindingSet.bindings[target.action]?.[target.slot];
      // A keyboard key can only drive ONE component of an aim vector, so the
      // slot's axis travels with the slot rather than with the key.
      const withAxis: Binding =
        candidate.source === 'keyboard' && existing?.axis ? { ...candidate, axis: existing.axis } : candidate;

      const result = bindAction(bindingSet, target.action, target.slot, withAxis, { swapConflicts: swap });
      if (!result.applied) {
        setConflicts({ candidate: withAxis, target, found: result.conflicts });
        return;
      }
      setConflicts(null);
      onChange(result.set);
    },
    [bindingSet, onChange],
  );

  // ── Capture ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!listening) return undefined;
    const sources = CAPTURES[profile];

    const stop = () => setListening(null);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!sources.includes('keyboard')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        stop();
        return;
      }
      apply(listening, { source: 'keyboard', code: event.code }, false);
      stop();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!sources.includes('mouse') || event.pointerType !== 'mouse') return;
      // Only the buttons `mouse.ts` understands; anything else is a stray click
      // on the page and must not become a binding.
      if (event.button !== 0) return;
      event.preventDefault();
      apply(listening, { source: 'mouse', code: 'button0' }, false);
      stop();
    };

    let padTimer = 0;
    if (sources.includes('gamepad')) {
      const isAxisAction = listening.action === 'aimLeft' || listening.action === 'aimRight';
      padTimer = window.setInterval(() => {
        for (const pad of pollGamepads()) {
          if (!pad) continue;
          if (isAxisAction) {
            // A stick pushed decisively past the resting band is the gesture a
            // player makes when asked to "move the stick you want to use".
            if (Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > 0.7) {
              apply(listening, { source: 'gamepad', code: 'stick0' }, false);
              stop();
              return;
            }
            if (Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > 0.7) {
              apply(listening, { source: 'gamepad', code: 'stick1' }, false);
              stop();
              return;
            }
          }
          for (let i = 0; i < pad.buttons.length; i++) {
            if (!pad.buttons[i]?.pressed) continue;
            apply(listening, { source: 'gamepad', code: `button${i}` }, false);
            stop();
            return;
          }
        }
      }, 60);
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      if (padTimer) window.clearInterval(padTimer);
    };
  }, [listening, profile, apply]);

  const removeSlot = (action: ActionId, slot: number) => {
    const list = bindingSet.bindings[action] ?? [];
    onChange({
      ...bindingSet,
      bindings: { ...bindingSet.bindings, [action]: list.filter((_, i) => i !== slot) },
    });
  };

  return (
    <ScreenFrame
      title={t('bindings.title', { defaultValue: 'Controls' })}
      subtitle={t('bindings.sub', {
        defaultValue: 'Every action is remappable, and every device keeps its own map.',
      })}
      width="medium"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
      headerRight={
        <InkButton size="sm" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('bindings.reset', { defaultValue: 'Reset' })}
        </InkButton>
      }
    >
      <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
        <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <label htmlFor="bums-binding-profile" className="block text-sm font-medium text-bum-ink">
            {t('bindings.profile', { defaultValue: 'Device' })}
          </label>
          <select
            id="bums-binding-profile"
            value={profile}
            onChange={(event) => {
              setListening(null);
              setConflicts(null);
              onProfileChange(event.currentTarget.value as DeviceProfileKind);
            }}
            className="mt-1 w-full rounded-bum border-2 border-bum-ink bg-bum-surface px-3 py-2 text-sm text-bum-ink"
          >
            {PROFILE_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {t(`bindings.profile-${kind}`, { defaultValue: PROFILE_LABELS[kind] })}
              </option>
            ))}
          </select>
          {!canCapture ? (
            <p className="mt-2 text-xs text-bum-graphite">
              {t('bindings.touch-fixed', {
                defaultValue:
                  'Touch controls are the buttons drawn on screen, so there is nothing to point somewhere else. Change the layout in Settings instead.',
              })}
            </p>
          ) : null}
        </PaperCard>

        {conflicts ? (
          <StickyNote tone="highlight" className="rotate-[-0.7deg]">
            <p className="text-sm font-medium text-bum-ink">
              {t('bindings.conflict', {
                defaultValue: 'That is already used by {{action}}.',
                action: conflicts.found.map((c) => actionLabels[c.action]).join(', '),
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <InkButton
                size="sm"
                variant="primary"
                onClick={() => apply(conflicts.target, conflicts.candidate, true)}
              >
                {t('bindings.swap', { defaultValue: 'Take it anyway' })}
              </InkButton>
              <InkButton size="sm" onClick={() => setConflicts(null)}>
                {t('bindings.keep', { defaultValue: 'Leave it alone' })}
              </InkButton>
            </div>
          </StickyNote>
        ) : null}

        <PaperCard className="p-[clamp(0.5rem,2vmin,1rem)]">
          <ul className="divide-y divide-bum-paper-edge">
            {ACTION_IDS.map((action) => {
              const list = bindingSet.bindings[action] ?? [];
              return (
                <li key={action} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-[9rem] flex-1 text-sm font-medium text-bum-ink">
                    {actionLabels[action]}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {list.map((binding, slot) => {
                      const glyph = glyphForBinding(binding, padBrand);
                      const isListening =
                        listening?.action === action && listening.slot === slot;
                      return (
                        <span key={`${action}-${slot}`} className="flex items-center">
                          <button
                            type="button"
                            disabled={!canCapture}
                            onClick={() => {
                              setConflicts(null);
                              setListening({ action, slot });
                            }}
                            aria-label={t('bindings.rebind', {
                              defaultValue: 'Change {{action}} ({{current}})',
                              action: actionLabels[action],
                              current: t(glyph.labelKey, { defaultValue: glyph.label }),
                            })}
                            className="rounded-bum-sm border-2 border-bum-ink bg-bum-surface px-2 py-1 text-xs font-medium text-bum-ink transition-colors hover:bg-bum-paper-2 disabled:opacity-60 aria-[busy=true]:bg-bum-highlight"
                            aria-busy={isListening}
                          >
                            {isListening
                              ? t('bindings.listening', { defaultValue: 'Press…' })
                              : glyph.glyph}
                            {binding.axis ? (
                              <span className="ml-1 text-bum-graphite">{axisArrow(binding)}</span>
                            ) : null}
                          </button>
                          {canCapture ? (
                            <button
                              type="button"
                              onClick={() => removeSlot(action, slot)}
                              aria-label={t('bindings.remove', { defaultValue: 'Remove this binding' })}
                              className="ml-0.5 rounded-full p-1 text-bum-graphite transition-colors hover:text-bum-danger"
                            >
                              <X className="size-3" aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                    {canCapture ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConflicts(null);
                          setListening({ action, slot: list.length });
                        }}
                        aria-label={t('bindings.add', {
                          defaultValue: 'Add another button for {{action}}',
                          action: actionLabels[action],
                        })}
                        className="rounded-bum-sm border-2 border-dashed border-bum-graphite px-2 py-1 text-xs text-bum-graphite transition-colors hover:border-bum-ink hover:text-bum-ink"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                      </button>
                    ) : null}
                    {list.length === 0 && !canCapture ? (
                      <span className="text-xs text-bum-graphite">
                        {t('bindings.unbound', { defaultValue: 'Not bound' })}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </PaperCard>

        {listening ? (
          <p className="text-sm text-bum-graphite" role="status">
            {t('bindings.listening-hint', {
              defaultValue: 'Press the button you want. Escape cancels.',
            })}
          </p>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

const PROFILE_LABELS: Record<DeviceProfileKind, string> = {
  'keyboard-p1': 'Keyboard & mouse',
  'keyboard-p2': 'Keyboard — second player',
  gamepad: 'Controller',
  touch: 'Touch',
};

type Translate = (key: string, options: Record<string, unknown>) => string;

function buildActionLabels(t: Translate): Record<ActionId, string> {
  return {
    aimLeft: t('action.aim-left', { defaultValue: 'Aim left arm' }),
    aimRight: t('action.aim-right', { defaultValue: 'Aim right arm' }),
    grabLeft: t('action.grab-left', { defaultValue: 'Grab — left hand' }),
    grabRight: t('action.grab-right', { defaultValue: 'Grab — right hand' }),
    emote: t('action.emote', { defaultValue: 'Holler' }),
    useItem: t('action.use', { defaultValue: 'Use item' }),
    dropItem: t('action.drop', { defaultValue: 'Drop carried thing' }),
    toggleTags: t('action.tags', { defaultValue: 'Toggle name tags' }),
    pause: t('action.pause', { defaultValue: 'Pause' }),
    objectives: t('action.objectives', { defaultValue: 'Objectives' }),
  };
}

/** Which way a single-key axis binding pushes — the difference between W and S. */
function axisArrow(binding: Binding): string {
  if (!binding.axis) return '';
  if (binding.axis.index === 0) return binding.axis.sign === 1 ? '→' : '←';
  return binding.axis.sign === 1 ? '↓' : '↑';
}
