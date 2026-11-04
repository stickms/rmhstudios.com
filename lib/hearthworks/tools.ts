import type { HearthworksStore } from './store';

/** Apply the armed tool to a tile — what a click does in the isometric view and what Use does in third-person. */
export function applyToolAt(store: HearthworksStore, tx: number, tz: number): void {
  const { tool, dispatch } = store.getState();
  switch (tool.kind) {
    case 'build':
      dispatch({ type: 'place', kind: tool.building, x: tx, z: tz });
      break;
    case 'remove':
      dispatch({ type: 'remove', x: tx, z: tz });
      break;
    case 'plant':
      dispatch({ type: 'plant', crop: tool.crop, x: tx, z: tz });
      break;
    case 'harvest':
      dispatch({ type: 'harvest', x: tx, z: tz });
      break;
    case 'inspect':
    case 'hire':
      break;
  }
}

/** The tile an avatar standing at (x, z) and facing `yaw` is pointing at, just in front of its feet. */
export function tileInFront(x: number, z: number, yaw: number): { x: number; z: number } {
  return { x: Math.round(x + Math.sin(yaw) * 0.85), z: Math.round(z + Math.cos(yaw) * 0.85) };
}

/**
 * The thing a player means by "do something here". Walking up to a thing and using it: pick from a forest tile,
 * serve the customer standing there, collect from a machine. Otherwise it is the armed tool's job.
 */
export function interactAt(store: HearthworksStore, tx: number, tz: number): void {
  const { world, tool, dispatch } = store.getState();
  if (tool.kind === 'inspect') {
    const npc = world.npcs.find((n) => Math.round(n.x) === tx && Math.round(n.z) === tz);
    if (npc) return dispatch({ type: 'serve', npcId: npc.id });
    const b = world.buildings.find((o) => o.x === tx && o.z === tz);
    if (b?.kind === 'harvester') return dispatch({ type: 'collect', x: tx, z: tz });
    if (world.terrain[tz * world.size + tx] === 'forest') return dispatch({ type: 'forage', x: tx, z: tz });
    return;
  }
  if (tool.kind === 'hire') return dispatch({ type: 'hire', x: tx, z: tz });
  applyToolAt(store, tx, tz);
}
