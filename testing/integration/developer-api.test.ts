/**
 * The public developer API (`/api/v1`): the paywall on key creation, bearer
 * authentication, revocation, and scope enforcement. Keys are credentials
 * handed to third-party code, so every one of these is a security boundary.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';

let keyOwner: FreshMember;
const bearer = (key: string) => ({
  authorization: `Bearer ${key}`,
});

beforeAll(async () => {
  keyOwner = await createFreshMember('developer-key-owner', { starterSubscription: true });
});

afterAll(async () => {
  await removeFreshMembers([keyOwner]);
  await closeDb();
});

async function createKey(scopes?: string[]): Promise<{
  id: string;
  key: string;
}> {
  const res = await keyOwner.client.post('/api/developer/keys', {
    name: `integ ${Date.now()}`,
    ...(scopes
      ? {
          scopes,
        }
      : {}),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  expect(typeof res.body.key).toBe('string');
  return {
    id: res.body.id,
    key: res.body.key,
  };
}

describe('developer API', () => {
  it('refuses to issue a key to a free account', async () => {
    const res = await new Client(inject('bob').cookies).post('/api/developer/keys', {
      name: 'free tier key',
    });
    expect(res.status).toBe(403);
  });

  it('authenticates a paid key, and a revoked key stops working', async () => {
    const { id, key } = await createKey(['read:profile']);

    const me = await new Client().get('/api/v1/me', bearer(key));
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(keyOwner.id);

    // The plaintext is shown once: listing keys never returns it.
    const list = await keyOwner.client.get('/api/developer/keys');
    expect(JSON.stringify(list.body)).not.toContain(key);

    const revoke = await keyOwner.client.delete(`/api/developer/keys/${id}`);
    expect(revoke.status).toBe(200);
    expect((await new Client().get('/api/v1/me', bearer(key))).status).toBe(401);
  });

  it('rejects a missing or made-up key', async () => {
    expect((await new Client().get('/api/v1/me')).status).toBe(401);
    expect((await new Client().get('/api/v1/me', bearer('rmh_live_not-a-real-key'))).status).toBe(401);
  });

  it('enforces scopes: a read-only key cannot post, a write:posts key can', async () => {
    const readOnly = await createKey(); // no scopes → the read-only default grant
    const denied = await new Client().post(
      '/api/v1/posts',
      {
        content: 'should be denied',
      },
      bearer(readOnly.key),
    );
    expect(denied.status).toBe(403);

    const writer = await createKey(['write:posts']);
    const content = `posted via the API ${Date.now()}`;
    const created = await new Client().post(
      '/api/v1/posts',
      {
        content,
      },
      bearer(writer.key),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const { rows } = await db().query('select "userId", content from rmheet where id = $1', [created.body.id]);
    expect(rows[0]).toEqual({
      userId: keyOwner.id,
      content,
    });
  });
});
