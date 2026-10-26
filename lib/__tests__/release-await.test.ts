import { describe, expect, it } from 'vitest';
import { awaitRelease } from '../../.github/scripts/release-webhook.mjs';

describe('awaitRelease (post-deploy verification waits for the host)', () => {
  it('polls through in-flight phases and returns the terminal state', async () => {
    const phases = ['queued', 'pulled', 'success'];
    const state = await awaitRelease('release-1-1', {
      pollMs: 1,
      request: async () => ({
        status: 200,
        text: JSON.stringify({ phase: phases.shift(), events: [] }),
      }),
    });
    expect(state.phase).toBe('success');
  });
  it('keeps polling while the listener has not journaled the release yet', async () => {
    let calls = 0;
    const state = await awaitRelease('release-1-1', {
      pollMs: 1,
      request: async () =>
        ++calls < 3
          ? { status: 404, text: '' }
          : { status: 200, text: JSON.stringify({ phase: 'rolledback', events: [] }) },
    });
    expect(state.phase).toBe('rolledback');
  });
  it('fails loudly on a listener too old to answer with JSON', async () => {
    await expect(
      awaitRelease('release-1-1', {
        pollMs: 1,
        request: async () => ({ status: 200, text: 'ok' }),
      }),
    ).rejects.toThrow('Listener must be upgraded');
  });
});
