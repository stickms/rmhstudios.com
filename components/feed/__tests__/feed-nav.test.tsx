/**
 * The feed keys (sprint 08 07). The repo has no DOM library, so this runs against a small stand-in for the parts of
 * the DOM the handler touches (focus, `closest`, `querySelectorAll`, `contains`); the key matching and the modes are the
 * real ones from `lib/shortcuts/bindings.ts`, applied the way `KeyboardShortcuts.tsx` applies them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusPost, registerPostAction, registerWindowedList, runFeedNav, type WindowedPostList } from '../feed-nav';
import {
  DEFAULT_KEYBOARD_PREFS,
  effectiveBindings,
  eventMatchesKeystroke,
  type KeyboardPrefs,
} from '@/lib/shortcuts/bindings';
import { SITE_SHORTCUTS } from '@/lib/shortcuts/registry';
import { isFeedNavId, type FeedNavId } from '@/lib/shortcuts/feed-nav';

/* ---------------------------- a tiny DOM ---------------------------- */

const attrMatches = (el: FakeEl, token: string): boolean => {
  const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(token);
  if (!m) return el.tagName.toLowerCase() === token;
  const value = el.attrs[m[1]];
  return m[2] === undefined ? value !== undefined : value === m[2];
};

function matches(el: FakeEl, selector: string): boolean {
  return selector.split(',').some((part) => {
    const trimmed = part.trim();
    const not = /^(.*?):not\((.*)\)$/.exec(trimmed);
    if (not) return matches(el, not[1]) && !matches(el, not[2]);
    return attrMatches(el, trimmed);
  });
}

class FakeEl {
  tagName: string;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  isContentEditable = false;
  top = 0;
  scrolled = 0;
  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
  }
  get dataset() {
    return {
      feedPost: this.attrs['data-feed-post'],
      index: this.attrs['data-index'],
    };
  }
  append(child: FakeEl) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  closest(selector: string): FakeEl | null {
    return matches(this, selector) ? this : (this.parent?.closest(selector) ?? null);
  }
  contains(other: FakeEl): boolean {
    return other === this || (other.parent ? this.contains(other.parent) : false);
  }
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(selector: string) {
    return this.all().filter((e) => matches(e, selector));
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  focus() {
    fake.active = this;
  }
  blur() {
    if (fake.active === this) fake.active = fake.body;
  }
  scrollIntoView() {
    this.scrolled += 1;
  }
  getBoundingClientRect() {
    return {
      top: this.top,
      bottom: this.top + 100,
    };
  }
}

const fake = {
  body: new FakeEl('body'),
  main: new FakeEl('main'),
  active: null as FakeEl | null,
};

const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: FakeEl | null = null) =>
  ({
    key: k,
    code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: target ?? fake.active ?? fake.body,
    ...extra,
  }) as unknown as KeyboardEvent;

/** The dispatcher's job: effective bindings for the mode, then the handler. True when something happened. */
function press(event: KeyboardEvent, singleKeys: KeyboardPrefs['singleKeys'] = 'on'): boolean {
  const bound = effectiveBindings(SITE_SHORTCUTS, {
    ...DEFAULT_KEYBOARD_PREFS,
    singleKeys,
  });
  const hit = bound.find((s) => isFeedNavId(s.id) && eventMatchesKeystroke(s.keys[0], event));
  return hit ? runFeedNav(hit.id as FeedNavId, event) : false;
}

function buildFeed(count: number) {
  const posts: FakeEl[] = [];
  for (let i = 0; i < count; i += 1) {
    const post = fake.main.append(
      new FakeEl('article', {
        'data-feed-post': `p${i}`,
      }),
    );
    post.top = i * 120;
    post.append(new FakeEl('button'));
    posts.push(post);
  }
  return posts;
}

let cleanups: Array<() => void> = [];

beforeEach(() => {
  fake.body = new FakeEl('body');
  fake.main = fake.body.append(new FakeEl('main'));
  fake.active = fake.body;
  vi.stubGlobal('Element', FakeEl);
  vi.stubGlobal('HTMLElement', FakeEl);
  vi.stubGlobal('window', {
    innerHeight: 800,
  });
  vi.stubGlobal('document', {
    get activeElement() {
      return fake.active;
    },
    querySelector: (s: string) => (s === 'main' ? fake.main : fake.body.querySelector(s)),
  });
});

