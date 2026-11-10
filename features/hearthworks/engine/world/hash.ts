/**
 * A fingerprint of the whole world, for tests and for a replica to prove it agrees with the host's. Keys are visited
 * in sorted order, so it does not matter in which order a snapshot decoder emitted them.
 */

function visit(v: unknown, out: string[]): void {
  if (Array.isArray(v)) {
    out.push('[');
    for (const x of v) {
      visit(x, out);
      out.push(',');
    }
    out.push(']');
  } else if (v !== null && typeof v === 'object') {
    out.push('{');
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined) continue;
      out.push(JSON.stringify(k), ':');
      visit(x, out);
      out.push(',');
    }
    out.push('}');
  } else out.push(JSON.stringify(v) ?? 'null');
}

/** FNV-1a (32-bit) over the canonical text of the world, as 8 hex digits. */
export function worldHash(world: unknown): string {
  const parts: string[] = [];
  visit(world, parts);
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
