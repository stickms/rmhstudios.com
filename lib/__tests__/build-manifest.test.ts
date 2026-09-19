import { describe, it, expect } from 'vitest';

/**
 * The build manifest and its permission model (B1).
 *
 * This is the security boundary of the whole build pillar, so the tests are
 * almost entirely about refusal: a manifest that claims to be a different
 * build, an entry point that climbs out of its directory, a wildcard host
 * dressed up as a policy, and a CSP that would let a build be embedded
 * somewhere the platform's confirmation UI can be cropped off.
 */

import {
  BUILD_SANDBOX,
  CAPABILITIES,
  CONSENT_REQUIRED,
  HUMAN_REVIEW_REQUIRED,
  consentList,
  cspFor,
  manifestSchema,
  needsHumanReview,
  validateManifest,
  type BuildManifest,
} from '@/lib/builds/manifest';

function manifest(over: Partial<BuildManifest> = {}): BuildManifest {
  return manifestSchema.parse({
    manifestVersion: 1,
    slug: 'my-build',
    name: 'My Build',
    version: '1.0.0',
    entry: 'index.html',
    capabilities: [],
    connectHosts: [],
    ...over,
  });
}

describe('validateManifest — identity', () => {
  it('accepts a well-formed manifest for its own build', () => {
    expect(validateManifest(manifest(), 'my-build')).toEqual([]);
  });

  it('refuses a manifest claiming to be a different build', () => {
    // Otherwise a build publishes a manifest granting itself another build's
    // storage, which is the whole permission model defeated in one field.
    expect(validateManifest(manifest(), 'someone-elses-build')).toEqual(['slug-mismatch']);
  });

  it('refuses something that is not a manifest at all', () => {
    expect(validateManifest(null, 'my-build')).toEqual(['malformed']);
    expect(validateManifest({ manifestVersion: 2 }, 'my-build')).toEqual(['malformed']);
  });

  it('refuses an unknown capability rather than ignoring it', () => {
    expect(validateManifest({ ...manifest(), capabilities: ['root'] }, 'my-build')).toEqual([
      'malformed',
    ]);
  });
});

describe('validateManifest — the entry point', () => {
  it('refuses an absolute path', () => {
    expect(validateManifest(manifest({ entry: '/etc/passwd' }), 'my-build')).toContain(
      'entry-absolute',
    );
  });

  it('refuses a scheme', () => {
    expect(validateManifest(manifest({ entry: 'https://evil.test/x' }), 'my-build')).toContain(
      'entry-absolute',
    );
  });

  it('refuses traversal', () => {
    expect(validateManifest(manifest({ entry: '../../other/index.html' }), 'my-build')).toContain(
      'entry-escapes',
    );
  });

  it('allows an ordinary nested path', () => {
    expect(validateManifest(manifest({ entry: 'dist/index.html' }), 'my-build')).toEqual([]);
  });
});

describe('validateManifest — hosts', () => {
  it('allows a named host', () => {
    expect(validateManifest(manifest({ connectHosts: ['api.example.com'] }), 'my-build')).toEqual(
      [],
    );
  });

  it('refuses a wildcard', () => {
    // `*` is not a narrower policy than "anything"; it is the same policy
    // written so that it looks considered.
    expect(validateManifest(manifest({ connectHosts: ['*.example.com'] }), 'my-build')).toContain(
      'wildcard-host',
    );
    expect(validateManifest(manifest({ connectHosts: ['*'] }), 'my-build')).toContain(
      'wildcard-host',
    );
  });

  it('refuses a URL where a host belongs', () => {
    expect(
      validateManifest(manifest({ connectHosts: ['https://x.test/path'] }), 'my-build'),
    ).toContain('bad-host');
  });

  it('reports every problem at once rather than the first', () => {
    const problems = validateManifest(
      manifest({ entry: '/abs', connectHosts: ['*', 'also bad'] }),
      'other-slug',
    );
    expect(problems).toContain('slug-mismatch');
    expect(problems).toContain('entry-absolute');
    expect(problems).toContain('wildcard-host');
    expect(problems).toContain('bad-host');
  });
});

describe('consent', () => {
  it('asks for everything that costs the member something', () => {
    const m = manifest({ capabilities: ['storage', 'coins:spend', 'identity'] });
    expect(consentList(m)).toEqual(['storage', 'coins:spend']);
  });

  it('does not prompt for identity', () => {
    // A display name and an avatar are what a build would see from the page
    // anyway, and prompting for them trains people to click through prompts —
    // which is what stops the prompts that matter from working.
    expect(CONSENT_REQUIRED.has('identity')).toBe(false);
  });

  it('returns consent in a stable order regardless of how it was written', () => {
    const a = consentList(manifest({ capabilities: ['party', 'storage'] }));
    const b = consentList(manifest({ capabilities: ['storage', 'party'] }));
    expect(a).toEqual(b);
  });

  it('asks for nothing when nothing was requested', () => {
    expect(consentList(manifest())).toEqual([]);
  });
});

describe('human review', () => {
  it('is required for spending coins and nothing else today', () => {
    expect([...HUMAN_REVIEW_REQUIRED]).toEqual(['coins:spend']);
    expect(needsHumanReview(manifest({ capabilities: ['coins:spend'] }))).toBe(true);
    expect(needsHumanReview(manifest({ capabilities: ['storage', 'leaderboard'] }))).toBe(false);
  });

  it('keeps the queue short enough that somebody reads it', () => {
    // A review queue everything lands in is a review queue nobody reads.
    expect(HUMAN_REVIEW_REQUIRED.size).toBeLessThan(CAPABILITIES.length / 2);
  });
});

describe('cspFor', () => {
  const site = 'https://rmhstudios.com';

  it('confines a build to its own origin by default', () => {
    const csp = cspFor(manifest(), site);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('opens connect-src only to declared hosts, over https', () => {
    const csp = cspFor(manifest({ connectHosts: ['api.example.com'] }), site);
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });

  it('pins frame-ancestors to the site', () => {
    // A build embedded elsewhere is a build whose confirmation UI can be
    // cropped off the top of the frame.
    expect(cspFor(manifest(), site)).toContain(`frame-ancestors ${site}`);
  });

  it('forbids a form posting anywhere it did not declare', () => {
    expect(cspFor(manifest({ connectHosts: ['api.example.com'] }), site)).toContain(
      "form-action 'self'",
    );
  });

  it('forbids a base tag and plugins outright', () => {
    const csp = cspFor(manifest(), site);
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe('the sandbox attribute', () => {
  it('never lets a build navigate the top frame', () => {
    // A build that can navigate the top frame can replace the site with a
    // copy of the site.
    expect(BUILD_SANDBOX).not.toContain('allow-top-navigation');
  });

  it('allows scripts and its own origin, which is the build\'s and not the site\'s', () => {
    expect(BUILD_SANDBOX).toContain('allow-scripts');
    expect(BUILD_SANDBOX).toContain('allow-same-origin');
  });
});