afterEach(() => {
  for (const off of cleanups) off();
  cleanups = [];
  vi.unstubAllGlobals();
});

const activeId = () => fake.active?.attrs['data-feed-post'];

/* ------------------------------ tests ------------------------------- */

describe('j and k in a plain list', () => {
  it('j five times from nothing lands on the fifth post, k goes back', () => {
    buildFeed(10);
    for (let i = 0; i < 5; i += 1) expect(press(key('j'))).toBe(true);
    expect(activeId()).toBe('p4');
    expect(press(key('k'))).toBe(true);
    expect(activeId()).toBe('p3');
  });

  it('scrolls the post into view without animating', () => {
    const posts = buildFeed(3);
    const spy = vi.spyOn(posts[0], 'scrollIntoView');
    focusPost(posts[0] as unknown as HTMLElement);
    expect(spy).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'instant',
    });
  });

  it('starts at the first post in view when none has focus', () => {
    const posts = buildFeed(4);
    posts.forEach((p, i) => (p.top = -250 + i * 120));
    press(key('j'));
    expect(activeId()).toBe('p2');
  });

  it('stops at the ends and finds focus inside a post (a button in the card)', () => {
    const posts = buildFeed(2);
    posts[1].children[0].focus();
    expect(press(key('j'))).toBe(true);
    expect(activeId()).toBe('p1');
    expect(press(key('k'), 'on')).toBe(true);
    expect(activeId()).toBe('p0');
  });

  it('Escape leaves post navigation, and does nothing with no post focused', () => {
    buildFeed(2);
    expect(press(key('Escape'))).toBe(false);
    press(key('j'));
    expect(press(key('Escape'))).toBe(true);
    expect(fake.active).toBe(fake.body);
  });
});

describe('j and k in a windowed list', () => {
  it('asks the list to focus the row beyond the mounted ones', () => {
    const posts = buildFeed(3);
    const focusIndex = vi.fn();
    const list: WindowedPostList = {
      contains: (el) => fake.main.contains(el as unknown as FakeEl),
      indexOf: (el) => Number((el as unknown as FakeEl).closest('[data-index]')?.attrs['data-index'] ?? -1),
      count: () => 300,
      focusIndex,
    };
    posts.forEach((p, i) => (p.attrs['data-index'] = String(40 + i)));
    cleanups.push(registerWindowedList(list));
    posts[2].focus();
    expect(press(key('j'))).toBe(true);
    expect(focusIndex).toHaveBeenCalledWith(43);
    posts[0].focus();
    press(key('k'));
    expect(focusIndex).toHaveBeenLastCalledWith(39);
  });

  it('falls back to document order at the ends of the list', () => {
    const posts = buildFeed(2);
    const focusIndex = vi.fn();
    cleanups.push(
      registerWindowedList({
        contains: () => true,
        indexOf: () => 0,
        count: () => 1,
        focusIndex,
      }),
    );
    posts[0].focus();
    press(key('j'));
    expect(focusIndex).not.toHaveBeenCalled();
    expect(activeId()).toBe('p1');
  });
});

