import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { filterGroups, type EndpointGroup } from '@/lib/developer/explorer';
import { cn } from '@/lib/utils';

interface EndpointListProps {
  groups: readonly EndpointGroup[];
  selectedId: string | null;
  filter: string;
  onFilter: (value: string) => void;
  onSelect: (operationId: string) => void;
}

/** Every endpoint, grouped as the registry groups them, with a filter. The method is text, not colour. */
export function EndpointList({ groups, selectedId, filter, onFilter, onSelect }: EndpointListProps) {
  const { t } = useTranslation('dev-explorer');
  const headingId = useId();
  const shown = filterGroups(groups, filter);

  return (
    <nav aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="sr-only">
        {t('list-heading', { defaultValue: 'Endpoints' })}
      </h2>
      <Input
        type="search"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        placeholder={t('list-filter-placeholder', { defaultValue: 'Filter by method, path, summary or scope' })}
        aria-label={t('list-filter-label', { defaultValue: 'Filter endpoints' })}
        autoComplete="off"
        spellCheck={false}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={t('list-empty-title', { defaultValue: 'No endpoints match' })}
          description={t('list-empty-description', { defaultValue: 'Try a shorter filter.' })}
        />
      ) : (
        <div className="space-y-4 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto">
          {shown.map(({ group, endpoints }) => (
            <section key={group} aria-label={group}>
              <h3 className="t-label pb-1">{group}</h3>
              <ul>
                {endpoints.map((ep) => {
                  const selected = ep.operationId === selectedId;
                  return (
                    <li key={ep.operationId} className="border-b border-site-border">
                      <button
                        type="button"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => onSelect(ep.operationId)}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 px-2 py-2 text-start transition-[background-color] duration-(--m1) ease-[ease] hover:bg-site-bg-subtle',
                          selected && 'bg-site-bg-subtle',
                        )}
                      >
                        <span dir="ltr" className="t-meta break-all text-site-text">
                          <span className="font-semibold">{ep.method}</span> {ep.path}
                        </span>
                        <span className={cn('t-body', selected && 'font-medium')}>{ep.summary}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </nav>
  );
}
