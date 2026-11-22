// What the rmhos-image workflow promises about publishing, held in place: a publish is opt-in, main
// only, checked before the build, and the image outlives a failed upload.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const raw = readFileSync(join(process.cwd(), '.github/workflows/rmhos-image.yml'), 'utf8');
const wf = parse(raw) as {
  on: {
    workflow_dispatch: {
      inputs: Record<
        string,
        {
          default: unknown;
          type: string;
        }
      >;
    };
  };
  jobs: {
    image: {
      steps: {
        name?: string;
        if?: string;
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
      }[];
    };
  };
};
const steps = wf.jobs.image.steps;
const named = (re: RegExp) => steps.find((s) => re.test(s.name ?? ''));

describe('rmhos-image workflow', () => {
  it('publishes only when asked: publish defaults to false', () => {
    expect(wf.on.workflow_dispatch.inputs.publish?.default).toBe(false);
    expect(wf.on.workflow_dispatch.inputs.force?.default).toBe(false);
  });

  it('can publish a previous run’s artifact instead of rebuilding', () => {
    expect(wf.on.workflow_dispatch.inputs.from_run?.type).toBe('string');
    const fetchStep = named(/Fetch the artifact/);
    expect(fetchStep?.if).toBe("inputs.from_run != ''");
    expect(String(fetchStep?.uses)).toMatch(/^actions\/download-artifact@[0-9a-f]{40}$/);
    for (const n of [/Build the image/, /Boot it headless/, /Size budgets/]) {
      expect(named(n)?.if).toBe("inputs.from_run == ''");
    }
  });

  it('verifies the source run with the API before downloading its artifact', () => {
    const verify = named(/Verify the source run/);
    expect(verify?.if).toBe("inputs.from_run != ''");
    expect(steps.indexOf(verify!)).toBeLessThan(steps.indexOf(named(/Fetch the artifact/)!));
    expect(steps.indexOf(verify!)).toBeLessThan(steps.findIndex((s) => /Publish to R2/.test(s.name ?? '')));
    const run = String(verify?.run);
    expect(run).toContain('actions/runs/${FROM_RUN}');
    expect(run).toContain('rmhos-image.yml');
    expect(run).toContain('"$branch" = "main"');
    expect(run).toContain('"$conclusion" = "success"');
    // the input reaches the shell through env, never interpolated into the script
    expect(run).not.toContain('${{');
    expect(JSON.stringify(verify)).toContain('github.token');
    // and the default token is enough: the workflow asks for actions: read
    expect(
      (
        wf as unknown as {
          permissions: Record<string, string>;
        }
      ).permissions.actions,
    ).toBe('read');
  });

  it('checks main and every secret in the FIRST step, before the build', () => {
    const first = steps[0];
    expect(first?.name).toMatch(/Preflight/);
    expect(first?.run).toContain('refs/heads/main');
    for (const v of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'])
      expect(first?.run).toContain(v);
    expect(steps.findIndex((s) => /Build the image/.test(s.name ?? ''))).toBeGreaterThan(0);
  });

  it('keeps the image directory as a 30-day artifact, with its manifest', () => {
    const keep = named(/Keep the image as an artifact/);
    expect(String(keep?.uses)).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(keep?.with).toMatchObject({
      path: 'public/rmhos-dev',
      'retention-days': 30,
      'if-no-files-found': 'error',
    });
    // the artifact is made before the publish step, so a failed upload loses nothing
    expect(steps.indexOf(keep!)).toBeLessThan(steps.findIndex((s) => /Publish to R2/.test(s.name ?? '')));
  });

  it('prints the block to paste after the run', () => {
    expect(steps.at(-1)?.run).toContain('print-pin.mjs');
  });

  it('only gives the R2 secrets to the steps that need them', () => {
    const withSecrets = steps.filter((s) => JSON.stringify(s).includes('secrets.S3_'));
    expect(withSecrets.map((s) => s.name)).toEqual([
      'Preflight (publish needs main and the R2 secrets)',
      'Publish to R2',
    ]);
  });
});
