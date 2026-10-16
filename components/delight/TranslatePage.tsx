'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Languages, ThumbsUp } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config';
import { fetchJson } from '@/lib/http';

interface Item {
  key: string;
  en: string;
  current: string | null;
  kind: 'missing' | 'weak';
  suggestions: { id: string; text: string; votes: number; mine: boolean; voted: boolean }[];
}
interface Data {
  namespaces: { ns: string; missing: number; weak: number }[];
  page: { total: number; offset: number; items: Item[] } | null;
}

const TARGETS = LOCALES.filter((l) => l !== 'en');
const PAGE = 30;

/** Y4 — /translate: pick a locale and namespace, suggest wording for gaps, vote on others'. */
export function TranslatePage() {
  const { t } = useTranslation('f-delight');
  const { data: session } = useSession();
  const [locale, setLocale] = useState<string>(TARGETS[0]);
  const [ns, setNs] = useState('');
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ['delight', 'translate', locale, ns, offset],
    queryFn: () =>
      fetchJson<Data>(
        `/api/translate?locale=${locale}${ns ? `&ns=${encodeURIComponent(ns)}&offset=${offset}` : ''}`,
      ),
    enabled: !!session,
  });

  const post = async (url: string, body: unknown, ok?: string) => {
    try {
      await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (ok) toast.success(ok);
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('tr-error', { defaultValue: 'Something went wrong' }),
      );
    }
  };

  const total = q.data?.page?.total ?? 0;
  return (
    <PageLayout
      title={t('tr-title', { defaultValue: 'Community translations' })}
      description={t('tr-desc', {
        defaultValue:
          'Missing or untranslated strings for your language. Suggest wording and vote; admins review accepted ones.',
      })}
    >
      <div className="space-y-4 px-4 pt-2 pb-12">
        {!session ? (
          <SignedOutPrompt
            icon={Languages}
            title={t('tr-signed-out', { defaultValue: 'Sign in to help translate' })}
            callbackURL="/translate"
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-site-text-muted">
                <span className="mb-1 block">{t('tr-locale', { defaultValue: 'Language' })}</span>
                <Select
                  value={locale}
                  onChange={(e) => {
                    setLocale(e.target.value);
                    setNs('');
                    setOffset(0);
                  }}
                >
                  {TARGETS.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_LABELS[l]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm text-site-text-muted">
                <span className="mb-1 block">{t('tr-ns', { defaultValue: 'Section' })}</span>
                <Select
                  value={ns}
                  onChange={(e) => {
                    setNs(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t('tr-pick-ns', { defaultValue: 'Choose a section' })}</option>
                  {q.data?.namespaces.map((n) => (
                    <option key={n.ns} value={n.ns}>
                      {t('tr-ns-count', {
                        defaultValue: '{{ns}} ({{missing}} missing, {{weak}} untranslated)',
                        ns: n.ns,
                        missing: n.missing,
                        weak: n.weak,
                      })}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {q.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : !ns ? (
              <EmptyState
                icon={Languages}
                title={t('tr-choose', { defaultValue: 'Choose a section to start' })}
              />
            ) : !q.data?.page?.items.length ? (
              <EmptyState
                icon={Languages}
                title={t('tr-done', { defaultValue: 'Nothing left here. Thank you!' })}
              />
            ) : (
              <>
                <ul className="space-y-3">
                  {q.data.page.items.map((it) => (
                    <StringRow
                      key={`${locale}/${ns}/${it.key}/${offset}`}
                      item={it}
                      onSuggest={(text) =>
                        post(
                          '/api/translate/suggest',
                          { locale, ns, key: it.key, text },
                          t('tr-sent', { defaultValue: 'Suggestion saved' }),
                        )
                      }
                      onVote={(id) => post('/api/translate/vote', { suggestionId: id })}
                    />
                  ))}
                </ul>
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  >
                    {t('tr-prev', { defaultValue: 'Previous' })}
                  </Button>
                  <span className="text-sm text-site-text-muted">
                    {t('tr-range', {
                      defaultValue: '{{from}}-{{to}} of {{total}}',
                      from: offset + 1,
                      to: Math.min(offset + PAGE, total),
                      total,
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={offset + PAGE >= total}
                    onClick={() => setOffset(offset + PAGE)}
                  >
                    {t('tr-next', { defaultValue: 'Next' })}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

function StringRow({
  item,
  onSuggest,
  onVote,
}: {
  item: Item;
  onSuggest: (text: string) => Promise<void>;
  onVote: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation('f-delight');
  const mine = item.suggestions.find((s) => s.mine);
  const [text, setText] = useState(mine?.text ?? '');
  return (
    <li className="glass-fill space-y-2 rounded-site p-3">
      <p className="text-xs text-site-text-dim">{item.key}</p>
      <p className="text-site-text">{item.en}</p>
      {item.current && (
        <p className="text-sm text-site-text-muted">
          {t('tr-current', { defaultValue: 'Currently: {{text}}', text: item.current })}
        </p>
      )}
      {item.suggestions
        .filter((s) => !s.mine)
        .map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 text-site-text">{s.text}</span>
            <Button
              size="sm"
              variant={s.voted ? 'accent' : 'ghost'}
              onClick={() => void onVote(s.id)}
            >
              <ThumbsUp className="size-4" aria-hidden />
              {s.votes}
            </Button>
          </div>
        ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSuggest(text);
        }}
      >
        <Input
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('tr-input', { defaultValue: 'Your translation' })}
          placeholder={t('tr-input', { defaultValue: 'Your translation' })}
        />
        <Button
          type="submit"
          variant="accent"
          disabled={!text.trim() || text.trim() === mine?.text}
        >
          {mine
            ? t('tr-update', { defaultValue: 'Update' })
            : t('tr-suggest', { defaultValue: 'Suggest' })}
        </Button>
      </form>
    </li>
  );
}
