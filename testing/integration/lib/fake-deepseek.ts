/**
 * A stand-in for the DeepSeek chat-completions API, for the black-box tests of features that call a model.
 *
 * The app under test is started with `DEEPSEEK_API_KEY=integration-fake` and
 * `DEEPSEEK_BASE_URL=http://127.0.0.1:<INTEGRATION_AI_FAKE_PORT>/v1` (`lib/ai/provider.server.ts` reads both), and the
 * test process hosts this server on that port. It answers `POST /v1/chat/completions` with the OpenAI-compatible body
 * the provider's client reads (`choices[0].message.content` and a small `usage` block, so the `AiUsage` ledger gets a
 * real row), and records every request so a test can assert what the model was and was not shown.
 *
 * What the model says is a function of the request: `script(call)` returns the reply for it. The two RMH Med Schools
 * prompts are told apart by what they carry: the answer call's user turn holds a `facts` list, the route call's does
 * not (`kindOf`).
 */
import { createServer, type Server } from 'node:http';

export interface FakeCall {
  system: string;
  user: string;
  /** `answer` when the user turn carries retrieved facts, `route` when it is a Q&A routing request, else `other`. */
  kind: 'route' | 'answer' | 'other';
}

/** A string is the message content; an object is JSON-stringified; `{ status }` fails the request with that status. */
export type FakeReply = string | Record<string, unknown> | { fakeStatus: number };

export type FakeScript = (call: FakeCall) => FakeReply | Promise<FakeReply>;

export interface FakeDeepseek {
  calls(): FakeCall[];
  reset(): void;
  setScript(script: FakeScript): void;
  close(): Promise<void>;
}

/** The user turn is `<user-content>{json}</user-content>`: the JSON inside, or null. */
export function userJson(user: string): Record<string, unknown> | null {
  const m = /<user-content>\s*([\s\S]*?)\s*<\/user-content>/.exec(user);
  if (!m?.[1]) return null;
  try {
    const v: unknown = JSON.parse(m[1]);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function kindOf(user: string): FakeCall['kind'] {
  const j = userJson(user);
  if (!j) return 'other';
  if (Array.isArray(j.facts)) return 'answer';
  if (typeof j.question === 'string') return 'route';
  return 'other';
}

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  return '';
};

export function startFakeDeepseek(port: number, initial: FakeScript): Promise<FakeDeepseek> {
  let script = initial;
  let seen: FakeCall[] = [];
  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            messages?: { role: string; content: unknown }[];
          };
          const system = textOf(body.messages?.find((m) => m.role === 'system')?.content);
          const user = textOf(body.messages?.find((m) => m.role === 'user')?.content);
          const call: FakeCall = { system, user, kind: kindOf(user) };
          seen.push(call);
          const reply = await script(call);
          if (typeof reply === 'object' && 'fakeStatus' in reply) {
            res.writeHead(Number(reply.fakeStatus), { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'fake provider failure' } }));
            return;
          }
          const content = typeof reply === 'string' ? reply : JSON.stringify(reply);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'chatcmpl-fake',
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: 'fake',
              choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
              usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
            }),
          );
        } catch {
          res.writeHead(400).end();
        }
      })();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        calls: () => [...seen],
        reset: () => {
          seen = [];
        },
        setScript: (s) => {
          script = s;
        },
        close: () => new Promise<void>((r) => server.close(() => r())),
      }),
    );
  });
}
