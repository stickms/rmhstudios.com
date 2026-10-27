/**
 * Look at any item in 3D before equipping it: a weapon, a cosmetic or a taunt's gear, worn by the class
 * being built. A decorated weapon shows its kit; everything else is the plain item.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { Btn, Modal } from '@/components/tf2-hud/ui';
import { modelItemId, type CatalogItem, type TfClass } from '@/lib/tf2-loadout/catalog-types';
import { tierName } from '@/lib/tf2-loadout/rarity';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { warPaintOf } from '@/lib/tf2-loadout/warpaint';
import ItemModelViewer from './ItemModelViewer';

export default function ItemPreviewModal({
  item,
  cls,
  idx,
  equipped,
  sheet,
  onEquip,
  onClose,
}: {
  item: CatalogItem;
  cls: TfClass;
  idx: CatalogIndex;
  /** Already in the slot being filled. */
  equipped: boolean;
  sheet: boolean;
  onEquip: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      sheet={sheet}
      title={item.n}
      description={[item.t, item.rt ? tierName(item) : ''].filter(Boolean).join(' · ')}
      footer={
        <>
          <Btn onClick={onClose}>{t('close', { defaultValue: 'Close' })}</Btn>
          <Btn
            variant="primary"
            disabled={equipped}
            onClick={() => {
              onEquip();
              onClose();
            }}
          >
            {equipped
              ? t('equipped', { defaultValue: 'Equipped' })
              : t('equip', { defaultValue: 'Equip' })}
          </Btn>
        </>
      }
    >
      <ItemModelViewer
        itemId={modelItemId(item)}
        cls={cls}
        paint={warPaintOf(idx, { item: item.id })}
        className="h-72"
      />
    </Modal>
  );
}
