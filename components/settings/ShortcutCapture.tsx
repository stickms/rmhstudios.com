import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  MAX_SEQUENCE_STEPS,
  keyLabel,
  keystrokeFromEvent,
  type KeyPlatform,
} from '@/lib/shortcuts/bindings';

/**
 * A keycap: a picture of a key, so it takes the control's border and radius
 * (Steel R3) and the mono meta type.
 */
export function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="t-meta inline-flex min-w-6 items-center justify-center rounded-site border border-site-border px-1.5 py-0.5 text-site-text">
      {children}
    </kbd>
  );
}

/** One shortcut's keys as caps; a two-step sequence reads "G then H". */
export function KeyCaps({ keys, platform }: { keys: readonly string[]; platform: KeyPlatform }) {
  const { t } = useTranslation('keyboard');
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {keys.map((step, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1"
        >
          {i > 0 ? <span className="t-meta">{t('then', { defaultValue: 'then' })}</span> : null}
          {keyLabel(step, platform).map((cap, j) => (
            <KeyCap key={j}>{cap}</KeyCap>
          ))}
        </span>
      ))}
    </span>
  );
}

/** The spoken form of a recording, e.g. "Alt+C" or "G then H". */
function spoken(steps: readonly string[], platform: KeyPlatform, then: string): string {
  return steps.map((s) => keyLabel(s, platform).join('+')).join(` ${then} `);
}

/**
 * Records the next key, or the next two keys as a sequence, for one shortcut.
 *
 * Keys are swallowed (`preventDefault`) only while this field has focus, so the
 * rest of the page stays operable: Tab moves on to Save and Cancel, Escape
 * cancels, Enter saves what has been recorded. What was recorded, and why it
 * cannot be saved, is announced in a polite live region.
 */
export function ShortcutCapture({
  name,
  platform,
  check,
  onSave,
  onCancel,
}: {
  /** The shortcut being changed, already translated. */
  name: string;
  platform: KeyPlatform;
  /** `null` when `steps` can be saved, else the translated reason they cannot. */
  check: (steps: string[]) => string | null;
  onSave: (steps: string[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('keyboard');
  const [steps, setSteps] = useState<string[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const then = t('then', { defaultValue: 'then' });

  useEffect(() => field.current?.focus(), []);

  const problem = steps.length > 0 ? check(steps) : null;
  const canSave = steps.length > 0 && problem === null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const native = e.nativeEvent;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    // Tab leaves the field like anywhere else; it can never be recorded.
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) return;
    if (e.key === 'Enter' && canSave && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onSave(steps);
      return;
    }
    const spec = keystrokeFromEvent(native);
    if (spec === null) return;
    e.preventDefault();
    setSteps((prev) =>
      prev.length > 0 && prev.length < MAX_SEQUENCE_STEPS ? [...prev, spec] : [spec],
    );
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={field}
          readOnly
          value={spoken(steps, platform, then)}
          placeholder={t('capture-placeholder', { defaultValue: 'Press the new keys' })}
          aria-label={t('capture-label', { defaultValue: 'New keys for {{name}}', name })}
          aria-describedby={statusId}
          aria-invalid={problem !== null}
          onKeyDown={onKeyDown}
          className="t-body h-9 min-w-0 flex-1 rounded-site border border-site-border bg-site-surface px-3 text-site-text pointer-coarse:h-11"
        />
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={() => onSave(steps)}
        >
          {t('save', { defaultValue: 'Save' })}
        </Button>
        <Button onClick={onCancel}>{t('cancel', { defaultValue: 'Cancel' })}</Button>
      </div>
      <p
        id={statusId}
        role="status"
        className={problem ? 't-meta text-site-danger' : 't-meta'}
      >
        {problem ??
          (steps.length > 0
            ? t('capture-recorded', {
                defaultValue: 'Recorded {{keys}}. Press Enter to save.',
                keys: spoken(steps, platform, then),
              })
            : t('capture-help', {
                defaultValue: 'Press one key, or two for a sequence. Enter saves, Escape cancels.',
              }))}
      </p>
    </div>
  );
}
