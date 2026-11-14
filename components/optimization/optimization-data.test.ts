import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BUILDTIME,
  RUNTIME,
  STATS,
} from './optimization-runtime-data';
import {
  ADVANCED,
  BUILD_SPECS,
  BUNDLE_SPECS,
  DEPLOY_STEPS,
  LEGAL_LINKS,
  MEASURE,
  MILESTONES,
  OPT_FAQ,
  RENDER_SPECS,
} from './optimization-data';

const unique =
  (
    xs: string[],
  ) =>
    new Set(
      xs,
    )
      .size ===
    xs.length;

describe('optimization page data', () => {
  it('has content in every list', () => {
    for (const list of [
      RUNTIME,
      STATS,
      BUILDTIME,
      MILESTONES,
      ADVANCED,
      RENDER_SPECS,
      BUNDLE_SPECS,
      BUILD_SPECS,
      DEPLOY_STEPS,
      MEASURE,
      OPT_FAQ,
      LEGAL_LINKS,
    ]) {
      expect(
        list.length,
      ).toBeGreaterThan(
        0,
      );
    }
  });
  it('uses unique React keys within each list', () => {
    expect(
      unique(
        RUNTIME.map(
          (
            p,
          ) =>
            p.title,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        STATS.map(
          (
            s,
          ) =>
            s.label,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        BUILDTIME.map(
          (
            f,
          ) =>
            f.title,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        MILESTONES.map(
          (
            m,
          ) =>
            m.metric,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        ADVANCED.map(
          (
            a,
          ) =>
            a.title,
        ),
      ),
    ).toBe(
      true,
    );
    for (const specs of [
      RENDER_SPECS,
      BUNDLE_SPECS,
      BUILD_SPECS,
    ]) {
      expect(
        unique(
          specs.map(
            (
              s,
            ) =>
              s.term,
          ),
        ),
      ).toBe(
        true,
      );
    }
    expect(
      unique(
        DEPLOY_STEPS.map(
          (
            s,
          ) =>
            s.title,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        MEASURE.map(
          (
            m,
          ) =>
            m.text,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        OPT_FAQ.map(
          (
            f,
          ) =>
            f.q,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      unique(
        LEGAL_LINKS.map(
          (
            l,
          ) =>
            l.href,
        ),
      ),
    ).toBe(
      true,
    );
  });
});
