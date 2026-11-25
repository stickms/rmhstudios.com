import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { decodeMine, encodeMine, mineIsKnown, type MineChoice, type MineLists } from '../engine/mine';
import { MedSelect } from './controls/MedSelect';

/**
 * "My schools" (owner 2026-11-24): All schools, My cycle (the current tracker cycle), All my lists, or one list by
 * name. A field-shaped select like the toolbar's other controls; signed in only (the caller renders nothing signed
 * out). A saved or linked list that no longer exists reads as "All schools", as the filter does.
 */
export function MineSelect({
  value,
  lists,
  onChange,
  compact,
  containerClassName,
}: {
  value: MineChoice | null;
  lists: { lists: readonly (MineLists['lists'][number] & { name: string })[] } | undefined;
  onChange: (next: MineChoice | null) => void;
  compact?: boolean;
  /** On the field's wrapper (the toolbar's and the rail's grid place that). */
  containerClassName?: string;
}) {
  const { t } = useTranslation('medschools');
  const shown = value && (value.kind !== 'list' || !lists || mineIsKnown(value, lists)) ? encodeMine(value) : '';
  return (
    <MedSelect
      aria-label={t('index-mine-label', { defaultValue: 'My schools' })}
      className={cn(compact && 'medapp-select--compact')}
      {...(containerClassName ? { containerClassName } : {})}
      value={shown}
      onChange={(e) => onChange(decodeMine(e.target.value))}
    >
      <option value="">{t('index-mine-none', { defaultValue: 'All schools' })}</option>
      <option value="cycle">{t('index-mine-cycle', { defaultValue: 'My cycle' })}</option>
      <option value="lists">{t('index-mine-lists', { defaultValue: 'All my lists' })}</option>
      {(lists?.lists ?? []).map((l) => (
        <option key={l.id} value={encodeMine({ kind: 'list', id: l.id })}>
          {l.name}
        </option>
      ))}
    </MedSelect>
  );
}

/** Signed out, a `?mine=` or `?list=` link shows every school; say why in one muted line. */
export function MineSignedOutNote({ search }: { search: { mine?: 'cycle' | undefined; list?: string | undefined } }) {
  const { t } = useTranslation('medschools');
  if (search.mine) {
    return (
      <p className="medapp-note">
        {t('index-mine-signed-out', {
          defaultValue: "This link filters to your tracker's schools. Sign in to see them; all schools are shown.",
        })}
      </p>
    );
  }
  if (search.list) {
    return (
      <p className="medapp-note">
        {t('index-list-signed-out', {
          defaultValue: 'This link filters to a saved list. Sign in to see your lists; all schools are shown.',
        })}
      </p>
    );
  }
  return null;
}

/** The empty state when the chosen "My schools" set itself has no schools (not when other filters leave none). */
export function useMineEmptyText(): (choice: MineChoice) => string {
  const { t } = useTranslation('medschools');
  return (choice) =>
    choice.kind === 'cycle'
      ? t('index-mine-empty-cycle', { defaultValue: 'Your tracker has no schools in this cycle yet.' })
      : choice.kind === 'lists'
        ? t('index-mine-empty-lists', { defaultValue: 'Your lists have no schools yet.' })
        : t('index-mine-empty-list', { defaultValue: 'This list has no schools yet.' });
}
