import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Tabs } from '@/components/ui/tabs';
import { toCurl, toFetch, toPython, type ExplorerRequest } from '@/lib/developer/explorer';

type Language = 'curl' | 'fetch' | 'python';

interface SnippetTabsProps {
  /** Null while required path parameters are still empty. */
  request: ExplorerRequest | null;
  hasKey: boolean;
  includeKey: boolean;
  onIncludeKey: (include: boolean) => void;
}

/** The current request as curl, JavaScript fetch and Python requests. The key is `$RMH_API_KEY` unless opted in. */
export function SnippetTabs({ request, hasKey, includeKey, onIncludeKey }: SnippetTabsProps) {
  const { t } = useTranslation('dev-explorer');
  const [language, setLanguage] = useState<Language>('curl');

  const code = !request
    ? ''
    : language === 'curl'
      ? toCurl(request, { includeKey })
      : language === 'fetch'
        ? toFetch(request, { includeKey })
        : toPython(request, { includeKey });

  return (
    <section aria-labelledby="explorer-snippets-heading" className="space-y-3">
      <h2 id="explorer-snippets-heading" className="t-heading">
        {t('snippets-heading', { defaultValue: 'Code' })}
      </h2>
      <Tabs
        idBase="explorer-snippet"
        aria-label={t('snippets-languages', { defaultValue: 'Snippet language' })}
        value={language}
        onChange={(id) => setLanguage(id as Language)}
        tabs={[
          { id: 'curl', label: t('snippets-curl', { defaultValue: 'curl' }) },
          { id: 'fetch', label: t('snippets-fetch', { defaultValue: 'JavaScript' }) },
          { id: 'python', label: t('snippets-python', { defaultValue: 'Python' }) },
        ]}
      />
      <div
        role="tabpanel"
        id={`explorer-snippet-panel-${language}`}
        aria-labelledby={`explorer-snippet-tab-${language}`}
        className="space-y-3"
      >
        {request ? (
          <>
            <pre
              dir="ltr"
              tabIndex={0}
              aria-label={t('snippets-code-label', { defaultValue: 'Code snippet' })}
              className="t-meta overflow-x-auto rounded-site border border-site-border bg-site-bg-subtle p-3 text-site-text"
            >
              {code}
            </pre>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 t-body">
                <input
                  type="checkbox"
                  checked={includeKey}
                  disabled={!hasKey}
                  onChange={(e) => onIncludeKey(e.target.checked)}
                  className="size-4"
                />
                {t('snippets-include-key', { defaultValue: 'Include my key' })}
              </label>
              <CopyButton value={code} label={t('snippets-copy', { defaultValue: 'Copy snippet' })} />
            </div>
          </>
        ) : (
          <p className="t-body text-site-text-muted">
            {t('snippets-incomplete', { defaultValue: 'Fill in the required parameters to see the code.' })}
          </p>
        )}
      </div>
    </section>
  );
}
