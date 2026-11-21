/**
 * The calls the seeding panel makes (s05-18). Client-safe: contracts only, so
 * the panel holds no endpoint calls of its own.
 */
import { api } from '@/lib/contract/client';
import { getSeedingApi, updateSeedingApi } from '@/lib/tournaments/seeding.contract';
import type { UpdateSeedingInput } from '@/lib/tournaments/seeding-schema';

export const fetchSeeding = (tournamentId: string) =>
  api(getSeedingApi, { params: { id: tournamentId }, retries: 0 });

export const saveSeeding = (tournamentId: string, body: UpdateSeedingInput) =>
  api(updateSeedingApi, { params: { id: tournamentId }, body });
