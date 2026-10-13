import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface Brief {
  id: string;
  name: string | null;
  handle: string | null;
}
interface ViewAs {
  member: Brief & {
    createdAt: string;
    isAdmin: boolean;
    bannedUntil: string | null;
    banReason: string | null;
  };
  entitlements: { tier: string };
  mutes: Brief[];
  blocks: Brief[];
  blockedBy: Brief[];
  mutedWords: string[];
  feed: { id: string; type: string; createdAt: string; author: string | null; text: string }[];
}

const label = (u: Brief) => u.handle || u.name || u.id;

/** S5: read-only render of what a member sees. Every lookup is audit-logged server-side. */
export function ViewAsAdmin() {
  const { t } = useTranslation('f-safety');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ViewAs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    const r = await fetch(`/api/admin/view-as?user=${encodeURIComponent(query.trim())}`, {
      credentials: 'include',
    });
    setLoading(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      return setError(d.error || t('viewas-failed', { defaultValue: 'Lookup failed' }));
    }
    setData((await r.json()) as ViewAs);
  };

  const list = (title: string, users: Brief[]) => (
    <section className="glass-fill rounded-site p-3">
      <h3 className="mb-1 text-sm font-semibold text-site-text">
        {title} ({users.length})
      </h3>
      {users.length === 0 ? (
        <p className="text-xs text-site-text-muted">{t('viewas-none', { defaultValue: 'None' })}</p>
      ) : (
        <p className="break-words text-xs text-site-text-muted">{users.map(label).join(', ')}</p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-site-text-muted">
        {t('viewas-intro', {
          defaultValue:
            'See a member’s mutes, blocks, plan and the top of their For You feed. Read-only, and every lookup is recorded in the audit log.',
        })}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void run();
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('viewas-placeholder', { defaultValue: 'Handle or user id' })}
          aria-label={t('viewas-placeholder', { defaultValue: 'Handle or user id' })}
        />
        <Button type="submit" variant="accent" disabled={!query.trim() || loading}>
          {t('viewas-go', { defaultValue: 'View' })}
        </Button>
      </form>
      {loading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {error && <p className="text-sm text-site-danger">{error}</p>}
      {data && (
        <div className="flex flex-col gap-3">
          <section className="glass-pane rounded-site p-4">
            <h3 className="font-bold text-site-text">{label(data.member)}</h3>
            <p className="text-xs text-site-text-muted">
              {t('viewas-meta', {
                defaultValue: 'Plan: {{tier}} · joined {{date}}',
                tier: data.entitlements.tier,
                date: new Date(data.member.createdAt).toLocaleDateString(),
              })}
              {data.member.bannedUntil &&
                ` · ${t('viewas-banned', { defaultValue: 'suspended until {{date}}', date: new Date(data.member.bannedUntil).toLocaleDateString() })}`}
            </p>
          </section>
          {list(t('viewas-mutes', { defaultValue: 'Muted accounts' }), data.mutes)}
          {list(t('viewas-blocks', { defaultValue: 'Blocked accounts' }), data.blocks)}
          {list(t('viewas-blocked-by', { defaultValue: 'Blocked by' }), data.blockedBy)}
          <section className="glass-fill rounded-site p-3">
            <h3 className="mb-1 text-sm font-semibold text-site-text">
              {t('viewas-words', { defaultValue: 'Muted words' })} ({data.mutedWords.length})
            </h3>
            <p className="break-words text-xs text-site-text-muted">
              {data.mutedWords.join(', ') || '—'}
            </p>
          </section>
          <section className="glass-fill rounded-site p-3">
            <h3 className="mb-2 text-sm font-semibold text-site-text">
              {t('viewas-feed', { defaultValue: 'Top of their For You feed' })}
            </h3>
            <ol className="flex flex-col gap-2">
              {data.feed.map((i) => (
                <li key={i.id} className="text-xs text-site-text-muted">
                  <span className="font-semibold text-site-text">{i.author ?? i.type}</span>{' '}
                  {i.text || `(${i.type})`}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
