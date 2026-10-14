import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/Providers';

export type ExperimentVariant = 'control' | 'test';

async function fetchAssignments(): Promise<Record<string, ExperimentVariant>> {
  const res = await fetch('/api/experiments', { credentials: 'include' });
  if (!res.ok) return {};
  return ((await res.json()) as { assignments: Record<string, ExperimentVariant> }).assignments;
}

const exposed = new Set<string>();

function send(key: string, event: 'expose' | 'convert') {
  void fetch('/api/experiments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, event }),
    keepalive: true,
  }).catch(() => {});
}

/** Count a goal for an experiment. Safe to call repeatedly; the server keeps the first. */
export function convertExperiment(key: string) {
  send(key, 'convert');
}

/**
 * The caller's variant for an experiment: 'control' while loading, signed out,
 * or when the experiment is not running. One shared fetch per session; the
 * exposure is reported once, when the variant is real.
 */
export function useExperiment(key: string): ExperimentVariant {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const { data } = useQuery({
    queryKey: ['experiments'],
    queryFn: fetchAssignments,
    enabled: signedIn,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const variant = data?.[key];
  useEffect(() => {
    if (!variant || exposed.has(key)) return;
    exposed.add(key);
    send(key, 'expose');
  }, [key, variant]);
  return variant ?? 'control';
}
