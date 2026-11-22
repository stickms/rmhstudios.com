/**
 * Admin membership grant (s10-18): one dialog with a tier, a number of months from 1 to 24, Grant and Cancel.
 * It replaces two `usePrompt` calls in the users table, where cancelling the second one granted a month. Cancel
 * and Escape close the dialog and call nothing; Grant is the dialog's one ink primary and stays disabled until the
 * fields are a valid grant. "Revoke active grants" is a third choice of the same tier field.
 */

import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  GRANT_MAX_MONTHS,
  GRANT_MIN_MONTHS,
  buildGrantBody,
  isGrantChoice,
  parseGrantMonths,
  type GrantBody,
  type GrantChoice,
} from '@/lib/admin/grant-membership';

export interface GrantMembershipLabels {
  tier: string;
  starter: string;
  pro: string;
  revoke: string;
  months: string;
  monthsHint: string;
  grant: string;
  revokeAction: string;
  cancel: string;
}

interface FormProps {
  ids: string;
  labels: GrantMembershipLabels;
  choice: GrantChoice;
  monthsText: string;
  busy: boolean;
  onChoiceChange: (choice: GrantChoice) => void;
  onMonthsChange: (text: string) => void;
  onGrant: (body: GrantBody) => void;
  onCancel: () => void;
}

/** The fields and buttons, with no hooks: the dialog below owns the state and the words. */
export function GrantMembershipForm({
  ids,
  labels,
  choice,
  monthsText,
  busy,
  onChoiceChange,
  onMonthsChange,
  onGrant,
  onCancel,
}: FormProps) {
  const revoking = choice === 'revoke';
  const body = buildGrantBody(choice, monthsText);
  const monthsInvalid = !revoking && monthsText.trim() !== '' && parseGrantMonths(monthsText) === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !body) return;
    onGrant(body);
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="space-y-1">
        <label htmlFor={`${ids}-tier`} className="t-label block">
          {labels.tier}
        </label>
        <Select
          id={`${ids}-tier`}
          value={choice}
          onChange={(event) => {
            if (isGrantChoice(event.target.value)) onChoiceChange(event.target.value);
          }}
        >
          <option value="starter">{labels.starter}</option>
          <option value="pro">{labels.pro}</option>
          <option value="revoke">{labels.revoke}</option>
        </Select>
      </div>

      {!revoking && (
        <div className="space-y-1">
          <label htmlFor={`${ids}-months`} className="t-label block">
            {labels.months}
          </label>
          <Input
            id={`${ids}-months`}
            type="number"
            inputMode="numeric"
            min={GRANT_MIN_MONTHS}
            max={GRANT_MAX_MONTHS}
            step={1}
            value={monthsText}
            onChange={(event) => onMonthsChange(event.target.value)}
            aria-invalid={monthsInvalid}
            aria-describedby={`${ids}-months-hint`}
          />
          <p id={`${ids}-months-hint`} className="t-meta">
            {labels.monthsHint}
          </p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="default" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={!body || busy}>
          {revoking ? labels.revokeAction : labels.grant}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface Props {
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told the grant the admin asked for; called only from Grant (or Revoke), never from Cancel or Escape. */
  onGrant: (body: GrantBody) => void;
  busy?: boolean;
}

/** Mount it while it is open: every opening starts from Pro for one month. */
export function GrantMembershipDialog({ userName, open, onOpenChange, onGrant, busy = false }: Props) {
  const { t } = useTranslation('race-fixes');
  const ids = useId();
  const [choice, setChoice] = useState<GrantChoice>('pro');
  const [monthsText, setMonthsText] = useState('1');

  const labels: GrantMembershipLabels = {
    tier: t('grant-tier', { defaultValue: 'Tier' }),
    starter: t('grant-tier-starter', { defaultValue: 'Starter' }),
    pro: t('grant-tier-pro', { defaultValue: 'Pro' }),
    revoke: t('grant-tier-revoke', { defaultValue: 'Revoke active grants' }),
    months: t('grant-months', { defaultValue: 'Months' }),
    monthsHint: t('grant-months-hint', {
      min: GRANT_MIN_MONTHS,
      max: GRANT_MAX_MONTHS,
      defaultValue: 'A whole number from {{min}} to {{max}}.',
    }),
    grant: t('grant-submit', { defaultValue: 'Grant' }),
    revokeAction: t('grant-revoke', { defaultValue: 'Revoke' }),
    cancel: t('grant-cancel', { defaultValue: 'Cancel' }),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('grant-title', { name: userName, defaultValue: 'Membership for {{name}}' })}</DialogTitle>
          <DialogDescription>
            {t('grant-description', {
              defaultValue: 'A gift membership starts now and ends after the months you choose.',
            })}
          </DialogDescription>
        </DialogHeader>
        <GrantMembershipForm
          ids={ids}
          labels={labels}
          choice={choice}
          monthsText={monthsText}
          busy={busy}
          onChoiceChange={setChoice}
          onMonthsChange={setMonthsText}
          onGrant={onGrant}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
