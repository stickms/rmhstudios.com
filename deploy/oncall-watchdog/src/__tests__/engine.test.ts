import { describe, expect, it } from 'vitest';
import { alertMessage } from '../discord';
import { Engine, MAX_ATTACHMENT_CHARS, REPAGE_MS, RESOLVE_NOTE_MAX, validateInput, type AlarmInput, type AlarmRecord } from '../engine';
import { ctx, memoryStorage, recordingNotifier } from './helpers';

// The paging contract on-call depends on: one message per incident, @oncall
// pinged only for Sev1/2, re-pinged every 10 min until someone presses Ack.

const SITE_DOWN: AlarmInput = { id: 'A01', sev: 2, title: 'Site down', source: 'test', detail: 'HTTP 502' };
const T0 = 1_800_000_000_000;

function setup() {
  const storage = memoryStorage();
  const notifier = recordingNotifier();
  return { storage, notifier, engine: new Engine(storage, notifier, ctx) };
}

describe('Engine', () => {
  it('pages once per incident and dedupes re-fires', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.fire({ ...SITE_DOWN, detail: 'HTTP 503' }, T0 + 60_000);

    expect(notifier.posts).toHaveLength(1);
    expect(notifier.posts[0]!.content).toContain('<@&ROLE>');
    expect(notifier.posts[0]!.allowed_mentions).toEqual({ parse: [], roles: ['ROLE'] });
    expect((await engine.get('A01'))?.detail).toBe('HTTP 503');
  });

  it('does not mention anyone for Sev3+', async () => {
    const { engine, notifier } = setup();
    await engine.fire({ ...SITE_DOWN, id: 'B01', sev: 3 }, T0);
    expect(notifier.posts[0]!.content).not.toContain('<@&');
    expect(notifier.posts[0]!.allowed_mentions).toEqual({ parse: [] });
  });

  it('re-pages every 10 minutes until acked, then stops', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.tick(T0 + REPAGE_MS - 1);
    expect(notifier.posts).toHaveLength(1);

    await engine.tick(T0 + REPAGE_MS);
    expect(notifier.posts).toHaveLength(2);
    expect(notifier.posts[1]!.message_reference?.message_id).toBe('m1');
    expect(notifier.posts[1]!.allowed_mentions.roles).toEqual(['ROLE']);

    const acked = await engine.ack('A01', 'U1', T0 + REPAGE_MS + 1);
    expect(typeof acked).not.toBe('string');
    await engine.tick(T0 + 5 * REPAGE_MS);
    expect(notifier.posts).toHaveLength(2);
  });

  it('refuses a second ack and an ack after resolution', async () => {
    const { engine } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.ack('A01', 'U1', T0 + 1);
    expect(await engine.ack('A01', 'U2', T0 + 2)).toMatch(/Already acknowledged by <@U1>/);
    await engine.resolve('A01', T0 + 3);
    expect(await engine.ack('A01', 'U2', T0 + 4)).toMatch(/resolved/);
  });

  it('resolves by editing the original and replying under it', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.resolve('A01', T0 + 5 * 60_000, 'HTTP 200');

    expect(notifier.edits.at(-1)?.id).toBe('m1');
    expect(notifier.edits.at(-1)?.msg.components).toEqual([
      { type: 1, components: [expect.objectContaining({ style: 5, label: 'Runbook' })] },
    ]);
    expect(notifier.posts.at(-1)?.content).toContain('Resolved** after 5m');
    expect(notifier.posts.at(-1)?.allowed_mentions.roles).toEqual([]);
  });

  it('escalation makes it Sev1, clears the ack and pages both roles', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.ack('A01', 'U1', T0 + 1);
    const rec = (await engine.escalate('A01', 'U2', T0 + 2)) as AlarmRecord;
    await engine.announceEscalation(rec);

    expect(rec.sev).toBe(1);
    expect(rec.acked).toBeUndefined();
    expect(notifier.posts.at(-1)?.allowed_mentions.roles).toEqual(['ROLE', 'ESC']);
    // Unacked Sev1 keeps paging.
    await engine.tick(T0 + 2 + REPAGE_MS);
    expect(notifier.posts.at(-1)?.content).toContain('unacknowledged');
  });

  it('a worsening re-fire into paging range pages and voids the old ack', async () => {
    const { engine, notifier } = setup();
    await engine.fire({ ...SITE_DOWN, sev: 3 }, T0);
    await engine.fire(SITE_DOWN, T0 + 60_000);
    expect((await engine.get('A01'))?.sev).toBe(2);
    expect(notifier.posts.at(-1)?.allowed_mentions.roles).toEqual(['ROLE']);
  });
});

