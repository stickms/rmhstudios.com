'use client';

/**
 * The "add a session" sheet, as its own module so it can be code-split.
 *
 * It exists to draw a boundary, not to add a layer: `Sheet` brings Radix's
 * dialog and `SessionForm` brings the whole editor, and neither is needed to
 * READ the calendar — which is what almost every visit does. Pulling them behind
 * a `lazy()` boundary takes them out of the first load, and putting the draft
 * state in here rather than in the page is what makes that possible: the page
 * would otherwise have to import `emptyForm` eagerly to seed it, dragging the
 * form module back into the main chunk and undoing the split.
 *
 * The draft is seeded when the sheet opens rather than held forever, so
 * reopening it after picking a different day in the month grid starts on that
 * day instead of on the one selected the first time.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { SessionForm, emptyForm, type SessionFormValue } from './SessionForm';

interface CreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The day selected in the month grid, if any — the draft starts there. */
  selectedKey: string | null;
  timeZone: string;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}

export function CreateSheet({
  open,
  onOpenChange,
  selectedKey,
  timeZone,
  submitting,
  onSubmit,
}: CreateSheetProps) {
  const { t } = useTranslation('r-pf2ecal');
  const [value, setValue] = useState<SessionFormValue | null>(null);

  useEffect(() => {
    if (open) setValue(emptyForm(selectedKey, timeZone));
    // Deliberately NOT cleared on close: the sheet animates out over ~240ms and
    // emptying the form first would play that exit against a blank panel.
  }, [open, selectedKey, timeZone]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('add-a-session', { defaultValue: 'Add a session' })}
      subtitle={t('add-a-session-sub', {
        defaultValue: 'One-off — the standing schedule keeps running alongside it',
      })}
    >
      {value && (
        <SessionForm
          value={value}
          onChange={setValue}
          timeZone={timeZone}
          submitting={submitting}
          submitLabel={t('add-session', { defaultValue: 'Add session' })}
          onCancel={() => onOpenChange(false)}
          onSubmit={(payload) => {
            onSubmit(payload);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}
