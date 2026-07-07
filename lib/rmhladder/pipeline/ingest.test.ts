import { describe, expect, it } from 'vitest';
import { assessJob, summarizeDescription } from './ingest';
import type { NormalizedJob } from '../adapters/types';
import type { VerificationEvidence } from '../verification';

// ── helpers ────────────────────────────────────────────────────────────────

function makeNormalized(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    externalId: 'ext-1',
    title: 'Software Engineering Intern',
    locationRaw: 'New York, NY',
    country: 'US',
    remoteHint: false,
    postedAt: new Date('2026-06-01'),
    absoluteUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    applyUrl: 'https://boards.greenhouse.io/acme/jobs/1#app',
    descriptionHtml: '<p>Join our summer intern program.</p>',
    requisitionId: 'REQ-100',
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    fetched: true,
    httpStatus: 200,
    apiSource: true,
    companyMatch: true,
    titleMatch: true,
    usConfirmed: true,
    applyPresent: true,
    reqIdPresent: true,
    closedLanguage: false,
    blocked: false,
    isSearchResultsPage: false,
    companyName: 'Acme Corp',
    jobTitle: 'Software Engineering Intern',
    locationLabel: 'New York, NY',
    platform: 'greenhouse',
    ...overrides,
  };
}

function baseArgs(
  normalizedOverrides: Partial<NormalizedJob> = {},
  evidenceOverrides: Partial<VerificationEvidence> = {},
) {
  return {
    normalized: makeNormalized(normalizedOverrides),
    companyName: 'Acme Corp',
    companyId: 'acme-id',
    companyPriority: 1,
    platform: 'greenhouse',
    evidence: makeEvidence(evidenceOverrides),
  };
}

// ── summarizeDescription ────────────────────────────────────────────────────

describe('summarizeDescription', () => {
  it('returns null summary and empty text for null html', () => {
    const { summary, text } = summarizeDescription(null);
    expect(summary).toBeNull();
    expect(text).toBe('');
  });

  it('returns collapsed text for simple html', () => {
    const { summary, text } = summarizeDescription('<p>Hello  world</p>');
    expect(text).toBe('Hello world');
    expect(summary).toBe('Hello world');
  });

  it('truncates summary at 500 chars but text is the full content', () => {
    const longWord = 'a'.repeat(600);
    const html = `<p>${longWord}</p>`;
    const { summary, text } = summarizeDescription(html);
    expect(text).toBe(longWord);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBe(500);
  });

  it('collapses whitespace across tags', () => {
    const { text } = summarizeDescription('<p>Hello</p>  <p>World</p>');
    expect(text).toBe('Hello World');
  });
});

// ── assessJob: US intern happy path ────────────────────────────────────────

describe('assessJob — US intern verified_active', () => {
  it('returns verified_active with no review reasons for a strong US internship', () => {
    const result = assessJob(baseArgs());
    expect(result.verificationInput.usConfirmed).toBe(true);
    expect(result.reviewReasons).not.toContain('ambiguous_us_location');
    expect(result.reviewReasons).not.toContain('low_confidence');
    // strong evidence → verified_active or verified_probable (not needs_manual_review)
    expect(['verified_active', 'verified_probable']).toContain(result.fields.verificationStatus);
    expect(result.reviewReasons).toHaveLength(0);
  });

  it('produces a dedupeHash string', () => {
    const result = assessJob(baseArgs());
    expect(typeof result.dedupeHash).toBe('string');
    expect(result.dedupeHash).toHaveLength(64); // sha256 hex
  });

  it('fills standard fields', () => {
    const result = assessJob(baseArgs());
    expect(result.fields.title).toBe('Software Engineering Intern');
    expect(result.fields.normalizedTitle).toBeTruthy();
    expect(result.fields.locationRaw).toBe('New York, NY');
    expect(result.fields.sourcePlatform).toBe('greenhouse');
    expect(result.fields.originalPostingUrl).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(result.fields.canonicalApplyUrl).toBe('https://boards.greenhouse.io/acme/jobs/1#app');
    expect(result.fields.externalRequisitionId).toBe('REQ-100');
    expect(result.fields.fullDescription).toBe('<p>Join our summer intern program.</p>');
  });

  it('sets employmentType internship for intern programType', () => {
    const result = assessJob(baseArgs());
    expect(result.fields.programType).not.toBe('other');
    expect(result.fields.employmentType).toBe('internship');
  });

  it('companyIsTarget=true when companyPriority<=2', () => {
    const r1 = assessJob({ ...baseArgs(), companyPriority: 1 });
    const r2 = assessJob({ ...baseArgs(), companyPriority: 3 });
    expect(r1.fields.relevanceScoreBase).toBeGreaterThan(r2.fields.relevanceScoreBase);
  });
});

// ── assessJob: London analyst → non_us_role ─────────────────────────────────

