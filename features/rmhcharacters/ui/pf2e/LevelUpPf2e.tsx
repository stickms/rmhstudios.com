/** Level up a Pathfinder 2e character: what the level grants, then apply. */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as R from '@features/rmhcharacters/engine/pf2e/rules';
import type { Pf2eCharacter, Pf2eData } from '@features/rmhcharacters/engine/types';
import { Muted } from '../controls';

export function LevelUpPf2e({
  c,
  d,
  open,
  onOpenChange,
  onApply,
  onAsk,
}: {
  c: Pf2eCharacter;
  d: Pf2eData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (c: Pf2eCharacter) => void;
  onAsk: () => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const p = R.previewLevelUp(c, d);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('lu.title', { defaultValue: 'Level up to {{n}}', n: c.level + 1 })}</DialogTitle>
          <DialogDescription>{t('lu.bodyPf', { defaultValue: 'Here is what the next level grants. Make the choices on the Build tab afterwards.' })}</DialogDescription>
        </DialogHeader>
        {p ? (
          <div className="flex flex-col gap-2 text-sm">
            <Muted>{t('lu.hpGain', { defaultValue: '+{{n}} Hit Points.', n: p.hpGain })}</Muted>
            {p.features.map((f) => (
              <p key={f.name} className="border-b border-app-border pb-1.5">
                <span className="font-medium text-app-text">{f.name}.</span> <span className="text-app-text-muted">{f.text}</span>
              </p>
            ))}
            {p.improvements.length ? <Muted>{t('lu.improve', { defaultValue: 'Proficiency increases: {{list}}', list: p.improvements.map((i) => `${i.stat} → ${R.RANK_NAMES[i.rank]}`).join(', ') })}</Muted> : null}
            {p.slots.length ? <Muted>{t('lu.feats', { defaultValue: 'New feats: {{list}}', list: p.slots.map((s) => s.label).join(', ') })}</Muted> : null}
            {p.skillIncrease ? <Muted>{t('lu.skill', { defaultValue: 'A skill increase.' })}</Muted> : null}
            {p.attributeBoosts ? <Muted>{t('lu.boosts', { defaultValue: 'Four attribute boosts.' })}</Muted> : null}
            {p.newSpellRank ? <Muted>{t('lu.rank', { defaultValue: 'A new spell rank and its slots.' })}</Muted> : null}
          </div>
        ) : (
          <Muted>{t('lu.max', { defaultValue: 'This character is level 20.' })}</Muted>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              onAsk();
            }}
          >
            {t('lu.ask', { defaultValue: 'Ask the advisor' })}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!p}
            onClick={() => {
              if (!p) return;
              onApply({ ...c, level: p.newLevel, hp: { ...c.hp, current: c.hp.current + p.hpGain } });
              onOpenChange(false);
            }}
          >
            {t('lu.apply', { defaultValue: 'Level up' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
