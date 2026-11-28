import type { z } from 'zod';

export function readInput<T extends z.ZodType>(raw: unknown, schema: T) {
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? ({ ok: true, data: parsed.data as z.infer<T> } as const)
    : ({ ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request' } as const);
}

export async function readBody<T extends z.ZodType>(request: Request, schema: T) {
  return readInput(await request.json().catch(() => null), schema);
}

/** Repeated query keys keep the last value, as on the developer routes. */
export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
