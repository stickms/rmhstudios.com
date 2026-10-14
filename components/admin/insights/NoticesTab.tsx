import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { games } from '@/lib/games';
import { LOCALES } from '@/lib/i18n/config';
import type { NoticeSegment } from '@/lib/ops/schema';
import { send, useInsight } from './api';

interface Notice {
  id: string;
  title: string;
  body: string;
  segment: NoticeSegment;
  segmentValue: string | null;
  archived: boolean;
  createdAt: string;
  dismissed: number;
}

export function NoticesTab() {
  const { t } = useTranslation('f-ops');
  const { data, loading, reload } = useInsight<{ notices: Notice[] }>(
    '/api/admin/insights/notices',
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [segment, setSegment] = useState<NoticeSegment>('all');
  const [segmentValue, setSegmentValue] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await send('/api/admin/insights/notices', 'POST', {
      title,
      body,
      segment,
      ...(linkUrl.trim() ? { linkUrl: linkUrl.trim() } : {}),
      ...(segment === 'game' || segment === 'locale' ? { segmentValue } : {}),
    });
    setBusy(false);
    if (!r.ok)
      return void toast.error(
        t('notices-publish-failed', { defaultValue: 'Check the fields and try again.' }),
      );
    setTitle('');
    setBody('');
    setLinkUrl('');
    toast.success(t('notices-published', { defaultValue: 'Notice published.' }));
    await reload();
  };

  const archive = async (id: string) => {
    const r = await send('/api/admin/insights/notices', 'DELETE', { id });
    if (r.ok) await reload();
  };

  const segLabel = (n: Pick<Notice, 'segment' | 'segmentValue'>) =>
    n.segment === 'all'
      ? t('notices-seg-all', { defaultValue: 'Everyone' })
      : n.segment === 'new'
        ? t('notices-seg-new', { defaultValue: 'New members (under 7 days)' })
        : n.segment === 'game'
          ? t('notices-seg-game', { defaultValue: 'Players of {{value}}', value: n.segmentValue })
          : t('notices-seg-locale', { defaultValue: 'Locale {{value}}', value: n.segmentValue });

  return (
    <section className="space-y-6">
      <form onSubmit={publish} className="glass-pane space-y-3 rounded-site p-4">
        <div className="space-y-1">
          <Label htmlFor="notice-title">{t('notices-title', { defaultValue: 'Title' })}</Label>
          <Input
            id="notice-title"
            value={title}
            maxLength={120}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notice-body">{t('notices-body', { defaultValue: 'Message' })}</Label>
          <Textarea
            id="notice-body"
            value={body}
            maxLength={500}
            required
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notice-link">
            {t('notices-link', { defaultValue: 'Link (optional)' })}
          </Label>
          <Input
            id="notice-link"
            value={linkUrl}
            maxLength={300}
            placeholder="/games"
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="notice-seg">{t('notices-segment', { defaultValue: 'Audience' })}</Label>
            <Select
              id="notice-seg"
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value as NoticeSegment);
                setSegmentValue('');
              }}
            >
              <option value="all">{t('notices-seg-all', { defaultValue: 'Everyone' })}</option>
              <option value="new">
                {t('notices-seg-new', { defaultValue: 'New members (under 7 days)' })}
              </option>
              <option value="game">
                {t('notices-seg-game-opt', { defaultValue: 'Players of a game' })}
              </option>
              <option value="locale">
                {t('notices-seg-locale-opt', { defaultValue: 'A language' })}
              </option>
            </Select>
          </div>
          {segment === 'game' && (
            <div className="space-y-1">
              <Label htmlFor="notice-game">{t('notices-game', { defaultValue: 'Game' })}</Label>
              <Select
                id="notice-game"
                value={segmentValue}
                required
                onChange={(e) => setSegmentValue(e.target.value)}
              >
                <option value="">{t('notices-pick', { defaultValue: 'Choose...' })}</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {segment === 'locale' && (
            <div className="space-y-1">
              <Label htmlFor="notice-locale">
                {t('notices-locale', { defaultValue: 'Language' })}
              </Label>
              <Select
                id="notice-locale"
                value={segmentValue}
                required
                onChange={(e) => setSegmentValue(e.target.value)}
              >
                <option value="">{t('notices-pick', { defaultValue: 'Choose...' })}</option>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
          {t('notices-publish', { defaultValue: 'Publish notice' })}
        </Button>
      </form>

      {loading ? (
        <Spinner />
      ) : (
        <ul className="space-y-3">
          {(data?.notices ?? []).map((n) => (
            <li
              key={n.id}
              className="glass-fill flex flex-wrap items-start justify-between gap-3 rounded-site p-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-site-text">{n.title}</p>
                <p className="break-words text-sm text-site-text-muted">{n.body}</p>
                <p className="text-xs text-site-text-dim">
                  {segLabel(n)} {' - '}
                  {t('notices-dismissed', {
                    defaultValue: '{{count}} dismissed',
                    count: n.dismissed,
                  })}
                  {n.archived && ` - ${t('notices-archived', { defaultValue: 'archived' })}`}
                </p>
              </div>
              {!n.archived && (
                <Button size="xs" variant="outline" onClick={() => archive(n.id)}>
                  {t('notices-archive', { defaultValue: 'Archive' })}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
