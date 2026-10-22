/**
 * Posting and the social writes on a post: create, validate, like, comment,
 * delete — and that one user can never delete another's post.
 */
import { afterAll, describe, expect, inject, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';

afterAll(closeDb);

const alice = () => new Client(inject('alice').cookies);
const bob = () => new Client(inject('bob').cookies);

async function postCount(userId: string): Promise<number> {
  // RMHark is @@map'd to the table's original name.
  const { rows } = await db().query('select count(*)::int as n from rmheet where "userId" = $1', [userId]);
  return rows[0].n;
}

describe('posts', () => {
  it('creates a post that is readable by id and attributed to its author', async () => {
    const content = `integration post ${Date.now()}`;
    const created = await alice().post('/api/rmharks', { content });
    expect(created.status).toBe(201);
    expect(created.body.content).toBe(content);
    expect(created.body.user.id).toBe(inject('alice').id);

    // Read back as someone else, through the public read path.
    const read = await new Client().get(`/api/rmharks/${created.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.content).toBe(content);
  });

  it('rejects an invalid post with 400 and writes nothing', async () => {
    const before = await postCount(inject('alice').id);
    const res = await alice().post('/api/rmharks', { content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(await postCount(inject('alice').id)).toBe(before);
  });

  it("records another user's like and comment on the post", async () => {
    const post = await alice().post('/api/rmharks', { content: `likeable ${Date.now()}` });
    expect(post.status).toBe(201);
    const id = post.body.id as string;

    const like = await bob().post(`/api/rmharks/${id}/like`, {});
    expect(like.status).toBe(200);
    expect(like.body.liked).toBe(true);

    const comment = await bob().post(`/api/rmharks/${id}/comment`, { content: 'nice one' });
    expect(comment.status).toBe(201);

    const read = await bob().get(`/api/rmharks/${id}`);
    expect(read.body.likeCount).toBe(1);
    expect(read.body.liked).toBe(true);
    expect(read.body.commentCount).toBe(1);

    const comments = await new Client().get(`/api/rmharks/${id}/comment`);
    expect(comments.status).toBe(200);
    expect(JSON.stringify(comments.body)).toContain('nice one');

    // Unlike is the same endpoint toggled — and the count follows.
    const unlike = await bob().post(`/api/rmharks/${id}/like`, {});
    expect(unlike.body.liked).toBe(false);
    expect((await bob().get(`/api/rmharks/${id}`)).body.likeCount).toBe(0);
  });

  it('lets the author delete a post, and nobody else', async () => {
    const content = `deletable ${Date.now()}`;
    const post = await alice().post('/api/rmharks', { content });
    expect(post.status).toBe(201);
    const id = post.body.id as string;

    const intruder = await bob().delete(`/api/rmharks/${id}`);
    expect([403, 404]).toContain(intruder.status);
    expect((await new Client().get(`/api/rmharks/${id}`)).status).toBe(200);

    const { rows: kept } = await db().query('select "deletedAt" from rmheet where id = $1', [id]);
    expect(kept[0].deletedAt).toBeNull();

    const own = await alice().delete(`/api/rmharks/${id}`);
    expect(own.status).toBe(200);
    // Deletion is a soft delete: the id keeps resolving (so reply threads do
    // not break) but as a tombstone — the original text must never come back.
    const after = await new Client().get(`/api/rmharks/${id}`);
    expect(after.body.content).not.toBe(content);
    expect(after.body.content).toMatch(/deleted/i);
    const { rows } = await db().query('select "deletedAt" from rmheet where id = $1', [id]);
    expect(rows[0].deletedAt).not.toBeNull();
  });
});
