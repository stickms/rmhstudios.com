// =============================================================================
// ALTAIR ENGINE -- Particle System
// =============================================================================
// Visual particle effects: damage numbers, death bursts, hit flashes,
// XP collection sparkles, level-up and evolution celebrations.
// =============================================================================

import { ParticleEntity, GameWorld, createId } from './types';

// ---- Update -----------------------------------------------------------------

/**
 * Advance all particles by `delta` seconds.
 * Expired particles are removed in-place.
 */
export function updateParticles(
  particles: ParticleEntity[],
  delta: number,
): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life -= delta;

    // Apply gravity / drag for non-text particles
    if (!p.text) {
      p.vy += 40 * delta; // gentle gravity
      p.vx *= 1 - 2 * delta; // drag
    } else {
      // Damage numbers float upward and slow down
      p.vy *= 1 - 3 * delta;
    }

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ---- Spawn helpers ----------------------------------------------------------

/**
 * Show a floating damage number above a position.
 * Critical hits are larger and coloured differently.
 */
export function spawnDamageNumber(
  world: GameWorld,
  x: number,
  y: number,
  amount: number,
  isCrit: boolean,
): void {
  const p: ParticleEntity = {
    id: createId(world),
    x: x + (Math.random() - 0.5) * 10,
    y: y - 10,
    vx: (Math.random() - 0.5) * 30,
    vy: -60 - Math.random() * 20,
    life: 0.8,
    maxLife: 0.8,
    color: isCrit ? '#ffdd00' : '#ffffff',
    radius: 0,
    text: Math.round(amount).toString(),
    fontSize: isCrit ? 18 : 14,
  };
  world.particles.push(p);
}

/**
 * Burst of coloured particles when an enemy dies.
 */
export function spawnDeathBurst(
  world: GameWorld,
  x: number,
  y: number,
  color: string,
  count: number = 8,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 60 + Math.random() * 80;
    const p: ParticleEntity = {
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color,
      radius: 2 + Math.random() * 2,
    };
    world.particles.push(p);
  }
}

/**
 * Quick white flash at point of impact.
 */
export function spawnHitFlash(
  world: GameWorld,
  x: number,
  y: number,
): void {
  const count = 3;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 40;
    const p: ParticleEntity = {
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.15,
      maxLife: 0.15,
      color: '#ffffff',
      radius: 2 + Math.random(),
    };
    world.particles.push(p);
  }
}

/**
 * Small green sparkles when XP is collected.
 */
export function spawnXPCollect(
  world: GameWorld,
  x: number,
  y: number,
): void {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 30;
    const p: ParticleEntity = {
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 0.3 + Math.random() * 0.2,
      maxLife: 0.5,
      color: '#44ff88',
      radius: 1.5 + Math.random(),
    };
    world.particles.push(p);
  }
}

/**
 * Celebratory burst when the player levels up.
 */
export function spawnLevelUp(
  world: GameWorld,
  x: number,
  y: number,
): void {
  const colors = ['#ffdd00', '#ffaa00', '#ffffff', '#88ddff'];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 100 + Math.random() * 60;
    const p: ParticleEntity = {
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1.0,
      color: colors[i % colors.length],
      radius: 2.5 + Math.random() * 2,
    };
    world.particles.push(p);
  }

  // "LEVEL UP!" text
  const text: ParticleEntity = {
    id: createId(world),
    x,
    y: y - 20,
    vx: 0,
    vy: -40,
    life: 1.2,
    maxLife: 1.2,
    color: '#ffdd00',
    radius: 0,
    text: 'LEVEL UP!',
    fontSize: 22,
  };
  world.particles.push(text);
}

/**
 * Dramatic burst when a weapon evolves.
 */
export function spawnEvolution(
  world: GameWorld,
  x: number,
  y: number,
): void {
  const colors = ['#dd44ff', '#8844ff', '#ffffff', '#ff44dd'];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 120 + Math.random() * 80;
    const p: ParticleEntity = {
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.5,
      maxLife: 1.3,
      color: colors[i % colors.length],
      radius: 3 + Math.random() * 3,
    };
    world.particles.push(p);
  }

  // "EVOLVED!" text
  const text: ParticleEntity = {
    id: createId(world),
    x,
    y: y - 20,
    vx: 0,
    vy: -35,
    life: 1.5,
    maxLife: 1.5,
    color: '#dd44ff',
    radius: 0,
    text: 'EVOLVED!',
    fontSize: 24,
  };
  world.particles.push(text);
}
