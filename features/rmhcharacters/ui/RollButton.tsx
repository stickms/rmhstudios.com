/** A roll button that sits on a sheet line's value. The line itself is unchanged. */
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SheetRequest } from '@features/rmhcharacters/engine/party-rolls';
import { ABILITIES } from '@features/rmhcharacters/engine/types';
import { useRollsContext } from './useRolls';

const BUTTON =
  'rmhc-noprint inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-app-sm border border-app-border bg-app-surface px-2 font-mono text-sm tabular-nums text-app-text transition-[background-color,border-color,color] duration-100 hover:bg-app-surface-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11';

export type RollKind = 'check' | 'save' | 'skill' | 'initiative' | 'perception' | 'attack' | 'strike' | 'damage';

export interface RollButtonProps {
  kind: RollKind;
  /** The line's name as the sheet shows it ("Stealth", "Dexterity", "Longsword"). Unused by initiative and perception. */
  name?: string;
  /** The line's modifier; every kind except `damage` rolls a d20 with it. */
  bonus?: number;
  /** An attack's or strike's damage text (`1d8 +3 Slashing`): what `damage` rolls, and what a critical offers. */
  damage?: string;
  /** PF2e strike: which attack of the turn this button is. */
  step?: 1 | 2 | 3;
  /**
   * What the table roll names: the skill's id, the ability (or save) key, or the position of the attack or Strike in
   * the sheet's list. A table roll sends this, never the modifier; without it the button rolls on the device.
   */
  which?: string | number;
  /** The visible text, usually the signed modifier. */
  children: React.ReactNode;
  className?: string;
}

const SAVE_KEYS = [...ABILITIES, 'fortitude', 'reflex', 'will'] as const;

/** The table request a sheet line stands for, or `null` when the line cannot name what it rolls. */
function tableRequest(kind: RollKind, which: string | number | undefined, step: 1 | 2 | 3): SheetRequest | null {
  const key = typeof which === 'string' ? which : '';
  const index = typeof which === 'number' ? which : -1;
  switch (kind) {
    case 'initiative':
    case 'perception':
      return { kind };
    case 'skill':
      return key ? { kind, key } : null;
    case 'check': {
      const ability = ABILITIES.find((a) => a === key);
      return ability ? { kind, ability } : null;
    }
    case 'save': {
      const ability = SAVE_KEYS.find((a) => a === key);
      return ability ? { kind, ability } : null;
    }
    case 'attack':
      return index >= 0 ? { kind, index } : null;
    case 'damage':
      return index >= 0 ? { kind, index, critical: false } : null;
    case 'strike':
      return index >= 0 ? { kind, index, map: (step - 1) as 0 | 1 | 2 } : null;
  }
}

export function RollButton({
  kind,
  name = '',
  bonus = 0,
  damage = '',
  step = 1,
  which,
  children,
  className,
}: RollButtonProps) {
  const { t } = useTranslation('character-rolls');
  const rolls = useRollsContext();
  // Outside a sheet there is nothing to roll into: show the value only.
  if (!rolls) return <span className="font-mono text-sm tabular-nums text-app-text">{children}</span>;

  let what: string;
  switch (kind) {
    case 'check':
      what = t('what.check', { defaultValue: '{{name}} check', name });
      break;
    case 'save':
      what = t('what.save', { defaultValue: '{{name}} save', name });
      break;
    case 'initiative':
      what = t('what.initiative', { defaultValue: 'Initiative' });
      break;
    case 'perception':
      what = t('what.perception', { defaultValue: 'Perception' });
      break;
    case 'attack':
      what = t('what.attack', { defaultValue: '{{name}} to hit', name });
      break;
    case 'strike':
      what = t('what.strike', { defaultValue: '{{name}}, attack {{n}}', name, n: step });
      break;
    case 'damage':
      what = t('what.damage', { defaultValue: '{{name}} damage', name });
      break;
    default:
      what = name;
  }

  const request = tableRequest(kind, which, step);
  const onRoll = () => {
    if (rolls.table?.on && request) return rolls.table.send(request);
    if (kind === 'damage') rolls.damage(what, damage, false);
    else rolls.d20(what, bonus, kind === 'attack' || kind === 'strike' ? { name, damage } : undefined);
  };

  return (
    <button
      type="button"
      className={cn(BUTTON, className)}
      aria-label={t('button.roll', { defaultValue: 'Roll {{what}}', what })}
      onClick={onRoll}
    >
      <Dices className="size-3.5" aria-hidden />
      {children}
    </button>
  );
}
