import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { CompareCounts, CompareMember } from '@/lib/achievements/compare';

/** One member: avatar, name and "128 of 240". */
function MemberLine({ member, fallback }: { member: CompareMember; fallback: string }) {
  const { t } = useTranslation('achievement-compare');
  const name = member.name || member.handle || fallback;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar src={member.image} alt="" size={40} fallbackName={name} />
      <div className="min-w-0">
        <p className="t-heading truncate">{name}</p>
        <p className="t-meta">
          {t('unlocked-of', {
            unlocked: member.unlocked,
            total: member.total,
            defaultValue: '{{unlocked}} of {{total}}',
          })}
        </p>
      </div>
    </div>
  );
}

/** The two members and the three counts: three `t-title` numbers with `t-label` captions, divided by vertical rules. */
export function CompareSummary({
  you,
  them,
  counts,
}: {
  you: CompareMember;
  them: CompareMember;
  counts: CompareCounts;
}) {
  const { t } = useTranslation('achievement-compare');
  const themName = them.name || them.handle || t('them-fallback', { defaultValue: 'Them' });
  const number = new Intl.NumberFormat();
  const stats = [
    { key: 'both', value: counts.both, label: t('count-both', { defaultValue: 'Both have' }) },
    { key: 'you', value: counts.you, label: t('count-you', { defaultValue: 'Only you' }) },
    {
      key: 'them',
      value: counts.them,
      label: t('count-them', { name: themName, defaultValue: 'Only {{name}}' }),
    },
  ];
  return (
    <section aria-label={t('summary-label', { defaultValue: 'Summary' })}>
      <div className="grid gap-4 border-b border-site-border pb-4 sm:grid-cols-2">
        <MemberLine member={you} fallback={t('you-fallback', { defaultValue: 'You' })} />
        <MemberLine member={them} fallback={t('them-fallback', { defaultValue: 'Them' })} />
      </div>
      <dl className="grid grid-cols-3 border-b border-site-border">
        {stats.map((s, i) => (
          <div
            key={s.key}
            className={`flex flex-col-reverse gap-1 py-4 ${i === 0 ? 'pe-4' : 'border-s border-site-border px-4'}`}
          >
            <dt className="t-label">{s.label}</dt>
            <dd className="t-title">{number.format(s.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
