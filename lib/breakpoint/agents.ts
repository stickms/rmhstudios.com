// ============================================================
// BREAKPOINT — Agents (classes) + abilities
// ============================================================
import type { AgentDef } from './types';

export const AGENTS: AgentDef[] = [
  {
    id: 'blaze',
    name: 'Blaze',
    role: 'duelist',
    color: '#ff6b35',
    blurb: 'Aggressive entry duelist. Dash in, burn them down, get out.',
    passive: { moveMul: 1.05 },
    abilities: [
      { id: 'blaze_dash', name: 'Afterburn', kind: 'dash', slot: 'Q', cost: 200, charges: 1, cooldown: 8, desc: 'Dash forward in the direction you face.', color: '#ff6b35' },
      { id: 'blaze_molly', name: 'Firewall', kind: 'molly', slot: 'C', cost: 200, charges: 1, desc: 'Throw a wall of fire that damages enemies inside.', color: '#ff9d35' },
      { id: 'blaze_flash', name: 'Flashpoint', kind: 'flash', slot: 'E', cost: 0, charges: 1, cooldown: 35, desc: 'Signature flash that blinds enemies in line of sight.', color: '#ffd35a' },
      { id: 'blaze_ult', name: 'Inferno', kind: 'shield', slot: 'X', cost: 0, charges: 1, ultPoints: 7, desc: 'ULT — Gain overshield and a damage surge for a short time.', color: '#ff3b2f' },
    ],
  },
  {
    id: 'warden',
    name: 'Warden',
    role: 'sentinel',
    color: '#16e0a3',
    blurb: 'Anchor and lockdown. Hold sites, heal allies, deny pushes.',
    passive: { hpBonus: 15 },
    abilities: [
      { id: 'warden_wall', name: 'Barricade', kind: 'wall', slot: 'C', cost: 300, charges: 1, desc: 'Deploy a solid wall of cover.', color: '#16e0a3' },
      { id: 'warden_heal', name: 'Mend', kind: 'heal', slot: 'Q', cost: 200, charges: 1, cooldown: 10, desc: 'Heal yourself over a few seconds.', color: '#4affd0' },
      { id: 'warden_recon', name: 'Watchtower', kind: 'recon', slot: 'E', cost: 0, charges: 1, cooldown: 40, desc: 'Signature scan that reveals nearby enemies.', color: '#9affe0' },
      { id: 'warden_ult', name: 'Lockdown', kind: 'molly', slot: 'X', cost: 0, charges: 1, ultPoints: 8, desc: 'ULT — Detonate a huge area, damaging all enemies caught inside.', color: '#00d488' },
    ],
  },
  {
    id: 'cipher',
    name: 'Cipher',
    role: 'controller',
    color: '#8a7bff',
    blurb: 'Map control through smokes. Cut sightlines, dictate the fight.',
    abilities: [
      { id: 'cipher_smoke', name: 'Veil', kind: 'smoke', slot: 'C', cost: 100, charges: 2, desc: 'Deploy a vision-blocking smoke cloud.', color: '#8a7bff' },
      { id: 'cipher_slow', name: 'Quicksand', kind: 'molly', slot: 'Q', cost: 200, charges: 1, desc: 'Lob a charge that damages enemies in the zone.', color: '#b3a9ff' },
      { id: 'cipher_flash', name: 'Paradise', kind: 'flash', slot: 'E', cost: 0, charges: 1, cooldown: 35, desc: 'Signature blinding burst.', color: '#d6cfff' },
      { id: 'cipher_ult', name: 'Blackout', kind: 'recon', slot: 'X', cost: 0, charges: 1, ultPoints: 7, desc: 'ULT — Reveal every living enemy on the map for a moment.', color: '#6a5bff' },
    ],
  },
  {
    id: 'echo',
    name: 'Echo',
    role: 'initiator',
    color: '#3ba9ff',
    blurb: 'Information and setup. Flash, scan, and clear the way for the team.',
    abilities: [
      { id: 'echo_recon', name: 'Pulse', kind: 'recon', slot: 'C', cost: 200, charges: 1, desc: 'Recon dart reveals enemies in an area.', color: '#3ba9ff' },
      { id: 'echo_flash', name: 'Strobe', kind: 'flash', slot: 'Q', cost: 200, charges: 2, desc: 'Throw a fast-popping flash.', color: '#8fd3ff' },
      { id: 'echo_dash', name: 'Blink', kind: 'dash', slot: 'E', cost: 0, charges: 1, cooldown: 30, desc: 'Signature short-range dash reposition.', color: '#c4e8ff' },
      { id: 'echo_ult', name: 'Overdrive', kind: 'flash', slot: 'X', cost: 0, charges: 1, ultPoints: 6, desc: 'ULT — Massive flash that blinds the whole enemy team in view.', color: '#1f8bff' },
    ],
  },
  {
    id: 'vesper',
    name: 'Vesper',
    role: 'sentinel',
    color: '#ffce4f',
    blurb: 'Self-sufficient lurker. Shield up, hold flanks, punish rotations.',
    abilities: [
      { id: 'vesper_shield', name: 'Bulwark', kind: 'shield', slot: 'Q', cost: 200, charges: 1, cooldown: 12, desc: 'Gain a temporary overshield.', color: '#ffce4f' },
      { id: 'vesper_smoke', name: 'Haze', kind: 'smoke', slot: 'C', cost: 100, charges: 1, desc: 'A small concealment smoke.', color: '#ffe08a' },
      { id: 'vesper_wall', name: 'Stronghold', kind: 'wall', slot: 'E', cost: 0, charges: 1, cooldown: 40, desc: 'Signature deployable wall.', color: '#ffd76b' },
      { id: 'vesper_ult', name: 'Last Stand', kind: 'heal', slot: 'X', cost: 0, charges: 1, ultPoints: 7, desc: 'ULT — Rapidly full-heal and overshield in place.', color: '#ffb800' },
    ],
  },
  {
    id: 'razor',
    name: 'Razor',
    role: 'duelist',
    color: '#ff4fa3',
    blurb: 'High-tempo flanker. Two dashes, a flash, and relentless pressure.',
    passive: { moveMul: 1.08 },
    abilities: [
      { id: 'razor_dash', name: 'Slipstream', kind: 'dash', slot: 'E', cost: 0, charges: 2, cooldown: 8, desc: 'Signature — two quick dashes.', color: '#ff4fa3' },
      { id: 'razor_flash', name: 'Dazzle', kind: 'flash', slot: 'Q', cost: 250, charges: 1, desc: 'Blinding burst grenade.', color: '#ff9ccd' },
      { id: 'razor_molly', name: 'Shrapnel', kind: 'molly', slot: 'C', cost: 200, charges: 1, desc: 'Damaging zone of shrapnel.', color: '#ff6bb5' },
      { id: 'razor_ult', name: 'Bloodrush', kind: 'shield', slot: 'X', cost: 0, charges: 1, ultPoints: 6, desc: 'ULT — Overshield + speed + faster fire for a window.', color: '#ff2e8a' },
    ],
  },
];

export const AGENT_MAP: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
);

export function getAgent(id: string): AgentDef {
  return AGENT_MAP[id] ?? AGENTS[0];
}

export const ROLE_LABEL: Record<string, string> = {
  duelist: 'DUELIST',
  sentinel: 'SENTINEL',
  controller: 'CONTROLLER',
  initiator: 'INITIATOR',
};
