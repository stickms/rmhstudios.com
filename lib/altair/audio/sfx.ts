// =============================================================================
// ALTAIR -- SFX Manager
// =============================================================================
// Centralized sound-effects playback for menu + gameplay responsiveness.
// Uses per-event variant pools, cooldown guards, and shared volume settings.
// =============================================================================

import { Howl, Howler } from 'howler';
import { useAltairSettingsStore } from '../stores/settings-store';
import { asset } from '@/lib/storage/asset';

export type AltairSfxEvent =
  | 'ui_click'
  | 'menu_hover'
  | 'menu_click'
  | 'menu_back'
  | 'menu_open'
  | 'menu_close'
  | 'menu_toggle'
  | 'ui_confirm'
  | 'ui_error'
  | 'shop_purchase'
  | 'shop_error'
  | 'upgrade_pick'
  | 'upgrade_reroll'
  | 'player_hit'
  | 'player_heal'
  | 'pickup_xp'
  | 'pickup_coin'
  | 'enemy_kill'
  | 'level_up'
  | 'boss_spawn'
  | 'boss_kill'
  | 'weapon_disabled'
  | 'pause'
  | 'resume'
  | 'revive'
  | 'victory'
  | 'defeat';

interface EventDef {
  sources: string[];
  gain: number;
  cooldownMs?: number;
  rateMin?: number;
  rateMax?: number;
}

const P1 = asset('/music/altair/sound/hzsmith/pack-1');
const P2 = asset('/music/altair/sound/hzsmith/pack-2');
const P3 = asset('/music/altair/sound/hzsmith/pack-3');
const P4 = asset('/music/altair/sound/hzsmith/pack-4');

