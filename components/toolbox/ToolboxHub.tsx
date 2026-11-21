import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { SearchField } from '@/components/ui/search-field';
import { categoryLabel, toolCopy } from '@/components/toolbox/tool-copy';
import { TOOL_CATEGORIES, TOOLS, matchesToolQuery } from '@/lib/toolbox/catalog';

/**
 * `/tools` — the Toolbox hub. Every tool as a row on a rule, grouped by category,
 * with a filter that matches the translated name, the description and the
 * catalog's keywords. The list is plain links, so it works with scripting off; the
 * filter only narrows it.
 */
export function ToolboxHub() {
  const { t } = useTranslation('toolbox');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    return TOOL_CATEGORIES.map((category) => ({
      category,
      tools: TOOLS.filter((tool) => tool.category === category)
        .map((tool) => ({ tool, copy: toolCopy(t, tool.slug) }))
        .filter(({ tool, copy }) =>
          matchesToolQuery([copy.name, copy.description, ...tool.keywords].join(' '), query),
        ),
    })).filter((group) => group.tools.length > 0);
  }, [t, query]);

  return (
    <PageLayout
      title={t('hub-title', { defaultValue: 'Toolbox' })}
      description={t('hub-description', {
        defaultValue: 'Small, private utilities. Everything runs on your device and nothing you enter is sent anywhere.',
      })}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4 pb-12">
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t('hub-filter-placeholder', { defaultValue: 'Filter tools' })}
          aria-label={t('hub-filter-label', { defaultValue: 'Filter tools' })}
        />
        {groups.length === 0 ? (
          <p className="t-body text-site-text-muted" role="status">
            {t('hub-empty', { defaultValue: 'No tool matches that filter.' })}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.category} aria-labelledby={`tools-${group.category}`} className="flex flex-col">
              <h2 id={`tools-${group.category}`} className="t-label pb-2">
                {categoryLabel(t, group.category)}
              </h2>
              <ul className="flex flex-col border-t border-site-border">
                {group.tools.map(({ tool, copy }) => {
                  const Icon = copy.icon;
                  return (
                    <li key={tool.slug} className="border-b border-site-border">
                      <Link
                        to={`/tools/${tool.slug}` as string}
                        className="flex min-h-14 items-start gap-3 py-3 transition-[background-color] duration-(--m1) hover:bg-site-bg-subtle"
                      >
                        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-site-text-muted" />
                        <span className="flex min-w-0 flex-col">
                          <span className="t-body font-medium text-site-text">{copy.name}</span>
                          <span className="t-body text-site-text-muted">{copy.description}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </PageLayout>
  );
}
