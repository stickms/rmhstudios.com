import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/session/session-context';
import { chancesQuery } from '../medschools.queries';
import { useMedLabels } from './labels';
import { ChanceLine } from './tracker/ChanceLine';

/**
 * The signed-in member's own chance for this school, under the forecast. Signed out, while loading, on any failure, or
 * with no application here (closed ones say nothing) it renders nothing and asks for nothing: it is an addition to the
 * public page, never a gate on it. `cycle` is the site cycle the Forecast tab is showing, so the estimate is read from the
 * member's tracker of that cycle and not from whichever tracker cycle is newest.
 */
export function SchoolChances({ slug, cycle }: { slug: string; cycle: number }) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const { data: session } = useSession();
  const query = useQuery({ ...chancesQuery({ school: slug, cycle }), enabled: !!session });
  const shown = (query.data?.chances ?? []).filter((c) => c.status !== 'closed');
  if (!session || shown.length === 0) return null;
  return (
    <section
      className="medapp-section medapp-section--panel"
      aria-label={t('chance-heading', { defaultValue: 'Your estimate' })}
    >
      <h2 className="medapp-h2">{t('chance-heading', { defaultValue: 'Your estimate' })}</h2>
      {shown.map((c) => (
        <div key={c.applicationId}>
          {shown.length > 1 ? <p className="medapp-label">{programFilterLabel(c.program)}</p> : null}
          <ChanceLine chance={c} />
        </div>
      ))}
    </section>
  );
}
