import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { CARD_KINDS, isCardKind, type CardKind } from '@/lib/study/card-types';

/** Basic, Reversible or Cloze: the shared tabs primitive as a segmented control. */
export function CardTypeControl({
  value,
  onChange,
  idBase,
}: {
  value: CardKind;
  onChange: (kind: CardKind) => void;
  /** Wires each tab to the `${idBase}-panel-${kind}` tabpanel the caller renders. */
  idBase: string;
}) {
  const { t } = useTranslation('flashcard-types');
  const labels: Record<CardKind, string> = {
    basic: t('type-basic', { defaultValue: 'Basic' }),
    reversible: t('type-reversible', { defaultValue: 'Reversible' }),
    cloze: t('type-cloze', { defaultValue: 'Cloze' }),
  };
  return (
    <Tabs
      tabs={CARD_KINDS.map((kind) => ({ id: kind, label: labels[kind] }))}
      value={value}
      onChange={(id) => {
        if (isCardKind(id)) onChange(id);
      }}
      idBase={idBase}
      sheet={false}
      aria-label={t('card-type', { defaultValue: 'Card type' })}
    />
  );
}
