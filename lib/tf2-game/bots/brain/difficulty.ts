/**
 * Bot skill by difficulty (tf_bot_difficulty 0–3). The reaction times and
 * aim tracking intervals are TFBot's (CTFBotVision::GetMinRecognizeTime,
 * CTFBotBody::GetHeadAimTrackingInterval); the rest are this port's knobs
 * for the same idea — easy bots are slow, sloppy and timid, expert bots
 * fast, precise and pushy.
 */

import type { BotDifficulty } from '../../net/events';

export interface BotSkill {
  /** Seconds from first seeing an enemy until the bot reacts (GetMinRecognizeTime). */
  reactionTime: number;
  /** Seconds between updates of where the bot thinks its target is (GetHeadAimTrackingInterval). */
  aimTrackInterval: number;
  /** Spread of the aim error, degrees (a scoped rifle takes a third of it). */
  aimErrorDeg: number;
  /** Fastest view turn, degrees per second. */
  turnRate: number;
  /** Full field of view, degrees (tf_bot_fov 90 at normal). */
  fov: number;
  /** 0…1: how readily it chases and pushes in instead of holding back. */
  aggression: number;
  /** Retreat for health below this fraction of max health (when not healed). */
  retreatHealth: number;
  /** Fraction of a full sniper charge it waits for before a body shot. */
  sniperCharge: number;
  /** Chance per second to see through a disguise of a spy it is looking at within 500 units. */
  spyNotice: number;
  /** Soldiers rocket-jump toward far goals. */
  rocketJumps: boolean;
  /** Chance a pyro notices an incoming projectile in time to reflect it. */
  airblastSkill: number;
  /** 0…1 of a projectile's lead it computes. */
  leadAccuracy: number;
  /** tf_bot class limits use this index (EASY 0 … EXPERT 3). */
  level: number;
}

export const BOT_SKILLS: Readonly<Record<BotDifficulty, BotSkill>> = {
  easy: {
    reactionTime: 1.0,
    aimTrackInterval: 1.0,
    aimErrorDeg: 4.5,
    turnRate: 300,
    fov: 90,
    aggression: 0.3,
    retreatHealth: 0.55,
    sniperCharge: 0.3,
    spyNotice: 0.02,
    rocketJumps: false,
    airblastSkill: 0.1,
    leadAccuracy: 0.3,
    level: 0,
  },
  normal: {
    reactionTime: 0.5,
    aimTrackInterval: 0.25,
    aimErrorDeg: 2.2,
    turnRate: 540,
    fov: 90,
    aggression: 0.5,
    retreatHealth: 0.45,
    sniperCharge: 0.5,
    spyNotice: 0.05,
    rocketJumps: false,
    airblastSkill: 0.35,
    leadAccuracy: 0.65,
    level: 1,
  },
  hard: {
    reactionTime: 0.3,
    aimTrackInterval: 0.1,
    aimErrorDeg: 1.2,
    turnRate: 800,
    fov: 100,
    aggression: 0.7,
    retreatHealth: 0.35,
    sniperCharge: 0.7,
    spyNotice: 0.1,
    rocketJumps: true,
    airblastSkill: 0.6,
    leadAccuracy: 0.85,
    level: 2,
  },
  expert: {
    reactionTime: 0.2,
    aimTrackInterval: 0.05,
    aimErrorDeg: 0.5,
    turnRate: 1200,
    fov: 110,
    aggression: 0.85,
    retreatHealth: 0.3,
    sniperCharge: 0.85,
    spyNotice: 0.2,
    rocketJumps: true,
    airblastSkill: 0.85,
    leadAccuracy: 1,
    level: 3,
  },
};

export function botSkill(d: BotDifficulty | undefined): BotSkill {
  return BOT_SKILLS[d ?? 'normal'] ?? BOT_SKILLS.normal;
}
