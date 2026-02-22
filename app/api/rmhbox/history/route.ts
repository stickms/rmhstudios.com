/**
 * RMHbox History API — GET /api/rmhbox/history
 *
 * Stub endpoint for fetching match history.
 * Full implementation in Phase 4.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ matches: [] });
}
