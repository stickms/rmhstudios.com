import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/session/session-context';
import { chancesQuery } from '../medschools.queries';
import { useMedLabels } from './labels';
import { ChanceLine } from './tracker/ChanceLine';

/**
 * The signed-in member's own chance for this school, under the forecast. Signed out, while loading, on any failure, or
 * with no application here (closed ones say nothing) it renders nothing and asks for nothing: it is an addition to the
 * public page, never a gate on it.
 */
export function SchoolChances({ slug }: { slug: string }) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const { data: session } = useSession();
  const query = useQuery({ ...chancesQuery({ school: slug }), enabled: !!session });
  const shown = (query.data?.chances ?? []).filter((c) => c.status !== 'closed');
  if (!session || shown.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" aria-label={t('chance-heading', { defaultValue: 'Your estimate' })}>
      <h2 className="t-heading m-0">{t('chance-heading', { defaultValue: 'Your estimate' })}</h2>
      {shown.map((c) => (
        <div key={c.applicationId}>
          {shown.length > 1 ? <p className="t-label m-0 mt-2">{programFilterLabel(c.program)}</p> : null}
          <ChanceLine chance={c} />
        </div>
      ))}
    </section>
  );
}
