'use client';

/**
 * "Can you make it?" — the page's most-used control, and its roster.
 *
 * The three states are distinguished by **fill, border style and icon shape**,
 * never by hue: the page is monochrome by design, and a state carried by colour
 * alone would fail WCAG 1.4.1 anyway. Solid = going, dashed outline = tentative,
 * flat fill = out; check, clock and slash respectively.
 *
 * Tapping the state you are already on clears it, which is what people expect
 * from a toggle and saves a separate "clear" affordance on a phone.
 *
 * The labels are resolved per render rather than baked into a module constant,
 * because a constant is evaluated once at import — before i18next has a
 * language — and would pin the page to whatever locale loaded first.
 */

import { Check, CircleSlash, Clock3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Availability, SessionResponseDTO } from '@/lib/pf2ecal/types';

const ORDER: Availability[] = ['GOING', 'TENTATIVE', 'UNAVAILABLE'];

const ICONS: Record<Availability, LucideIcon> = {
  GOING: Check,
  TENTATIVE: Clock3,
  UNAVAILABLE: CircleSlash,
};

type Labeller = (status: Availability) => { label: string; short: string };

/** Long + short labels for each state, in the active language. */
export function useAvailabilityLabels(): Labeller {
  const { t } = useTranslation('r-pf2ecal');
  return (status) => {
    switch (status) {
      case 'GOING':
        return {
          label: t('avail-going', { defaultValue: "I'm in" }),
          short: t('avail-going-short', { defaultValue: 'In' }),
        };
      case 'TENTATIVE':
        return {
          label: t('avail-tentative', { defaultValue: 'Maybe' }),
          short: t('avail-tentative-short', { defaultValue: 'Maybe' }),
        };
      default:
        return {
          label: t('avail-out', { defaultValue: "Can't make it" }),
          short: t('avail-out-short', { defaultValue: 'Out' }),
        };
    }
  };
}

export function availabilityIcon(status: Availability): LucideIcon {
  return ICONS[status];
}

interface AvailabilityPickerProps {
  value: Availability | null;
  onChange: (next: Availability | null) => void;
  disabled?: boolean;
  /** Compact spacing for the card; the sheet uses the roomy default. */
  dense?: boolean;
}

export function AvailabilityPicker({ value, onChange, disabled, dense }: AvailabilityPickerProps) {
  const { t } = useTranslation('r-pf2ecal');
  const labels = useAvailabilityLabels();

  return (
    // A group of independent toggles, not a tab strip: each button reports its
    // own pressed state, so a screen reader announces "I'm in, pressed" rather
    // than making the user infer the selection from a container.
    <div
      role="group"
      aria-label={t('avail-group', { defaultValue: 'Your availability' })}
      className={dense ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}
    >
      {ORDER.map((status) => {
        const Icon = ICONS[status];
        const { label, short } = labels(status);
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            className="pf2e-avail"
            data-status={status}
            data-active={active}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : status)}
          >
            <Icon size={14} aria-hidden />
            <span>{dense ? short : label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Roster                                                                     */
/* -------------------------------------------------------------------------- */

/** Group responses by state, in a fixed order so the roster never reshuffles. */
export function groupResponses(
  responses: SessionResponseDTO[],
): Array<{ status: Availability; people: SessionResponseDTO[] }> {
  return ORDER.map((status) => ({
    status,
    people: responses.filter((r) => r.status === status),
  })).filter((group) => group.people.length > 0);
}

/** `3 in · 1 maybe` — the one-line summary on a card. */
export function useSummary(): (responses: SessionResponseDTO[]) => string {
  const { t } = useTranslation('r-pf2ecal');
  const labels = useAvailabilityLabels();
  return (responses) => {
    const groups = groupResponses(responses);
    if (!groups.length) return t('no-replies-yet', { defaultValue: 'No replies yet' });
    return groups
      .map(({ status, people }) => `${people.length} ${labels(status).short.toLowerCase()}`)
      .join(' · ');
  };
}

export function ResponseRoster({ responses }: { responses: SessionResponseDTO[] }) {
  const { t } = useTranslation('r-pf2ecal');
  const labels = useAvailabilityLabels();
  const groups = groupResponses(responses);

  if (!groups.length) {
    return (
      <p className="pf2e-caption">
        {t('roster-empty', {
          defaultValue: 'Nobody has answered yet. You would be the first.',
        })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ status, people }) => {
        const Icon = ICONS[status];
        return (
          <div key={status}>
            <div className="pf2e-caption mb-1.5 flex items-center gap-1.5">
              <Icon size={12} aria-hidden />
              <span>
                {labels(status).label} · {people.length}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {people.map((person) => (
                <li key={person.userId} className="pf2e-body flex items-baseline gap-2">
                  <span className="truncate">{person.name}</span>
                  {person.note && <span className="pf2e-caption truncate">— {person.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
