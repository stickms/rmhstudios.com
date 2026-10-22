import type { DiscordMessage, Notifier } from '../discord';
import type { DurableObjectStorageLike } from '../env';

export function memoryStorage(): DurableObjectStorageLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string) {
      return structuredClone(data.get(key)) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      data.set(key, structuredClone(value));
    },
    async delete(key: string) {
      return data.delete(key);
    },
    async list<T>({ prefix }: { prefix: string }) {
      const out = new Map<string, T>();
      for (const [k, v] of data) if (k.startsWith(prefix)) out.set(k, structuredClone(v) as T);
      return out;
    },
  };
}

export function recordingNotifier(): Notifier & { posts: DiscordMessage[]; edits: { id: string; msg: DiscordMessage }[] } {
  const posts: DiscordMessage[] = [];
  const edits: { id: string; msg: DiscordMessage }[] = [];
  return {
    posts,
    edits,
    async post(msg) {
      posts.push(msg);
      return `m${posts.length}`;
    },
    async edit(id, msg) {
      edits.push({ id, msg });
    },
  };
}

export const ctx = { roleId: 'ROLE', escalationRoleId: 'ESC', runbookBase: 'https://example.test/runbooks' };
