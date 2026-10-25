import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(resolve(import.meta.dirname, '../../docker-compose.yml'), 'utf8');

// One service's block: from "  name:" to the next two-space-indented key.
function service(name: string) {
  const start = compose.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) throw new Error(`No ${name} service in docker-compose.yml`);
  const rest = compose.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('node worker memory budgets', () => {
  // Without --max-old-space-size, Node caps the heap at roughly half the container
  // limit (~256 MB for 512m). The ladder pipeline runs at every boot when the last
  // scrape is stale, outgrew that, and the worker crash-looped on
  // "JavaScript heap out of memory" (RestartCount 14), failing every deploy's
  // worker health check.
  it('sizes the ladder-worker heap above the default and below its container limit', () => {
    const block = service('ladder-worker');
    const limit = Number(/mem_limit:\s*(\d+)m/.exec(block)?.[1]);
    const heap = Number(/NODE_OPTIONS=--max-old-space-size=(\d+)/.exec(block)?.[1]);
    expect(limit).toBeGreaterThan(0);
    expect(heap, 'ladder-worker must set --max-old-space-size').toBeGreaterThan(0);
    expect(heap).toBeGreaterThan(limit / 2);
    // Leave room for buffers, native code and the Prisma pool outside the V8 heap.
    expect(heap).toBeLessThanOrEqual(Math.floor(limit * 0.8));
  });
});
