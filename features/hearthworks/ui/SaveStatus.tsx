import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Cloud } from 'lucide-react';
import { SaveConflictDialog } from '@/components/shared/SaveConflictDialog';
import type { SaveOrigin, SaveSummary } from '@/lib/game-saves/conflict';
import type { AccountStatus, TownCopy } from '@features/hearthworks/engine/save';

/** Where the town is saved, and the one action the menu offers about it. */
export interface MenuAccount {
  status: AccountStatus;
  /** Both copies are known; until then Start waits. */
  loaded: boolean;
  /** "Save this town to your account" was pressed and the upload is running. */
  saving: boolean;
  onSave: () => void;
}

/** Two towns that differ: the dialog shows both and `onChoose` applies the player's pick. */
export interface MenuConflict {
  local: TownCopy;
  cloud: TownCopy;
  onChoose: (origin: SaveOrigin) => void;
}

/** One line under the menu buttons: where the town is saved right now. */
export function SaveStatusLine({ status }: { status: AccountStatus }) {
  const { t } = useTranslation('hearthworks-saves');
  let text: string;
  switch (status) {
    case 'guest':
      text = t('where-guest', {
        defaultValue: 'Saved on this device. Sign in to keep this town on your account.',
      });
      break;
    case 'checking':
      text = t('where-checking', {
        defaultValue: 'Checking your account…',
      });
      break;
    case 'device':
      text = t('where-device', {
        defaultValue: 'Saved on this device',
      });
      break;
    case 'syncing':
      text = t('where-syncing', {
        defaultValue: 'Saving to your account…',
      });
      break;
    case 'account':
      text = t('where-account', {
        defaultValue: 'Saved to your account',
      });
      break;
    case 'too-large':
      text = t('where-too-large', {
        defaultValue: 'This town is too large to save to your account',
      });
      break;
    case 'unsupported':
      text = t('where-unsupported', {
        defaultValue: 'This browser cannot save to your account, so the town stays on this device.',
      });
      break;
    case 'offline':
      text = t('where-offline', {
        defaultValue: 'Your account could not be reached. The town is saved on this device.',
      });
      break;
    case 'stale':
      text = t('where-stale', {
        defaultValue: 'Your account holds a newer copy of this town.',
      });
      break;
    case 'unreadable':
      text = t('where-unreadable', {
        defaultValue: 'The copy on your account could not be read, so it was left as it is.',
      });
      break;
  }
  return (
    <p className="hwm-save" role="status">
      {text}
    </p>
  );
}

/** The menu entry that turns the account copy on for a town that so far lives on this device only. */
export function SaveToAccountItem({
  saving,
  onSave,
  handlers,
}: {
  saving: boolean;
  onSave: () => void;
  handlers: HTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useTranslation('hearthworks-saves');
  return (
    <button type="button" className="hwm-item" onClick={onSave} disabled={saving} {...handlers}>
      <span className="hwm-item__badge" aria-hidden="true">
        <Cloud size={20} />
      </span>
      <span className="hwm-item__text">
        <span className="hwm-item__label">
          {t('save-to-account', {
            defaultValue: 'Save this town to your account',
          })}
        </span>
        <span className="hwm-item__hint">
          {t('save-to-account-hint', {
            defaultValue: 'Carry on from any device',
          })}
        </span>
      </span>
      <ChevronRight className="hwm-item__go" size={18} aria-hidden="true" />
    </button>
  );
}

/** The dialog's figures for one copy. */
function useSummaryOf() {
  const { t } = useTranslation('hearthworks-saves');
  const number = new Intl.NumberFormat();
  return (copy: TownCopy): SaveSummary => ({
    savedAt: copy.summary.savedAt,
    headline: t('summary-residents', {
      residents: number.format(copy.summary.population),
      defaultValue: '{{residents}} residents',
    }),
    lines: [
      {
        label: t('summary-buildings', {
          defaultValue: 'Buildings',
        }),
        value: number.format(copy.summary.buildings),
      },
      {
        label: t('summary-coins', {
          defaultValue: 'Coins',
        }),
        value: number.format(copy.summary.coins),
      },
    ],
  });
}

/**
 * Two towns that each moved on: the shared choice, which cannot be dismissed. It sits in a wrapper that keeps its keys
 * from the menu's own arrow-key handling (React events bubble out of a portal to the menu).
 */
export function SaveChoice({ conflict }: { conflict: MenuConflict }) {
  const summaryOf = useSummaryOf();
  return (
    // The wrapper only stops key events; it is not interactive and draws nothing.
    <div
      role="presentation"
      style={{ display: 'contents' }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <SaveConflictDialog
        gameName="Hearthworks"
        local={summaryOf(conflict.local)}
        cloud={summaryOf(conflict.cloud)}
        onChoose={conflict.onChoose}
      />
    </div>
  );
}
