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
      break;
  }
}

/** The tile an avatar standing at (x, z) and facing `yaw` is pointing at, just in front of its feet. */
export function tileInFront(x: number, z: number, yaw: number): { x: number; z: number } {
  return { x: Math.round(x + Math.sin(yaw) * 0.85), z: Math.round(z + Math.cos(yaw) * 0.85) };
}
