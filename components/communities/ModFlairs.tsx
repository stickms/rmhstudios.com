'use client';

/** N1 — mods define flairs: a name plus a token colour preset. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlairChip } from '@/components/communities/FlairChip';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import {
  FLAIR_COLORS,
  FLAIR_MAX_PER_COMMUNITY,
  type FlairColor,
  type FlairDTO,
} from '@/lib/communities/plus-schema';

export function ModFlairs({
  slug,
  flairs,
  onChange,
}: {
  slug: string;
  flairs: FlairDTO[];
  onChange: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [name, setName] = useState('');
  const [color, setColor] = useState<FlairColor>('accent');
  const [saving, setSaving] = useState(false);

  const colorLabel = (c: FlairColor) =>
    ({
      accent: t('flair-color-accent', { defaultValue: 'Accent' }),
      success: t('flair-color-success', { defaultValue: 'Green' }),
      warning: t('flair-color-warning', { defaultValue: 'Amber' }),
      danger: t('flair-color-danger', { defaultValue: 'Red' }),
      neutral: t('flair-color-neutral', { defaultValue: 'Neutral' }),
    })[c];

  const add = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/flairs'), 'POST', { name, color });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || t('flair-save-error', { defaultValue: "Couldn't save the flair" }));
      return;
    }
    setName('');
    onChange();
  };

  const remove = async (f: FlairDTO) => {
    const res = await plusFetch(communityApi(slug, `/flairs/${f.id}`), 'DELETE');
    if (!res.ok) {
      toast.error(
        res.error || t('flair-delete-error', { defaultValue: "Couldn't delete the flair" }),
      );
      return;
    }
    onChange();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-site-text-muted">
        {t('flair-intro', {
          defaultValue:
            'Flairs label posts (Guide, Bug, Art). Members pick one when posting and can filter the feed by flair.',
        })}
      </p>
      <ul className="flex flex-col gap-2">
        {flairs.map((f) => (
          <li key={f.id} className="glass-fill flex items-center justify-between gap-3 px-3 py-2">
            <FlairChip flair={f} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('flair-delete', {
                name: f.name,
                defaultValue: 'Delete flair {{name}}',
              })}
              onClick={() => void remove(f)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="glass-pane flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('flair-name-ph', { defaultValue: 'Flair name' })}
          aria-label={t('flair-name-ph', { defaultValue: 'Flair name' })}
          required
        />
        <div
          role="radiogroup"
          aria-label={t('flair-color', { defaultValue: 'Flair colour' })}
          className="flex flex-wrap gap-2"
        >
          {FLAIR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={colorLabel(c)}
              onClick={() => setColor(c)}
              className={`rounded-full focus-visible:ring-2 focus-visible:ring-site-accent ${color === c ? 'ring-2 ring-site-accent' : ''}`}
            >
              <FlairChip flair={{ name: name.trim() || colorLabel(c), color: c }} />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-site-text-muted">
            {t('flair-count', {
              count: flairs.length,
              max: FLAIR_MAX_PER_COMMUNITY,
              defaultValue: '{{count}} of {{max}} flairs',
            })}
          </span>
          <Button type="submit" variant="accent" size="sm" loading={saving} disabled={!name.trim()}>
            {t('flair-add', { defaultValue: 'Add flair' })}
          </Button>
        </div>
      </form>
    </div>
  );
}