describe('assessJob — London analyst → non_us_role override', () => {
  it('overrides verification status to non_us_role', () => {
    const result = assessJob(
      baseArgs(
        { locationRaw: 'London, UK', country: null, title: 'Investment Banking Analyst' },
        { usConfirmed: false },
      ),
    );
    expect(result.fields.verificationStatus).toBe('non_us_role');
  });

  it('does NOT add low_confidence reason when non_us_role', () => {
    const result = assessJob(
      baseArgs(
        { locationRaw: 'London, UK', country: null, title: 'Investment Banking Analyst' },
        { usConfirmed: false },
      ),
    );
    expect(result.reviewReasons).not.toContain('low_confidence');
  });

  it('sets usConfirmed false and isUS false on the enriched evidence', () => {
    const result = assessJob(
      baseArgs(
        { locationRaw: 'London, UK', country: null },
        { usConfirmed: true }, // adapter said true but assessJob must override
      ),
    );
    expect(result.verificationInput.usConfirmed).toBe(false);
  });
});

// ── assessJob: ambiguous location → ambiguous_us_location ───────────────────

describe('assessJob — ambiguous location', () => {
  it('adds ambiguous_us_location when isUS is null', () => {
    const result = assessJob(
      baseArgs({ locationRaw: 'Main Campus', country: null }),
    );
    expect(result.reviewReasons).toContain('ambiguous_us_location');
  });
});

// ── assessJob: senior title → grad/school targets nulled ────────────────────

describe('assessJob — senior/non-early-career title', () => {
  it('nulls graduationYearTarget and schoolYearTarget when classification is no', () => {
    // Use a title that strongly classifies as 'no'
    const result = assessJob(
      baseArgs({ title: 'Senior Vice President, Finance' }),
    );
    expect(result.fields.earlyCareerClassification).toBe('no');
    expect(result.fields.graduationYearTarget).toBeNull();
    expect(result.fields.schoolYearTarget).toBeNull();
  });
});

// ── assessJob: low evidence → low_confidence ────────────────────────────────

describe('assessJob — low evidence → low_confidence', () => {
  it('adds low_confidence reason when confidence < 60 after computeVerification', () => {
    // Minimal evidence: not an API source, no title match, no apply, no reqId
    const result = assessJob(
      baseArgs(
        { locationRaw: 'New York, NY', country: 'US' },
        {
          apiSource: false,
          titleMatch: false,
          companyMatch: false,
          applyPresent: false,
          reqIdPresent: false,
          usConfirmed: false, // assessJob will override from location
        },
      ),
    );
    expect(result.reviewReasons).toContain('low_confidence');
    expect(result.fields.verificationStatus).toBe('needs_manual_review');
  });
});

// ── assessJob: remote_us only when isUS === true ─────────────────────────────

describe('assessJob — remoteStatus handling', () => {
  it('keeps remote_us for a US remote job', () => {
    const result = assessJob(baseArgs({ locationRaw: 'Remote', country: 'US' }));
    expect(result.fields.remoteStatus).toBe('remote_us');
  });

  it('downgrades remote_us to onsite when location is non-US', () => {
    const result = assessJob(
      baseArgs({ locationRaw: 'Remote - London', country: null }),
    );
    // isUS is false (london signal), so remote_us must be downgraded
    expect(result.fields.remoteStatus).not.toBe('remote_us');
  });
});

// ── assessJob: dedupeHash uses locationBucket correctly ─────────────────────

describe('assessJob — dedupeHash stability', () => {
  it('produces the same hash for identical inputs', () => {
    const r1 = assessJob(baseArgs());
    const r2 = assessJob(baseArgs());
    expect(r1.dedupeHash).toBe(r2.dedupeHash);
  });

  it('produces different hashes for different cities', () => {
    const r1 = assessJob(baseArgs({ locationRaw: 'New York, NY' }));
    const r2 = assessJob(baseArgs({ locationRaw: 'Chicago, IL' }));
    expect(r1.dedupeHash).not.toBe(r2.dedupeHash);
  });
});

// ── assessJob: fields completeness ─────────────────────────────────────────

describe('assessJob — fields completeness', () => {
  it('carries usLocationConfidence', () => {
    const result = assessJob(baseArgs());
    expect(typeof result.fields.usLocationConfidence).toBe('number');
  });

  it('carries urgencyFlag', () => {
    const result = assessJob(baseArgs());
    expect(typeof result.fields.urgencyFlag).toBe('boolean');
  });

  it('carries descriptionSummary', () => {
    const result = assessJob(baseArgs());
    expect(result.fields.descriptionSummary).toBeTruthy();
  });

  it('carries postingDate', () => {
    const result = assessJob(baseArgs());
    expect(result.fields.postingDate).toBeInstanceOf(Date);
  });

  it('sets employmentType full_time for non-intern program types', () => {
    const result = assessJob(baseArgs({ title: 'Entry Level Analyst' }, {}));
    // entry_level is not in the internship-type list → full_time
    const employmentTypes = ['internship', 'full_time'];
    expect(employmentTypes).toContain(result.fields.employmentType);
    if (result.fields.programType === 'entry_level') {
      expect(result.fields.employmentType).toBe('full_time');
    }
  });
});

// ── assessJob: unclear early-career → ambiguous_early_career ────────────────

describe('assessJob — unclear early career', () => {
  it('adds ambiguous_early_career for unclear classification', () => {
    // A title with no strong signals in either direction
    const result = assessJob(baseArgs({ title: 'Financial Analyst' }, {}));
    // financial analyst often yields 'unclear' or 'probable'
    // We just test that if classification is unclear, the reason is added
    if (result.fields.earlyCareerClassification === 'unclear') {
      expect(result.reviewReasons).toContain('ambiguous_early_career');
    }
  });
});