// Event map: gameplay + menu actions with relative loudness tiers.
const EVENTS: Record<AltairSfxEvent, EventDef> = {
  ui_click: {
    // Single shared click for all UI buttons.
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 35,
    rateMin: 0.99,
    rateMax: 1.01,
  },
  menu_hover: {
    sources: [`${P2}/Click_Lock_Beep_1.ogg`, `${P2}/Click_Lock_Beep_2.ogg`, `${P2}/Click_Lock_Beep_3.ogg`],
    gain: 0.14,
    cooldownMs: 70,
    rateMin: 0.98,
    rateMax: 1.04,
  },
  menu_click: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 40,
    rateMin: 0.99,
    rateMax: 1.01,
  },
  menu_back: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 60,
  },
  menu_open: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 100,
  },
  menu_close: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 100,
  },
  menu_toggle: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.14,
    cooldownMs: 70,
    rateMin: 0.99,
    rateMax: 1.01,
  },
  ui_confirm: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 60,
  },
  ui_error: {
    sources: [`${P2}/Error_Action_1.ogg`, `${P2}/Error_Action_2.ogg`, `${P2}/Error_Action_3.ogg`],
    gain: 0.42,
    cooldownMs: 90,
  },
  shop_purchase: {
    sources: [`${P4}/Collect_Coin_Bag_1.ogg`, `${P4}/Collect_Coin_Bag_2.ogg`, `${P4}/Collect_Coin_Bag_3.ogg`],
    gain: 0.28,
    cooldownMs: 120,
  },
  shop_error: {
    sources: [`${P3}/Shop_Not_Enough_1.ogg`, `${P3}/Shop_Not_Enough_2.ogg`, `${P3}/Shop_Not_Enough_3.ogg`],
    gain: 0.45,
    cooldownMs: 120,
  },
  upgrade_pick: {
    sources: [`${P4}/Collect_Bonus_Item_1.ogg`, `${P4}/Collect_Bonus_Item_2.ogg`, `${P4}/Collect_Bonus_Item_3.ogg`],
    gain: 0.34,
    cooldownMs: 90,
  },
  upgrade_reroll: {
    sources: [`${P1}/Dice_Throw_1.ogg`, `${P1}/Dice_Throw_2.ogg`, `${P1}/Dice_Throw_3.ogg`],
    gain: 0.24,
    cooldownMs: 140,
  },
  player_hit: {
    sources: [`${P1}/Hit_Surprise_1.ogg`, `${P1}/Hit_Surprise_2.ogg`, `${P1}/Hit_Surprise_3.ogg`],
    gain: 0.4,
    cooldownMs: 80,
  },
  player_heal: {
    sources: [`${P4}/Collect_Health_1.ogg`, `${P4}/Collect_Health_2.ogg`, `${P4}/Collect_Health_3.ogg`],
    gain: 0.26,
    cooldownMs: 100,
  },
  pickup_xp: {
    sources: [`${P4}/Collect_Points_1.ogg`, `${P4}/Collect_Points_2.ogg`, `${P4}/Collect_Points_3.ogg`],
    gain: 0.11,
    cooldownMs: 70,
    rateMin: 0.96,
    rateMax: 1.06,
  },
  pickup_coin: {
    sources: [`${P4}/Collect_Small_Coin_1.ogg`, `${P4}/Collect_Small_Coin_2.ogg`, `${P4}/Collect_Small_Coin_3.ogg`],
    gain: 0.14,
    cooldownMs: 80,
    rateMin: 0.96,
    rateMax: 1.05,
  },
  enemy_kill: {
    sources: [`${P3}/Tube_Kick_1.ogg`, `${P3}/Tube_Kick_2.ogg`, `${P3}/Tube_Kick_3.ogg`],
    gain: 0.12,
    cooldownMs: 110,
    rateMin: 0.98,
    rateMax: 1.05,
  },
  level_up: {
    sources: [`${P4}/Collect_Power_1.ogg`, `${P4}/Collect_Power_2.ogg`, `${P4}/Collect_Power_3.ogg`],
    gain: 0.38,
    cooldownMs: 200,
  },
  boss_spawn: {
    sources: [`${P3}/Delay_Allert_1.ogg`, `${P3}/Delay_Allert_2.ogg`, `${P3}/Delay_Allert_3.ogg`],
    gain: 0.72,
    cooldownMs: 400,
  },
  boss_kill: {
    sources: [`${P3}/Transition_Show_1.ogg`, `${P3}/Transition_Show_2.ogg`, `${P3}/Transition_Show_3.ogg`],
    gain: 0.68,
    cooldownMs: 400,
  },
  weapon_disabled: {
    sources: [`${P2}/Error_Buzz_1.ogg`, `${P2}/Error_Buzz_2.ogg`, `${P2}/Error_Buzz_3.ogg`],
    gain: 0.56,
    cooldownMs: 180,
  },
  pause: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 120,
  },
  resume: {
    sources: [`${P2}/Click_Lock_Beep_2.ogg`],
    gain: 0.16,
    cooldownMs: 120,
  },
  revive: {
    sources: [`${P4}/Collect_Bonus_Item_1.ogg`, `${P4}/Collect_Bonus_Item_2.ogg`, `${P4}/Collect_Bonus_Item_3.ogg`],
    gain: 0.42,
    cooldownMs: 200,
  },
  victory: {
    sources: [`${P3}/Stereo_Power_Up_1.ogg`, `${P3}/Stereo_Power_Up_2.ogg`, `${P3}/Stereo_Power_Up_3.ogg`],
    gain: 0.68,
    cooldownMs: 800,
  },
  defeat: {
    sources: [`${P1}/Fail_Game_1.ogg`, `${P1}/Fail_Game_2.ogg`, `${P1}/Fail_Game_3.ogg`],
    gain: 0.66,
    cooldownMs: 800,
  },
};

const loaded: Partial<Record<AltairSfxEvent, Howl[]>> = {};
const lastPlayedAt: Partial<Record<AltairSfxEvent, number>> = {};
const lastVariant: Partial<Record<AltairSfxEvent, number>> = {};
let lastResumeAttempt = 0;
let sfxEnabled = false;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function tryResumeAudioContext(): void {
  const now = Date.now();
  if (now - lastResumeAttempt < 1000) return;
  lastResumeAttempt = now;
  try {
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // Ignore context resume failures; browser gesture rules vary.
  }
}

