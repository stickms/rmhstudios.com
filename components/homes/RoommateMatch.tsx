import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiJson } from '@/lib/rmhladder/community-client';
import {
  PET_CHOICES,
  SCALE_KEYS,
  type PetChoice,
  type RoommateProfile,
  type ScaleKey,
} from '@/lib/homes/roommate';

type Match =
  | { status: 'match'; percent: number }
  | { status: 'no-quiz' | 'poster-no-quiz' | 'not-applicable' };

const BLANK: RoommateProfile = { sleep: 3, guests: 3, cleanliness: 3, noise: 3, pets: 'fine' };

/**
 * Roommate match for a roommate-wanted listing (F9): the viewer's compatibility
 * with the poster, from a five-question lifestyle quiz. Only a percentage is
 * shown — never either member's answers.
 */
export function RoommateMatch({
  listingId,
  isSignedIn,
}: {
  listingId: string;
  isSignedIn: boolean;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const qc = useQueryClient();
  const [quizOpen, setQuizOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['homes-roommate-match', listingId],
    queryFn: () => apiJson<Match>(`/api/homes/listings/${listingId}/roommate`),
    enabled: isSignedIn,
    staleTime: 60_000,
  });

  const heading = (
    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-site-text font-display">
      <Users className="size-5" aria-hidden />
      {t('rm-heading', { defaultValue: 'Roommate match' })}
    </h2>
  );

  if (!isSignedIn) {
    return (
      <section className="glass-fill mt-5 rounded-site p-4">
        {heading}
        <p className="text-sm text-site-text-muted">
          {t('rm-signed-out', {
            defaultValue:
              'Sign in and take a one-minute quiz to see how well you match with the poster.',
          })}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 min-h-11">
          <Link to="/login" search={{ callbackURL: `/homes/listing/${listingId}` }}>
            {t('rm-sign-in', { defaultValue: 'Sign in' })}
          </Link>
        </Button>
      </section>
    );
  }
  if (isLoading) return <Skeleton className="mt-5 h-24 w-full" />;
  if (!data || data.status === 'not-applicable') return null;

  return (
    <section className="glass-fill mt-5 rounded-site p-4">
      {heading}
      {data.status === 'match' && (
        <p className="text-sm text-site-text">
          <span className="text-2xl font-semibold text-site-accent">{data.percent}%</span>{' '}
          {t('rm-match', {
            defaultValue:
              'lifestyle match with the poster (sleep, guests, cleanliness, noise, pets).',
          })}
        </p>
      )}
      {data.status === 'poster-no-quiz' && (
        <p className="text-sm text-site-text-muted">
          {t('rm-poster-none', {
            defaultValue:
              'The poster has not taken the roommate quiz yet, so there is no match score.',
          })}
        </p>
      )}
      {data.status === 'no-quiz' && (
        <p className="text-sm text-site-text-muted">
          {t('rm-take', {
            defaultValue:
              'Answer five quick questions to see how well you match with the poster. Others only ever see a percentage, never your answers.',
          })}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 min-h-11"
        aria-expanded={quizOpen}
        onClick={() => setQuizOpen((v) => !v)}
      >
        {data.status === 'no-quiz'
          ? t('rm-start', { defaultValue: 'Take the quiz' })
          : t('rm-retake', { defaultValue: 'Update my answers' })}
      </Button>
      {quizOpen && (
        <Quiz
          onSaved={() => {
            setQuizOpen(false);
            void qc.invalidateQueries({ queryKey: ['homes-roommate-match'] });
          }}
        />
      )}
    </section>
  );
}

function Quiz({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation('f-ladder-homes');
  const [answers, setAnswers] = useState<RoommateProfile>(BLANK);
  useQuery({
    queryKey: ['homes-roommate-profile'],
    queryFn: async () => {
      const r = await apiJson<{ profile: RoommateProfile | null }>('/api/homes/roommate');
      if (r.profile) setAnswers(r.profile);
      return r;
    },
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: () => apiJson('/api/homes/roommate', { method: 'PUT', body: answers }),
    onSuccess: () => {
      toast.success(t('rm-saved', { defaultValue: 'Answers saved.' }));
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const questions: Record<ScaleKey, { label: string; options: string[] }> = {
    sleep: {
      label: t('rm-q-sleep', { defaultValue: 'When do you sleep?' }),
      options: [
        t('rm-sleep-1', { defaultValue: 'Early bird — asleep by 10pm' }),
        t('rm-sleep-2', { defaultValue: 'Mostly early' }),
        t('rm-sleep-3', { defaultValue: 'No fixed pattern' }),
        t('rm-sleep-4', { defaultValue: 'Mostly late' }),
        t('rm-sleep-5', { defaultValue: 'Night owl — up past 1am' }),
      ],
    },
    guests: {
      label: t('rm-q-guests', { defaultValue: 'How often do you have guests over?' }),
      options: [
        t('rm-guests-1', { defaultValue: 'Almost never' }),
        t('rm-guests-2', { defaultValue: 'A few times a year' }),
        t('rm-guests-3', { defaultValue: 'A few times a month' }),
        t('rm-guests-4', { defaultValue: 'Most weeks' }),
        t('rm-guests-5', { defaultValue: 'Constantly — open door' }),
      ],
    },
    cleanliness: {
      label: t('rm-q-clean', { defaultValue: 'How tidy do you keep shared spaces?' }),
      options: [
        t('rm-clean-1', { defaultValue: 'Relaxed — I clean when it bugs me' }),
        t('rm-clean-2', { defaultValue: 'Fairly relaxed' }),
        t('rm-clean-3', { defaultValue: 'Tidy most days' }),
        t('rm-clean-4', { defaultValue: 'Very tidy' }),
        t('rm-clean-5', { defaultValue: 'Spotless, on a schedule' }),
      ],
    },
    noise: {
      label: t('rm-q-noise', { defaultValue: 'How loud is your home?' }),
      options: [
        t('rm-noise-1', { defaultValue: 'Silence, please' }),
        t('rm-noise-2', { defaultValue: 'Quiet' }),
        t('rm-noise-3', { defaultValue: 'Normal living sounds' }),
        t('rm-noise-4', { defaultValue: 'Music and company' }),
        t('rm-noise-5', { defaultValue: 'Lively, often loud' }),
      ],
    },
  };
  const petLabel: Record<PetChoice, string> = {
    has: t('rm-pets-has', { defaultValue: 'I have pets' }),
    fine: t('rm-pets-fine', { defaultValue: 'No pets, but fine with them' }),
    no: t('rm-pets-no', { defaultValue: 'No pets, please' }),
  };

  return (
    <form
      className="glass-pane mt-3 space-y-3 rounded-site p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {SCALE_KEYS.map((k) => (
        <label key={k} className="block space-y-1 text-sm">
          <span className="text-site-text-muted">{questions[k].label}</span>
          <Select
            value={String(answers[k])}
            onChange={(e) => setAnswers((a) => ({ ...a, [k]: Number(e.target.value) }))}
          >
            {questions[k].options.map((o, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {o}
              </option>
            ))}
          </Select>
        </label>
      ))}
      <label className="block space-y-1 text-sm">
        <span className="text-site-text-muted">{t('rm-q-pets', { defaultValue: 'Pets?' })}</span>
        <Select
          value={answers.pets}
          onChange={(e) => setAnswers((a) => ({ ...a, pets: e.target.value as PetChoice }))}
        >
          {PET_CHOICES.map((p) => (
            <option key={p} value={p}>
              {petLabel[p]}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" loading={save.isPending}>
        {t('rm-save', { defaultValue: 'Save answers' })}
      </Button>
    </form>
  );
}
