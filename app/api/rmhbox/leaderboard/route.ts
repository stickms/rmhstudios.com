/**
 * RMHbox Leaderboard API — GET /api/rmhbox/leaderboard
 *
 * Stub endpoint for fetching leaderboard data.
 * Full implementation in Phase 4.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ entries: [], period: 'all-time' });
}
