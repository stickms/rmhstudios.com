/** Seeded randomness for recipes and the generative music planner (no Math.random — plan convention). */
export { mulberry32 } from '../assets/rng';

/** FNV-1a over a string and a variant → a 32-bit seed. */
export function seedFor(name: string, variant = 0): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= variant + 0x9e3779b9;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 15;
  return h >>> 0;
}
