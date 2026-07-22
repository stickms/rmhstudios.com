import { beforeEach, describe, it, expect } from 'vitest';
import {
  BODY_CAP,
  registerBody,
  liveBodies,
  liveCount,
  anyActive,
  onRegistryChange,
  resetRegistry,
} from '@/lib/liquid-gl/registry';

beforeEach(() => resetRegistry());

describe('liquid body registry', () => {
  it('starts empty', () => {
    expect(liveCount()).toBe(0);
    expect(anyActive()).toBe(false);
  });

  it('registers a body with defaults and a monotonic id', () => {
    const a = registerBody('capsule', 3);
    const b = registerBody('droplet', 3);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(liveCount()).toBe(2);
    expect(a!.id).toBe(1);
    expect(b!.id).toBe(2);
    const body = liveBodies()[0];
    expect(body.kind).toBe('capsule');
    expect(body.group).toBe(3);
    expect(body.press).toBe(0);
    expect(body.active).toBe(false);
  });

  it('set() mutates the pooled body in place (through the stable handle)', () => {
    const h = registerBody('capsule', 1)!;
    h.set({ cx: 100, cy: 50, hw: 40, hh: 20, radius: 20, press: 0.5, active: true });
    const body = liveBodies()[0];
    expect(body.cx).toBe(100);
    expect(body.cy).toBe(50);
    expect(body.hw).toBe(40);
    expect(body.radius).toBe(20);
    expect(body.press).toBe(0.5);
    expect(body.active).toBe(true);
    expect(anyActive()).toBe(true);
  });

  it('swap-removes without leaving holes and keeps other handles valid', () => {
    const a = registerBody('capsule', 1)!;
    const b = registerBody('droplet', 1)!;
    const c = registerBody('bud', 2)!;
    a.set({ cx: 1 });
    b.set({ cx: 2 });
    c.set({ cx: 3 });
    expect(liveCount()).toBe(3);

    b.remove();
    expect(liveCount()).toBe(2);
    // The two survivors are still a and c, addressable by their handles.
    const ids = new Set<number>();
    for (let i = 0; i < liveCount(); i++) ids.add(liveBodies()[i].id);
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(c.id)).toBe(true);
    expect(ids.has(b.id)).toBe(false);

    // c's handle still mutates the right (relocated) object.
    c.set({ cx: 99 });
    const cBody = liveBodies()[0].id === c.id ? liveBodies()[0] : liveBodies()[1];
    expect(cBody.cx).toBe(99);
  });

  it('double remove is a no-op and set() after remove is ignored', () => {
    const h = registerBody('capsule', 1)!;
    h.remove();
    expect(liveCount()).toBe(0);
    h.remove();
    expect(liveCount()).toBe(0);
    h.set({ cx: 123 });
    expect(liveCount()).toBe(0);
  });

  it('caps at BODY_CAP and drops the overflow (returns null)', () => {
    for (let i = 0; i < BODY_CAP; i++) expect(registerBody('capsule')).not.toBeNull();
    expect(liveCount()).toBe(BODY_CAP);
    expect(registerBody('capsule')).toBeNull();
    expect(liveCount()).toBe(BODY_CAP);
  });

  it('notifies listeners on register and remove only', () => {
    let n = 0;
    const off = onRegistryChange(() => {
      n++;
    });
    const h = registerBody('capsule')!;
    expect(n).toBe(1);
    h.set({ cx: 5 }); // field mutation does NOT notify
    expect(n).toBe(1);
    h.remove();
    expect(n).toBe(2);
    off();
    registerBody('capsule');
    expect(n).toBe(2); // unsubscribed
  });
});