describe('actions', () => {
  it('l calls the like handler registered for the focused post, and only that post', () => {
    buildFeed(2);
    const like = vi.fn();
    const other = vi.fn();
    cleanups.push(registerPostAction('p0', 'like', like), registerPostAction('p1', 'like', other));
    press(key('j'));
    expect(press(key('l'))).toBe(true);
    expect(like).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('o r t s x each call their own handler', () => {
    buildFeed(1);
    const handlers = {
      open: vi.fn(),
      reply: vi.fn(),
      repost: vi.fn(),
      save: vi.fn(),
      reveal: vi.fn(),
    };
    for (const [name, fn] of Object.entries(handlers)) {
      cleanups.push(registerPostAction('p0', name as keyof typeof handlers, fn));
    }
    press(key('j'));
    for (const k of ['o', 'r', 't', 's', 'x']) press(key(k));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leaves the key alone when no post has focus or the post has no such action', () => {
    buildFeed(1);
    const like = vi.fn();
    cleanups.push(registerPostAction('p0', 'like', like));
    expect(press(key('l'))).toBe(false);
    press(key('j'));
    expect(press(key('x'))).toBe(false);
  });

  it('an unregistered handler is not called, and a newer one is not removed by an older cleanup', () => {
    buildFeed(1);
    const a = vi.fn();
    const b = vi.fn();
    const offA = registerPostAction('p0', 'like', a);
    cleanups.push(registerPostAction('p0', 'like', b));
    offA();
    press(key('j'));
    press(key('l'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('where the keys are off', () => {
  it('ignores keys typed in a text field', () => {
    buildFeed(2);
    const input = fake.main.append(new FakeEl('input'));
    expect(press(key('j', {}, input))).toBe(false);
    expect(activeId()).toBeUndefined();
    const editable = fake.main.append(new FakeEl('div'));
    editable.isContentEditable = true;
    expect(press(key('j', {}, editable))).toBe(false);
  });

  it('ignores keys inside a dialog or a menu, and while one is open', () => {
    buildFeed(2);
    const dialog = fake.body.append(
      new FakeEl('div', {
        role: 'dialog',
      }),
    );
    const inside = dialog.append(new FakeEl('button'));
    expect(press(key('j', {}, inside))).toBe(false);
    expect(activeId()).toBeUndefined();
    // focus left on the page behind the modal
    expect(press(key('j'))).toBe(false);
    fake.body.children.splice(fake.body.children.indexOf(dialog), 1);
    const menu = fake.body.append(
      new FakeEl('div', {
        role: 'menu',
      }),
    );
    expect(press(key('j', {}, menu.append(new FakeEl('button'))))).toBe(false);
    expect(press(key('j'))).toBe(false);
  });

  it('mode Off disables every key', () => {
    buildFeed(2);
    for (const k of ['j', 'k', 'o', 'l', 'r', 't', 's', 'x', 'Escape']) {
      expect(press(key(k), 'off')).toBe(false);
    }
    expect(fake.active).toBe(fake.body);
  });

  it('mode With Alt requires Alt, and a bare key does nothing', () => {
    buildFeed(3);
    expect(press(key('j'), 'alt')).toBe(false);
    expect(
      press(
        key('j', {
          altKey: true,
        }),
        'alt',
      ),
    ).toBe(true);
    expect(activeId()).toBe('p0');
  });

  it('does not fire with Ctrl, Cmd or Alt held in the default mode', () => {
    buildFeed(2);
    expect(
      press(
        key('j', {
          ctrlKey: true,
        }),
      ),
    ).toBe(false);
    expect(
      press(
        key('j', {
          metaKey: true,
        }),
      ),
    ).toBe(false);
    expect(
      press(
        key('j', {
          altKey: true,
        }),
      ),
    ).toBe(false);
    expect(fake.active).toBe(fake.body);
  });
});

describe('source rules', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');
  const files = ['components/feed/feed-nav.tsx', 'components/feed/VirtualPostList.tsx', 'lib/shortcuts/feed-nav.ts'];

  it('uses no requestAnimationFrame, timer or smooth scrolling', () => {
    for (const f of files) {
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/requestAnimationFrame|setTimeout|setInterval|smooth/);
    }
  });

  it('puts the post root and the post keys on every renderer of a post', () => {
    expect(read('components/feed/RMHarkCard.tsx')).toContain('data-feed-post={item.id}');
    expect(read('components/feed/FeedRow.tsx')).toContain('data-feed-post={item.id}');
    const actions = read('components/feed/RMHarkActions.tsx');
    for (const name of ['like', 'repost', 'reply', 'save']) {
      expect(actions).toContain(`usePostAction(item.id, '${name}'`);
    }
  });

  it('has an English label for every binding in the feed-keyboard catalog', () => {
    const catalog = JSON.parse(read('locales/en/feed-keyboard.json')) as Record<string, string>;
    for (const name of ['next', 'prev', 'open', 'like', 'reply', 'repost', 'save', 'reveal', 'leave']) {
      expect(catalog[`kbd-${name}`], name).toBeTruthy();
    }
    expect(catalog['kbd-hint']).toBe('Press j and k to move between posts');
  });
});
