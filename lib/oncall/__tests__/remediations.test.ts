import { describe, expect, it, vi } from 'vitest';
import { alarmIdOf, isRemediationId, remediationsFor, REMEDIATIONS } from '../remediations';

// vi.mock keeps the admin consoles (database, pg-boss) out of a pure unit test.
vi.mock('@/lib/admin/jobs.server', () => ({ listJobs: vi.fn(), listQueues: vi.fn(), runJobAction: vi.fn() }));
vi.mock('@/lib/admin/outbox-admin.server', () => ({ runOutboxAction: vi.fn(), summarizeOutbox: vi.fn() }));

describe('remediation registry', () => {
  it('offers a deploy re-run for failed deploys but not for a release the guard just rolled back', () => {
    for (const id of ['D01', 'D02', 'D03', 'D04'])
      expect(remediationsFor(id).map((r) => r.id)).toContain('deploy.rerun');
    expect(remediationsFor('D05')).toEqual([]);
  });

  it('maps queue and outbox alarms, and nothing for an alarm with no safe action', () => {
    expect(remediationsFor('A15').map((r) => r.id)).toEqual(['outbox.requeue-dead']);
    expect(
      remediationsFor('B13')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['jobs.retry-failed', 'outbox.requeue-dead']);
    expect(remediationsFor('A01')).toEqual([]);
  });

  it('strips an instance from a key and validates action ids', () => {
    expect(alarmIdOf('A07:rmhbox')).toBe('A07');
    expect(alarmIdOf('D03')).toBe('D03');
    expect(isRemediationId('deploy.rerun')).toBe(true);
    expect(isRemediationId('rm -rf')).toBe(false);
    expect(REMEDIATIONS.every((r) => r.danger)).toBe(true);
  });
});

describe('deploy re-run', () => {
  it('dispatches deploy.yml on main with the token, and explains a refusal', async () => {
    const { rerunDeploy, availability } = await import('../remediate.server');
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const msg = await rerunDeploy({ ONCALL_GITHUB_TOKEN: 'tok', GITHUB_REPOSITORY: 'o/r' } as NodeJS.ProcessEnv, ok);
    expect(msg).toMatch(/started/);
    expect(calls[0]!.url).toBe('https://api.github.com/repos/o/r/actions/workflows/deploy.yml/dispatches');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ref: 'main' });
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');

    const refused = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(rerunDeploy({ ONCALL_GITHUB_TOKEN: 'tok' } as NodeJS.ProcessEnv, refused)).rejects.toThrow(/403/);
    await expect(rerunDeploy({} as NodeJS.ProcessEnv, ok)).rejects.toThrow(/ONCALL_GITHUB_TOKEN/);

    expect(availability({} as NodeJS.ProcessEnv)['deploy.rerun'].available).toBe(false);
    expect(availability({ ONCALL_GITHUB_TOKEN: 'x' } as NodeJS.ProcessEnv)['deploy.rerun'].available).toBe(true);
  });
});
