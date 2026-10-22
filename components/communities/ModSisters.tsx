'use client';

/** N8 — link up to five related communities. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { SISTERS_MAX, type SisterDTO } from '@/lib/communities/plus';

export function ModSisters({
  slug,
  sisters,
  onChange,
}: {
  slug: string;
  sisters: SisterDTO[];
  onChange: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [slugs, setSlugs] = useState<string[]>(() => {
    const cur = sisters.map((s) => s.slug);
    return [...cur, ...Array(Math.max(0, SISTERS_MAX - cur.length)).fill('')];
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/sisters'), 'PUT', {
      slugs: slugs.map((s) => s.trim().toLowerCase()).filter(Boolean),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || t('sisters-error', { defaultValue: "Couldn't save the links" }));
      return;
    }
    toast.success(t('sisters-saved', { defaultValue: 'Related communities saved' }));
    onChange();
  };

  return (
    <form
      className="glass-pane flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-xs text-site-text-muted">
        {t('sisters-intro', {
          defaultValue:
            'Enter the short name from a community address (the part after /c/). Links go one way; if the other community links back, both show a Mutual mark. Private communities cannot be linked.',
        })}
      </p>
      {slugs.map((s, i) => (
        <Input
          key={i}
          value={s}
          maxLength={64}
          onChange={(e) => setSlugs((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
          placeholder={t('sisters-ph', { defaultValue: 'community-name' })}
          aria-label={t('sisters-label', { n: i + 1, defaultValue: 'Related community {{n}}' })}
        />
      ))}
      <div className="flex justify-end">
        <Button type="submit" variant="accent" size="sm" loading={saving}>
          {t('sisters-save', { defaultValue: 'Save related communities' })}
        </Button>
      </div>
    </form>
  );
}
