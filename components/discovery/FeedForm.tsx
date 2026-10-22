'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MAX_FEED_KEYWORDS, MAX_FEED_PEOPLE, MAX_FEED_TAGS } from '@/lib/discovery/limits';

export interface FeedFormValue {
  name: string;
  description: string;
  tags: string;
  people: string;
  keywords: string;
  isPublic: boolean;
}

export const EMPTY_FEED_FORM: FeedFormValue = {
  name: '',
  description: '',
  tags: '',
  people: '',
  keywords: '',
  isPublic: false,
};

const split = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Turn the comma-separated form into the API body. */
export function feedBody(v: FeedFormValue) {
  return {
    name: v.name.trim(),
    description: v.description.trim() || undefined,
    tags: split(v.tags),
    people: split(v.people),
    keywords: split(v.keywords),
    isPublic: v.isPublic,
  };
}

/** A4 · The feed definition form, shared by "new feed" and "edit feed". */
export function FeedForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FeedFormValue;
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: FeedFormValue) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('f-discovery');
  const [v, setV] = useState(initial);
  const set = <K extends keyof FeedFormValue>(k: K, val: FeedFormValue[K]) =>
    setV((p) => ({ ...p, [k]: val }));
  const valid =
    v.name.trim().length >= 2 &&
    (split(v.tags).length || split(v.people).length || split(v.keywords).length);

  return (
    <form
      className="glass-pane space-y-3 rounded-site p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(v);
      }}
    >
      <Input
        value={v.name}
        maxLength={60}
        onChange={(e) => set('name', e.target.value)}
        aria-label={t('form-name', { defaultValue: 'Feed name' })}
        placeholder={t('form-name', { defaultValue: 'Feed name' })}
      />
      <Input
        value={v.description}
        maxLength={200}
        onChange={(e) => set('description', e.target.value)}
        aria-label={t('form-description', { defaultValue: 'Description (optional)' })}
        placeholder={t('form-description', { defaultValue: 'Description (optional)' })}
      />
      <Input
        value={v.tags}
        onChange={(e) => set('tags', e.target.value)}
        aria-label={t('form-tags', {
          max: MAX_FEED_TAGS,
          defaultValue: 'Tags, comma separated (up to {{max}})',
        })}
        placeholder={t('form-tags', {
          max: MAX_FEED_TAGS,
          defaultValue: 'Tags, comma separated (up to {{max}})',
        })}
      />
      <Input
        value={v.people}
        onChange={(e) => set('people', e.target.value)}
        aria-label={t('form-people', {
          max: MAX_FEED_PEOPLE,
          defaultValue: 'People as @handles, comma separated (up to {{max}})',
        })}
        placeholder={t('form-people', {
          max: MAX_FEED_PEOPLE,
          defaultValue: 'People as @handles, comma separated (up to {{max}})',
        })}
      />
      <Input
        value={v.keywords}
        onChange={(e) => set('keywords', e.target.value)}
        aria-label={t('form-keywords', {
          max: MAX_FEED_KEYWORDS,
          defaultValue: 'Keywords, comma separated (up to {{max}}, recent posts only)',
        })}
        placeholder={t('form-keywords', {
          max: MAX_FEED_KEYWORDS,
          defaultValue: 'Keywords, comma separated (up to {{max}}, recent posts only)',
        })}
      />
      <label className="flex items-center justify-between gap-3 text-sm text-site-text">
        {t('form-public', { defaultValue: 'Let others find and subscribe to this feed' })}
        <Switch checked={v.isPublic} onCheckedChange={(c) => set('isPublic', c)} />
      </label>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        )}
        <Button type="submit" variant="accent" size="sm" loading={busy} disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
