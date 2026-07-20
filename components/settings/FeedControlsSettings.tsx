'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { normalizeTag, type FeedSignalKind, type FeedSignalsView } from '@/lib/feed/signals';

async function mutate(method: 'POST' | 'DELETE', kind: FeedSignalKind, targetId: string) {
  await fetch('/api/feed/signal', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, targetId }),
  });
}

/**
 * FeedControlsSettings (§17) — the transparency surface: every feed signal is
 * inspectable and reversible here. Muted/followed hashtags and demoted authors.
 */
export function FeedControlsSettings() {
  const { t } = useTranslation('settings-content');
  const [signals, setSignals] = useState<FeedSignalsView | null>(null);

  useEffect(() => {
    fetch('/api/feed/signal')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FeedSignalsView | null) => data && setSignals(data))
      .catch(() => {});
  }, []);

  if (!signals) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  async function addTag(kind: 'mute_tag' | 'follow_tag', raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setSignals((s) =>
      s
        ? {
            ...s,
            mutedTags: kind === 'mute_tag' && !s.mutedTags.includes(tag) ? [...s.mutedTags, tag] : s.mutedTags,
            followedTags: kind === 'follow_tag' && !s.followedTags.includes(tag) ? [...s.followedTags, tag] : s.followedTags,
          }
        : s,
    );
    await mutate('POST', kind, tag).catch(() => toast.error(t('error', { defaultValue: 'Something went wrong' })));
  }

  async function removeSignal(kind: FeedSignalKind, targetId: string) {
    setSignals((s) => {
      if (!s) return s;
      return {
        lessAuthors: kind === 'less_author' ? s.lessAuthors.filter((x) => x !== targetId) : s.lessAuthors,
        mutedTags: kind === 'mute_tag' ? s.mutedTags.filter((x) => x !== targetId) : s.mutedTags,
        followedTags: kind === 'follow_tag' ? s.followedTags.filter((x) => x !== targetId) : s.followedTags,
      };
    });
    await mutate('DELETE', kind, targetId).catch(() => {});
  }

  return (
    <div className="space-y-8">
      <TagSection
        title={t('muted-tags', { defaultValue: 'Muted hashtags' })}
        description={t('muted-tags-desc', { defaultValue: 'Posts with these tags are hidden from your feed.' })}
        tags={signals.mutedTags}
        onAdd={(v) => addTag('mute_tag', v)}
        onRemove={(v) => removeSignal('mute_tag', v)}
      />
      <TagSection
        title={t('followed-tags', { defaultValue: 'Followed hashtags' })}
        description={t('followed-tags-desc', { defaultValue: 'Topics you want to see more of.' })}
        tags={signals.followedTags}
        onAdd={(v) => addTag('follow_tag', v)}
        onRemove={(v) => removeSignal('follow_tag', v)}
      />
      <section>
        <h3 className="text-sm font-semibold text-site-text">
          {t('demoted', { defaultValue: 'Demoted accounts' })}
        </h3>
        <p className="mb-3 text-sm text-site-text-muted">
          {t('demoted-desc', { defaultValue: 'Accounts you asked to see less of.' })}
        </p>
        {signals.lessAuthors.length === 0 ? (
          <p className="text-sm text-site-text-dim">{t('none', { defaultValue: 'None' })}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {signals.lessAuthors.map((id) => (
              <Chip key={id} label={`${id.slice(0, 8)}…`} onRemove={() => removeSignal('less_author', id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TagSection({
  title,
  description,
  tags,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  tags: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const { t } = useTranslation('settings-content');
  const [draft, setDraft] = useState('');
  return (
    <section>
      <h3 className="text-sm font-semibold text-site-text">{title}</h3>
      <p className="mb-3 text-sm text-site-text-muted">{description}</p>
      <div className="mb-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onAdd(draft);
              setDraft('');
            }
          }}
          placeholder={t('add-tag', { defaultValue: 'Add a hashtag' })}
          aria-label={t('add-tag', { defaultValue: 'Add a hashtag' })}
        />
        <Button
          variant="outline"
          onClick={() => {
            onAdd(draft);
            setDraft('');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-site-text-dim">{t('none', { defaultValue: 'None' })}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Chip key={tag} label={`#${tag}`} onRemove={() => onRemove(tag)} />
          ))}
        </div>
      )}
    </section>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="glass-fill inline-flex items-center gap-1 rounded-full py-1 ps-3 pe-1 text-sm text-site-text">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-site-surface-hover"
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
