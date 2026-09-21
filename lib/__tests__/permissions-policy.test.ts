/**
 * The `Permissions-Policy` header may not forbid a feature this site calls.
 *
 * This gate exists because the opposite shipped. The header read
 * `geolocation=(), microphone=(), camera=(), payment=()`, and an empty
 * allowlist denies the feature to EVERY origin — including our own. Meanwhile
 * three features were calling `getUserMedia` for audio (voice messages, voice
 * calls, Massive March squad chat) and two were calling `navigator.geolocation`
 * (rideshare driver tracking, the location search box).
 *
 * Nothing caught it, and nothing was ever going to, because of how the failure
 * presents: a call blocked by Permissions-Policy rejects with the SAME
 * `NotAllowedError` a user gets for declining the browser's own prompt. Every
 * one of those call sites has a tidy "the user said no" branch, so the features
 * degraded politely and silently, and the logs said the visitors had refused.
 *
 * So the invariant is asserted from the other end: find what the code actually
 * calls, and require the header to permit it. A future feature that starts
 * using the camera fails here until someone opens the policy deliberately.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const VHOST = join(ROOT, 'deploy/apache/rmhstudios.conf');

/** Source trees where a browser API call could live. */
const SCAN_DIRS = ['lib', 'components', 'hooks', 'app', 'stores'];
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'dist', '.output']);

function collect(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = collect(SCAN_DIRS[0]).concat(...SCAN_DIRS.slice(1).map((d) => collect(d)));
const SOURCES = FILES.map((file) => ({ file, src: readFileSync(join(ROOT, file), 'utf8') }));

/**
 * Policy features, and how to tell from the source that we use one.
 *
 * The detectors look for the CALL, not a mention: `canRecordVoice()` checking
 * that `navigator.mediaDevices?.getUserMedia` exists is a capability probe and
 * does not need the permission, while `getUserMedia({ audio: … })` does.
 */
/**
 * Does any `getUserMedia` call in `src` actually ASK for `key`?
 *
 * Reads the constraint's VALUE, because `audio: false` / `video: false` is a
 * caller explicitly declining that device — voice calls pass exactly that for
 * the camera — and demanding a permission for a refusal is how an allowlist
 * quietly fills up with things nothing uses.
 *
 * Written as a value comparison rather than a negative lookahead on purpose:
 * `video\s*:\s*(?!false)` looks like it says this and does not, because `\s*`
 * happily matches nothing and parks the lookahead in front of the space. That
 * exact expression passed `video: false` and sent this gate after the camera.
 */
function requestsDevice(src: string, key: 'audio' | 'video'): boolean {
  const calls = /getUserMedia\s*\(\s*\{([^}]*)\}/gs;
  for (const [, body] of src.matchAll(calls)) {
    const constraint = new RegExp(`\\b${key}\\s*:\\s*([^,}]+)`).exec(body);
    if (constraint && constraint[1].trim() !== 'false') return true;
  }
  return false;
}

const FEATURES: { name: string; detect: (src: string) => boolean; why: string }[] = [
  {
    name: 'microphone',
    detect: (src) => requestsDevice(src, 'audio'),
    why: 'getUserMedia({ audio })',
  },
  {
    name: 'camera',
    detect: (src) => requestsDevice(src, 'video'),
    why: 'getUserMedia({ video })',
  },
  {
    name: 'geolocation',
    detect: (src) =>
      /navigator\s*\.\s*geolocation\s*\.\s*(?:watchPosition|getCurrentPosition)\s*\(/.test(src),
    why: 'navigator.geolocation.watchPosition / getCurrentPosition',
  },
  {
    name: 'xr-spatial-tracking',
    detect: (src) => /requestSession\s*\(\s*['"]immersive-(?:ar|vr)['"]/.test(src),
    why: "navigator.xr.requestSession('immersive-…')",
  },
];

/** `name=(allowlist)` → the allowlist text, or null when the feature is absent. */
function allowlistFor(header: string, feature: string): string | null {
  const match = new RegExp(`(?:^|[,\\s])${feature}\\s*=\\s*\\(([^)]*)\\)`).exec(header);
  return match ? match[1].trim() : null;
}

const VHOST_SRC = readFileSync(VHOST, 'utf8');
const HEADER = (() => {
  const match = /Header\s+always\s+set\s+Permissions-Policy\s+"([^"]+)"/.exec(VHOST_SRC);
  return match ? match[1] : '';
})();

describe('Permissions-Policy', () => {
  it('is set on the main vhost at all', () => {
    // Guards the parser: a renamed directive would make every rule below pass
    // against an empty string.
    expect(HEADER, `no Permissions-Policy found in ${VHOST}`).not.toBe('');
    expect(HEADER).toContain('=');
  });

  it('scans a real slice of the codebase', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
  });

  it.each(FEATURES)('permits $name wherever the code calls it', ({ name, detect, why }) => {
    const callers = SOURCES.filter(({ src }) => detect(src)).map(({ file }) => file);
    if (callers.length === 0) return; // unused — staying denied is correct

    const allowed = allowlistFor(HEADER, name);
    expect(
      allowed,
      `${callers.length} file(s) call ${why} but Permissions-Policy does not mention "${name}", ` +
        `so the browser's default applies. List it explicitly:\n  ${callers.slice(0, 6).join('\n  ')}`,
    ).not.toBeNull();

    expect(
      allowed,
      `Permissions-Policy sets \`${name}=()\`, which denies it to EVERY origin including ours — ` +
        `but these call it, and the rejection is indistinguishable from the user declining:\n  ` +
        callers.slice(0, 6).join('\n  ') +
        `\n\nUse \`${name}=(self)\`, or stop calling it.`,
    ).not.toBe('');
  });

  it('keeps everything it lists scoped to this origin', () => {
    // A wildcard would hand the feature to every embedded third party too.
    const wildcards = [...HEADER.matchAll(/([a-z-]+)\s*=\s*\(([^)]*)\)/g)]
      .filter(([, , list]) => list.includes('*'))
      .map(([, feature]) => feature);
    expect(wildcards, 'Permissions-Policy should never use `*`').toEqual([]);
  });

  it('still denies what nothing uses', () => {
    // The header is a deny-list by default, and anything opened should have a
    // caller. These two have none and must stay shut:
    //
    //   • `payment` — Stripe Checkout is a redirect, not an in-page handler.
    //   • `camera` — nothing requests video. GlobeSet's "view in your room"
    //     looks like it would need it and does not: WebXR passthrough is
    //     composited by the XR runtime and the page never receives camera
    //     pixels, so the feature that gates it is `xr-spatial-tracking`.
    //     Opening `camera` for it would be granting a permission that buys
    //     nothing and widens the blast radius of any future injection.
    expect(allowlistFor(HEADER, 'payment')).toBe('');
    expect(allowlistFor(HEADER, 'camera')).toBe('');
  });
});
