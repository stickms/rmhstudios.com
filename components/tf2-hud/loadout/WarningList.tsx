/** The reasons a loadout could not be done in the game, as a short list (builder and saved view). */
'use client';

import { useTranslation } from 'react-i18next';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import type { LoadoutWarning } from '@/lib/tf2-loadout/rules';

export default function WarningList({
  warnings,
  idx,
}: {
  warnings: readonly LoadoutWarning[];
  idx: CatalogIndex;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const name = (id: number) => idx.item(id)?.n ?? `#${id}`;
  const line = (w: LoadoutWarning): string => {
    switch (w.kind) {
      case 'cosmetic-limit':
        return t('warn-limit', {
          defaultValue: '{{count}} cosmetics equipped; the game allows {{limit}}.',
          count: w.count,
          limit: w.limit,
        });
      case 'overlap':
        return t('warn-overlap', {
          defaultValue: '{{a}} and {{b}} cover the same part of the body.',
          a: name(w.a),
          b: name(w.b),
        });
      case 'duplicate':
        return t('warn-duplicate', {
          defaultValue: '{{item}} is equipped more than once.',
          item: name(w.item),
        });
      case 'class':
        return t('warn-class', {
          defaultValue: '{{item}} cannot be used by this class.',
          item: name(w.item),
        });
    }
  };
  return (
    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-(--app-text-muted)">
      {warnings.map((w, i) => (
        <li key={i}>{line(w)}</li>
      ))}
    </ul>
  );
}
