import { TradeError } from '@/lib/cards/trades.server';

/** Run a trade action and turn a typed refusal into the response the client reads. */
export async function tradeResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof TradeError) {
      return Response.json({ error: err.code, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