function getEventVolume(event: AltairSfxEvent, gainMul = 1): number {
  const { masterVolume, sfxVolume } = useAltairSettingsStore.getState();
  const base = EVENTS[event].gain;
  return clamp01(masterVolume * sfxVolume * base * gainMul);
}

function ensureLoaded(event: AltairSfxEvent): Howl[] {
  if (loaded[event]) return loaded[event]!;

  const howls = EVENTS[event].sources.map((src) => new Howl({
    src: [src],
    html5: false,
    preload: true,
    volume: getEventVolume(event),
    onplayerror(this: Howl) {
      tryResumeAudioContext();
      this.once('unlock', () => this.play());
    },
    onloaderror() {
      // Keep this non-throwing so one bad asset doesn't break all SFX.
    },
  }));
  loaded[event] = howls;
  return howls;
}

function pickVariant(event: AltairSfxEvent): { howl: Howl; index: number } {
  const variants = ensureLoaded(event);
  if (variants.length === 1) return { howl: variants[0], index: 0 };

  const previous = lastVariant[event] ?? -1;
  let index = Math.floor(Math.random() * variants.length);
  if (index === previous) {
    index = (index + 1) % variants.length;
  }
  lastVariant[event] = index;
  return { howl: variants[index], index };
}

function randomRate(event: AltairSfxEvent): number | null {
  const def = EVENTS[event];
  if (def.rateMin === undefined || def.rateMax === undefined) return null;
  if (def.rateMin >= def.rateMax) return def.rateMin;
  return def.rateMin + Math.random() * (def.rateMax - def.rateMin);
}

export const altairSfx = {
  isEnabled(): boolean {
    return sfxEnabled;
  },

  enable(): void {
    sfxEnabled = true;
  },

  disable(): void {
    sfxEnabled = false;
    this.unload();
  },

  supportsOgg(): boolean {
    if (typeof Audio === 'undefined') return true;
    try {
      const probe = new Audio();
      return !!probe.canPlayType('audio/ogg; codecs="vorbis"');
    } catch {
      return false;
    }
  },

  prime(): void {
    if (!sfxEnabled) return;
    tryResumeAudioContext();
    // Warm up the most common menu sounds so first interaction is responsive.
    const warmEvents: AltairSfxEvent[] = ['ui_click', 'menu_toggle'];
    for (const ev of warmEvents) {
      for (const howl of ensureLoaded(ev)) {
        howl.load();
      }
    }
  },

  play(event: AltairSfxEvent, gainMul = 1): void {
    if (!sfxEnabled) return;
    tryResumeAudioContext();
    const volume = getEventVolume(event, gainMul);
    if (volume <= 0) return;

    const def = EVENTS[event];
    const now = Date.now();
    const last = lastPlayedAt[event] ?? 0;
    if (def.cooldownMs && now - last < def.cooldownMs) return;
    lastPlayedAt[event] = now;

    const { howl } = pickVariant(event);
    const soundId = howl.play();
    howl.volume(volume, soundId);

    const rate = randomRate(event);
    if (rate !== null) {
      howl.rate(rate, soundId);
    }
  },

  updateVolume(): void {
    if (!sfxEnabled) return;
    (Object.keys(loaded) as AltairSfxEvent[]).forEach((event) => {
      const eventHowls = loaded[event];
      if (!eventHowls) return;
      const v = getEventVolume(event);
      for (const howl of eventHowls) {
        howl.volume(v);
      }
    });
  },

  unload(): void {
    (Object.keys(loaded) as AltairSfxEvent[]).forEach((event) => {
      const eventHowls = loaded[event];
      if (!eventHowls) return;
      for (const howl of eventHowls) {
        howl.stop();
        howl.unload();
      }
      delete loaded[event];
    });
  },
};
