/**
 * The learner's instrument and range for a loading placeholder: the store's profile once it has
 * loaded, before that the `/rmhmusic` layout route's context (read with its auth check on the
 * server, so the server-rendered skeleton is already the learner's own). Never localStorage.
 */
import { getRouteApi } from '@tanstack/react-router';
import { DEFAULT_LEARNER_SHAPE, type LearnerShape } from '@/lib/rmhmusic/learn/learner-shape';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';

const layout = getRouteApi('/rmhmusic');

export function useLearnerShape(): LearnerShape {
  const fromRoute = layout.useRouteContext({
    select: (c) => c.learner,
  });
  const profile = useLearnStore((s) => s.profile);
  if (profile)
    return {
      instrument: profile.instrument,
      voiceRange: profile.voiceRange ?? null,
    };
  return fromRoute ?? DEFAULT_LEARNER_SHAPE;
}
