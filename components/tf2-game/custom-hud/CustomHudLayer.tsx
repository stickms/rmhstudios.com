/**
 * A custom HUD's panels over the game, drawn by the HUD editor's own renderer
 * (lib/tf2-game/client/custom-hud/renderer.ts) from the live HUD state. One
 * canvas the size of the game area; it repaints only what changed, inside the
 * HUD store's own ≤30 Hz publish (no frame loop of its own).
 *
 * The canvas is decoration for assistive tech: the numbers it shows are also
 * in a polite live region, so a screen reader hears health and ammo as it
 * does with the default HUD.
 */
'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CustomHudRenderer, type PreparedHud } from '@/lib/tf2-game/client/custom-hud/renderer';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';

/**
 * The TF2 language strings the in-game panels name (`#TF_Ubercharge`, …), for when neither the HUD nor
 * the base ships `resource/tf_<language>.txt` (Valve's files are not redistributed). Keys are the
 * tokens, lower-case, without `#`. A HUD's own language file still wins.
 */
export function hudTokens(t: TFunction): Map<string, string> {
  return new Map([
    ['tf_ubercharge', t('hudtok_ubercharge', { defaultValue: 'ÜBERCHARGE' })],
    ['tf_uberchargeminhud', t('hudtok_ubercharge', { defaultValue: 'ÜBERCHARGE' })],
    ['tf_individualubercharges', t('hudtok_ubercharges', { defaultValue: 'ÜBERCHARGES' })],
    ['tf_individualuberchargesminhud', t('hudtok_ubercharges', { defaultValue: 'ÜBERCHARGES' })],
    ['tf_charge', t('hudtok_charge', { defaultValue: 'CHARGE' })],
    ['tf_ball', t('hudtok_ball', { defaultValue: 'BALL' })],
    ['freezepanel_killer', t('hudtok_killed_by', { defaultValue: 'You were killed by' })],
    ['freezepanel_item', t('hudtok_their_weapon', { defaultValue: 'Their weapon' })],
    ['winpanel_pointsthisround', t('hudtok_points_round', { defaultValue: 'Points this round' })],
    [
      'winpanel_killstreakleader',
      t('hudtok_streak_leader', { defaultValue: 'Longest kill streak' }),
    ],
    ['winpanel_killstreakmaxcount', t('hudtok_streak_count', { defaultValue: 'Kills' })],
    ['building_hud_building', t('hudtok_building', { defaultValue: 'Building…' })],
    [
      'building_hud_sentry_not_built',
      t('hudtok_sentry_not_built', { defaultValue: 'Sentry Gun not built' }),
    ],
    [
      'building_hud_dispenser_not_built',
      t('hudtok_dispenser_not_built', { defaultValue: 'Dispenser not built' }),
    ],
    ['building_hud_disp_sentry_not_built', t('hudtok_not_built', { defaultValue: 'Not built' })],
    [
      'building_hud_tele_not_built',
      t('hudtok_entrance_not_built', { defaultValue: 'Teleporter Entrance not built' }),
    ],
    [
      'building_hud_tele_exit_not_built',
      t('hudtok_exit_not_built', { defaultValue: 'Teleporter Exit not built' }),
    ],
    ['building_hud_sapper_not_built', t('hudtok_sapper', { defaultValue: 'Sapper' })],
    ['building_hud_sentry_upgrade', t('hudtok_upgrade', { defaultValue: 'Upgrade' })],
    ['building_hud_sentry_kills_assists', t('hudtok_kills', { defaultValue: 'Kills' })],
    ['building_hud_tele_charging', t('hudtok_charging', { defaultValue: 'Charging…' })],
    ['building_hud_tele_times_used', t('hudtok_times_used', { defaultValue: 'Times used' })],
  ]);
}

export default function CustomHudLayer({ hud, store }: { hud: PreparedHud; store: HudStore }) {
  const { t } = useTranslation('c-tf2-game');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CustomHudRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CustomHudRenderer(canvas);
    rendererRef.current = renderer;
    const host = canvas.parentElement ?? canvas;
    const measure = () => renderer.resize(host.clientWidth, host.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const unsub = store.subscribe(() => renderer.update(store.getSnapshot()));
    if (import.meta.env.DEV)
      (window as unknown as { __rmhCustomHud?: CustomHudRenderer }).__rmhCustomHud = renderer;
    return () => {
      unsub();
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [store]);

  const tokens = useMemo(() => hudTokens(t), [t]);
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setFallbackTokens(tokens);
    r.setHud(hud);
    r.update(store.getSnapshot(), true);
  }, [hud, store, tokens]);

  // What the canvas shows, for screen readers (health and ammo, as the default HUD announces them).
  const local = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().local,
    () => null,
  );
  const health = local?.alive ? local.health : null;
  const maxHealth = local?.maxHealth ?? 0;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="tf2g-custom-hud"
        aria-hidden="true"
        data-hud={hud.hud.meta.name}
      />
      {health !== null ? (
        <span className="sr-only" role="status">
          {t('health_aria', {
            defaultValue: 'Health {{health}} of {{max}}',
            health,
            max: maxHealth,
          })}
        </span>
      ) : null}
    </>
  );
}
