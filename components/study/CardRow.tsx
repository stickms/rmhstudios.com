import { useId, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CARD_SIDE_MAX } from '@/lib/study/limits';

export interface EditorCard {
  id: string;
  front: string;
  back: string;
}

/** One card in the editor: its two sides, with inline edit and delete. */
export function CardRow({
  card,
  onSave,
  onDelete,
}: {
  card: EditorCard;
  /** Resolves true when the change was saved. */
  onSave: (id: string, next: { front: string; back: string }) => Promise<boolean>;
  onDelete: (card: EditorCard) => void;
}) {
  const { t } = useTranslation('study-editor');
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [saving, setSaving] = useState(false);

  const valid = front.trim() !== '' && back.trim() !== '';

  function startEdit() {
    setFront(card.front);
    setBack(card.back);
    setEditing(true);
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onSave(card.id, { front: front.trim(), back: back.trim() });
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-front`}>{t('front', { defaultValue: 'Front' })}</Label>
          <Input
            id={`${uid}-front`}
            dir="auto"
            value={front}
            maxLength={CARD_SIDE_MAX}
            onChange={(e) => setFront(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-back`}>{t('back', { defaultValue: 'Back' })}</Label>
          <Textarea
            id={`${uid}-back`}
            dir="auto"
            rows={3}
            value={back}
            maxLength={CARD_SIDE_MAX}
            onChange={(e) => setBack(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="default" disabled={!valid} loading={saving} onClick={save}>
            {t('save-card', { defaultValue: 'Save card' })}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p dir="auto" className="t-body font-medium break-words text-site-text">
          {card.front}
        </p>
        <p dir="auto" className="t-body break-words whitespace-pre-wrap text-site-text-muted">
          {card.back}
        </p>
      </div>
      <IconButton
        icon={Pencil}
        variant="ghost"
        size="icon-sm"
        label={t('edit-card', { defaultValue: 'Edit card {{front}}', front: card.front })}
        onClick={startEdit}
      />
      <IconButton
        icon={Trash2}
        variant="ghost"
        size="icon-sm"
        label={t('delete-card', { defaultValue: 'Delete card {{front}}', front: card.front })}
        onClick={() => onDelete(card)}
      />
    </div>
  );
}
