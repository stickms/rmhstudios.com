import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
import { CardForm } from '@/components/study/CardForm';
import { ClozeText } from '@/components/study/ClozeText';
import { clozePlainText, parseCloze, type CardInput, type CardKind } from '@/lib/study/card-types';

export interface EditorCard {
  id: string;
  front: string;
  back: string;
  kind: CardKind;
}

/** One authored card in the editor: its text by type, with inline edit and delete. */
export function CardRow({
  card,
  onSave,
  onDelete,
}: {
  card: EditorCard;
  /** Resolves true when the change was saved. */
  onSave: (id: string, next: CardInput) => Promise<boolean>;
  onDelete: (card: EditorCard) => void;
}) {
  const { t } = useTranslation('study-editor');
  const { t: ts } = useTranslation('flashcard-types');
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="py-2">
        <CardForm
          initial={card}
          submitLabel={t('save-card', { defaultValue: 'Save card' })}
          onSubmit={async (next) => {
            const ok = await onSave(card.id, next);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const parsed = card.kind === 'cloze' ? parseCloze(card.front) : null;
  const label = card.kind === 'cloze' ? clozePlainText(card.front) : card.front;

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {card.kind === 'cloze' ? (
          <>
            <ClozeText text={card.front} index={null} reveal className="t-body block text-site-text" />
            {parsed?.ok && (
              <p className="t-meta">
                {ts('type-cloze-count', {
                  count: parsed.indices.length,
                  defaultValue_one: 'Cloze, {{count}} card',
                  defaultValue: 'Cloze, {{count}} cards',
                })}
              </p>
            )}
          </>
        ) : (
          <>
            <p dir="auto" className="t-body font-medium break-words text-site-text">
              {card.front}
            </p>
            <p dir="auto" className="t-body break-words whitespace-pre-wrap text-site-text-muted">
              {card.back}
            </p>
            {card.kind === 'reversible' && (
              <p className="t-meta">{ts('type-reversible-note', { defaultValue: 'Reversible, studied both ways' })}</p>
            )}
          </>
        )}
      </div>
      <IconButton
        icon={Pencil}
        variant="ghost"
        size="icon-sm"
        label={t('edit-card', { defaultValue: 'Edit card {{front}}', front: label })}
        onClick={() => setEditing(true)}
      />
      <IconButton
        icon={Trash2}
        variant="ghost"
        size="icon-sm"
        label={t('delete-card', { defaultValue: 'Delete card {{front}}', front: label })}
        onClick={() => onDelete(card)}
      />
    </div>
  );
}
