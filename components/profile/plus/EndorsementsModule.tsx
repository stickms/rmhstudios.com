'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Award } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useSession } from '@/components/Providers';
import { SKILLS } from '@/lib/profile/skills';
import { useJson } from './useJson';

interface EndorsementData {
  counts: Record<string, number>;
  mine: string[];
  open: boolean;
}

/**
 * P8 — skill endorsements. A fixed list of creator skills; members vouch for
 * each other, once per skill. Counts are shown here; a visitor's own
 * endorsements are toggles. Adding this module to the showcase is the owner's
 * opt-in to being endorsed.
 */
export default function EndorsementsModule({
  title,
  userId,
  isOwner,
}: {
  title: string;
  userId: string;
  isOwner: boolean;
}) {
  const { t } = useTranslation('f-profile-plus');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const canEndorse = signedIn && !isOwner;
  const { data, setData } = useJson<EndorsementData>(
    `/api/profile/${encodeURIComponent(userId)}/endorsements`,
  );
  const [pending, setPending] = useState<string | null>(null);

  const skillName = (id: string) =>
    t(`skill-${id}`, { defaultValue: SKILLS.find((s) => s.id === id)?.label ?? id });

  async function set(skill: string, on: boolean) {
    if (!data) return;
    setPending(skill);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(userId)}/endorsements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill, on }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<EndorsementData> & {
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? t('endorse-failed', { defaultValue: "Couldn't save that" }));
        return;
      }
      setData({ counts: json.counts ?? {}, mine: json.mine ?? [], open: json.open ?? true });
    } finally {
      setPending(null);
    }
  }

  const counts = data?.counts ?? {};
  const endorsed = SKILLS.filter((s) => (counts[s.id] ?? 0) > 0);
  const addable = SKILLS.filter(
    (s) => !(data?.mine ?? []).includes(s.id) && (counts[s.id] ?? 0) === 0,
  );

  if (data !== undefined && endorsed.length === 0 && !canEndorse && !isOwner) return null;

  return (
    <WidgetFrame
      title={title}
      icon={Award}
      loading={data === undefined}
      empty={data !== undefined && endorsed.length === 0 && !canEndorse}
      emptyTitle={t('skills-empty', { defaultValue: 'No endorsements yet' })}
      emptyDescription={
        isOwner
          ? t('skills-empty-owner', {
              defaultValue: 'When members vouch for your skills, they show up here.',
            })
          : undefined
      }
    >
      {endorsed.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {endorsed.map((s) => {
            const mine = (data?.mine ?? []).includes(s.id);
            return (
              <li key={s.id}>
                <Button
                  variant={mine ? 'accent-outline' : 'outline'}
                  size="xs"
                  disabled={!canEndorse || pending === s.id}
                  aria-pressed={canEndorse ? mine : undefined}
                  onClick={canEndorse ? () => void set(s.id, !mine) : undefined}
                  title={
                    canEndorse
                      ? mine
                        ? t('endorse-withdraw', { defaultValue: 'Withdraw your endorsement' })
                        : t('endorse-add', { defaultValue: 'Endorse this skill' })
                      : undefined
                  }
                >
                  {skillName(s.id)}
                  <span className="tabular-nums text-site-text-muted">{counts[s.id]}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canEndorse && addable.length > 0 ? (
        <div className={endorsed.length > 0 ? 'mt-3' : ''}>
          <Select
            controlSize="sm"
            value=""
            placeholder={t('endorse-pick', { defaultValue: 'Endorse a skill…' })}
            aria-label={t('endorse-pick', { defaultValue: 'Endorse a skill…' })}
            onChange={(e) => {
              if (e.target.value) void set(e.target.value, true);
            }}
          >
            {addable.map((s) => (
              <option key={s.id} value={s.id}>
                {skillName(s.id)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </WidgetFrame>
  );
}
