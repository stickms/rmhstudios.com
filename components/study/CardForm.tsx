import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CardTypeControl } from '@/components/study/CardTypeControl';
import { ClozePreview } from '@/components/study/ClozePreview';
import { validateCard, wrapDeletion, type CardError, type CardInput, type CardKind } from '@/lib/study/card-types';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';

/**
 * The card editor: a type control (Basic, Reversible, Cloze), the fields that type needs, and for
 * a cloze card an "Add deletion" button and a live preview of every generated card. Errors are
 * shown inline, from the same `validateCard` the server runs.
 */
export function CardForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSave = false,
}: {
  initial?: CardInput;
  submitLabel: string;
  /** Resolves true when the card was saved. */
  onSubmit: (card: CardInput) => Promise<boolean>;
  onCancel?: () => void;
  /** Clear the fields after a save (the add form); the edit form closes instead. */
  resetOnSave?: boolean;
}) {
  const { t } = useTranslation('flashcard-types');
  const uid = useId();
  const [kind, setKind] = useState<CardKind>(initial?.kind ?? 'basic');
  const [front, setFront] = useState(initial?.front ?? '');
  const [back, setBack] = useState(initial?.back ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const clozeRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // After "Add deletion" rewrites the text, select the wrapped answer again.
  useLayoutEffect(() => {
    const range = pendingSelection.current;
    const el = clozeRef.current;
    if (!range || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(range[0], range[1]);
  }, [front]);

  const errorText: Record<CardError, string> = {
    'front-required': t('error-front-required', { defaultValue: 'Add the front of the card' }),
    'back-required': t('error-back-required', { defaultValue: 'Add the back of the card' }),
    'front-too-long': t('error-front-too-long', {
      defaultValue: 'The front is over {{max}} characters',
      max: CARD_SIDE_MAX,
    }),
    'back-too-long': t('error-back-too-long', {
      defaultValue: 'The back is over {{max}} characters',
      max: CARD_SIDE_MAX,
    }),
    'cloze-too-long': t('error-cloze-too-long', {
      defaultValue: 'The text is over {{max}} characters',
      max: CLOZE_TEXT_MAX,
    }),
    'cloze-no-deletions': t('error-cloze-no-deletions', {
      defaultValue: 'Add at least one deletion: select a word and press Add deletion',
    }),
    'cloze-unterminated': t('error-cloze-unterminated', { defaultValue: 'A deletion is missing its closing braces' }),
    'cloze-nested': t('error-cloze-nested', { defaultValue: 'A deletion cannot contain another deletion' }),
    'cloze-empty': t('error-cloze-empty', { defaultValue: 'A deletion has no answer in it' }),
    'cloze-bad-index': t('error-cloze-bad-index', { defaultValue: 'Deletion numbers run from 1 to 999' }),
    'cloze-too-many-indices': t('error-cloze-too-many-indices', {
      defaultValue: 'A cloze card can use at most 20 different deletion numbers',
    }),
  };

  const checked = validateCard({ kind, front, back });
  // A cloze text is checked as it is typed; the other types wait for the first save attempt.
  const showError = !checked.ok && (submitted || (kind === 'cloze' && front.trim() !== ''));
  const errorId = `${uid}-error`;
  const frontId = `${uid}-front`;
  const backId = `${uid}-back`;
  const wrapped = kind === 'cloze' ? wrapDeletion(front, selection[0], selection[1]) : null;

  async function save() {
    setSubmitted(true);
    if (!checked.ok || saving) return;
    setSaving(true);
    const ok = await onSubmit(checked.card);
    setSaving(false);
    if (ok && resetOnSave) {
      setFront('');
      setBack('');
      setSubmitted(false);
    }
  }

  function addDeletion() {
    if (!wrapped) return;
    pendingSelection.current = [wrapped.selStart, wrapped.selEnd];
    setFront(wrapped.text);
    setSelection([wrapped.selStart, wrapped.selEnd]);
  }

  const describedBy = showError ? errorId : undefined;

  return (
    <div className="flex flex-col gap-3">
      <CardTypeControl value={kind} onChange={setKind} idBase={uid} />
      <div
        role="tabpanel"
        id={`${uid}-panel-${kind}`}
        aria-labelledby={`${uid}-tab-${kind}`}
        className="flex flex-col gap-3"
      >
        {kind === 'cloze' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={frontId}>{t('cloze-text', { defaultValue: 'Text' })}</Label>
              <Textarea
                ref={clozeRef}
                id={frontId}
                dir="auto"
                rows={4}
                value={front}
                maxLength={CLOZE_TEXT_MAX}
                aria-invalid={showError || undefined}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setFront(e.target.value);
                  setSelection([e.target.selectionStart, e.target.selectionEnd]);
                }}
                onSelect={(e) => setSelection([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
              />
              <p className="t-meta">
                {t('cloze-hint', {
                  defaultValue:
                    'Select the words to hide and press Add deletion. Written out, a deletion is {{syntax}}.',
                  syntax: '{{c1::answer::hint}}',
                })}
              </p>
            </div>
            <div>
              <Button variant="default" disabled={!wrapped} onClick={addDeletion}>
                {t('add-deletion', { defaultValue: 'Add deletion' })}
              </Button>
            </div>
            <ClozePreview text={front} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={frontId}>{t('front', { defaultValue: 'Front' })}</Label>
              <Input
                id={frontId}
                dir="auto"
                value={front}
                maxLength={CARD_SIDE_MAX}
                aria-invalid={(showError && !front.trim()) || undefined}
                aria-describedby={describedBy}
                onChange={(e) => setFront(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={backId}>{t('back', { defaultValue: 'Back' })}</Label>
              <Textarea
                id={backId}
                dir="auto"
                rows={3}
                value={back}
                maxLength={CARD_SIDE_MAX}
                aria-invalid={(showError && !back.trim()) || undefined}
                aria-describedby={describedBy}
                onChange={(e) => setBack(e.target.value)}
              />
              {kind === 'reversible' && (
                <p className="t-meta">
                  {t('reversible-hint', {
                    defaultValue: 'A second card is added with the sides swapped, so you study it both ways.',
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {showError && !checked.ok && (
        <p id={errorId} role="alert" className="t-meta text-site-danger">
          {errorText[checked.error]}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="default" loading={saving} onClick={save}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        )}
      </div>
    </div>
  );
}
