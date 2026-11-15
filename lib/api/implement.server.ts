/**
 * Bind a typed contract (`lib/contract/endpoint.ts`) to a route handler
 * (redesign audit C1).
 *
 * `implement` IS `defineHandler` — same session → feature → rate limit → zod →
 * try/catch → cache order, written once in `handler.server.ts` — plus three
 * compile-time checks the bare wrapper cannot make:
 *
 *  1. the `body` schema must parse to exactly the contract's `body` type (a `FormData`
 *     body, i.e. a multipart upload, takes no schema: the handler reads
 *     `request.formData()` and validates the parts itself);
 *  2. the `query` schema must parse to exactly the contract's `query` type;
 *  3. the handler must return the contract's `res` type (or a `Response`, for
 *     the error paths and anything streamed).
 *
 * A plain object return is sent with `Response.json`. In development and tests
 * an optional `response` schema is checked against what the handler produced,
 * so a drift between the contract type and the real payload fails loudly where
 * it is cheap; production skips the parse.
 *
 * ```ts
 * export const Route = createFileRoute('/api/widgets')({
 *   server: { handlers: {
 *     POST: implement(createWidget, { rateLimit: 'write', body: widgetBody },
 *       async ({ userId, body }) => saveWidget(userId, body)),
 *   } },
 * });
 * ```
 */

import type { z } from 'zod';
import {
  defineHandler,
  type ApiCtx,
  type AuthMode,
  type HandlerOptions,
} from '@/lib/api/handler.server';
import type { BodyOf, Endpoint, QueryOf, ResOf } from '@/lib/contract/endpoint';

/** Exact type equality (not mere assignability), so a schema cannot silently widen or narrow. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** `S` if its parsed type is exactly `T`, else a readable compile error. */
type SchemaFor<T, S extends z.ZodType | undefined> = [T] extends [undefined | FormData]
  ? undefined
  : S extends z.ZodType
    ? Equals<z.infer<S>, T> extends true
      ? S
      : { __error: 'zod schema does not parse to the contract type'; expected: T; got: z.infer<S> }
    : { __error: 'the contract declares this input; pass its zod schema' };

export type ImplementOptions<
  E extends Endpoint,
  A extends AuthMode,
  B extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
> = Omit<HandlerOptions<A, B, Q>, 'body' | 'query'> & {
  body?: SchemaFor<BodyOf<E>, B>;
  query?: SchemaFor<QueryOf<E>, Q>;
  /** Checked against the handler's return in dev/test only. */
  response?: z.ZodType<ResOf<E>>;
};

const checkResponses = process.env.NODE_ENV !== 'production';

export function implement<
  E extends Endpoint,
  A extends AuthMode = 'required',
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
>(
  contract: E,
  options: ImplementOptions<E, A, B, Q>,
  handler: (ctx: ApiCtx<A, B, Q>) => Promise<ResOf<E> | Response> | ResOf<E> | Response,
) {
  const { response, ...rest } = options;
  return defineHandler<A, B, Q>(
    { label: `${contract.method} ${contract.path}`, ...(rest as HandlerOptions<A, B, Q>) },
    async (ctx) => {
      const out = await handler(ctx);
      if (out instanceof Response) return out;
      if (checkResponses && response) {
        const parsed = response.safeParse(out);
        if (!parsed.success) {
          throw new Error(
            `${contract.method} ${contract.path} returned a body that does not match its contract: ${parsed.error.message}`,
          );
        }
      }
      return Response.json(out);
    },
  );
}