describe('alertMessage buttons', () => {
  it('has Ack + Escalate + Runbook while paging, and a disabled Ack once acked', async () => {
    const { engine } = setup();
    const rec = await engine.fire(SITE_DOWN, T0);
    const ids = (alertMessage(rec, ctx).components as { components: { custom_id?: string; url?: string }[] }[])[0]!.components;
    expect(ids.map((b) => b.custom_id ?? b.url)).toEqual(['ack|A01', 'esc|A01', 'https://example.test/runbooks/A01.md']);

    const acked = (await engine.ack('A01', 'U1', T0 + 1)) as AlarmRecord;
    const msg = alertMessage(acked, ctx);
    expect(msg.content).not.toContain('<@&ROLE>');
    expect((msg.components as { components: { disabled?: boolean }[] }[])[0]!.components[0]!.disabled).toBe(true);
  });
});

describe('validateInput', () => {
  it('rejects automated Sev1 and bad keys', () => {
    expect(validateInput({ ...SITE_DOWN, sev: 1 })).toMatch(/human/);
    expect(validateInput({ ...SITE_DOWN, instance: 'a b' })).toMatch(/letters/);
    expect(validateInput({ id: 'A01' })).toMatch(/required/);
    expect(validateInput(SITE_DOWN)).toMatchObject({ id: 'A01', sev: 2 });
  });
});

// Long evidence rides beside the message as a text file, because it will not
// fit an embed (4000 chars) or a reply (2000).
describe('alarm attachments', () => {
  const FILE = { name: 'diagnostics-content-feed-180349.txt', content: 'the whole report\n'.repeat(200) };

  it('posts the file with a new alarm and never stores it', async () => {
    const { engine, notifier, storage } = setup();
    await engine.fire({ ...SITE_DOWN, attachment: FILE }, T0);
    expect(notifier.posts).toHaveLength(1);
    expect(notifier.files[0]).toEqual([FILE]);
    expect(JSON.stringify([...storage.data.values()])).not.toContain('the whole report');
  });

  it('posts a quiet reply with new evidence for an alarm that is already up', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.fire({ ...SITE_DOWN, attachment: FILE }, T0 + 60_000);
    expect(notifier.posts).toHaveLength(2);
    expect(notifier.posts[1]!.content).toContain('Updated diagnostics');
    expect(notifier.posts[1]!.allowed_mentions).toEqual({ parse: [], roles: [] });
    expect(notifier.files[1]).toEqual([FILE]);
  });

  it('attaches the file to the resolve reply and clamps the echoed note', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.resolve('A01', T0 + 120_000, 'x'.repeat(5000), FILE);
    const reply = notifier.posts[1]!;
    expect(reply.content!.length).toBeLessThan(2000);
    expect(reply.content).toContain('x'.repeat(RESOLVE_NOTE_MAX));
    expect(reply.content).not.toContain('x'.repeat(RESOLVE_NOTE_MAX + 1));
    expect(notifier.files[1]).toEqual([FILE]);
  });

  it('sends nothing extra when there is no attachment', async () => {
    const { engine, notifier } = setup();
    await engine.fire(SITE_DOWN, T0);
    await engine.resolve('A01', T0 + 60_000);
    expect(notifier.files).toEqual([undefined, undefined]);
  });

  it('validates the attachment: a .txt name of safe characters and bounded content', () => {
    const base = { id: 'A01', sev: 2, title: 't', source: 's' };
    expect(validateInput({ ...base, attachment: FILE })).toMatchObject({ attachment: FILE });
    expect(validateInput(base)).not.toHaveProperty('attachment');
    const bad = [
      { name: '../etc/passwd.txt', content: 'x' },
      { name: 'report.exe', content: 'x' },
      { name: 'a b.txt', content: 'x' },
      { name: '.hidden.txt', content: 'x' },
      { name: 'ok.txt', content: '' },
      { name: 'ok.txt', content: 'x'.repeat(MAX_ATTACHMENT_CHARS + 1) },
      { name: 5, content: 'x' },
      'not an object',
      null,
    ];
    for (const attachment of bad) expect(typeof validateInput({ ...base, attachment }), JSON.stringify(attachment)?.slice(0, 40)).toBe('string');
    expect(validateInput({ ...base, attachment: { name: 'ok.txt', content: 'x'.repeat(MAX_ATTACHMENT_CHARS) } })).toMatchObject({ attachment: { name: 'ok.txt' } });
  });
});
