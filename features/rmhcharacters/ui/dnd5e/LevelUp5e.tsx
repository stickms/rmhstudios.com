/** Level up a D&D 5e character: pick the class, see what it grants, take average or rolled HP. */
import { useState } from 'react';
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
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import type { Dnd5eCharacter, Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Field, Muted, nativeSelectClass } from '../controls';

export function LevelUp5e({
  c,
  d,
  open,
  onOpenChange,
  onApply,
  onAsk,
}: {
  c: Dnd5eCharacter;
  d: Dnd5eData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (c: Dnd5eCharacter) => void;
  onAsk: () => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const [classId, setClassId] = useState(c.classes[0]?.classId ?? '');
  const [roll, setRoll] = useState('');
  const preview = classId ? R.previewLevelUp(c, d, classId) : null;
  const options = d.classes.filter((k) => c.classes.some((x) => x.classId === k.id) || R.meetsMulticlass(c, d, k));

  function apply() {
    if (!preview) return;
    const rolled = Math.floor(Number(roll));
    const hp = roll && rolled >= 1 && rolled <= preview.hitDie ? rolled : null;
    const existing = c.classes.some((k) => k.classId === classId);
    const classes = existing
      ? c.classes.map((k) => (k.classId === classId ? { ...k, level: k.level + 1, hpRolls: [...k.hpRolls, hp] } : k))
      : [...c.classes, { classId, level: 1, hpRolls: [hp] }];
    const next = { ...c, classes };
    const gained = R.maxHp(next, d) - R.maxHp(c, d);
    onApply({ ...next, hp: { ...next.hp, current: next.hp.current + gained } });
    setRoll('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('lu.title', { defaultValue: 'Level up to {{n}}', n: R.totalLevel(c) + 1 })}</DialogTitle>
          <DialogDescription>
            {t('lu.body5e', {
              defaultValue:
                'Choose the class you gain a level in. Multiclass options need 13 in the primary abilities of every class you have.',
            })}
          </DialogDescription>
        </DialogHeader>
        <Field label={t('lu.class', { defaultValue: 'Class' })}>
          <select className={nativeSelectClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {options.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} {R.classLevel(c, k.id) + 1}
              </option>
            ))}
          </select>
        </Field>
        {preview ? (
          <div className="flex flex-col gap-2 text-sm">
            <ul className="flex flex-col">
              {preview.features.map((f) => (
                <li key={f.name} className="border-b border-app-border py-1.5 last:border-b-0">
                  <span className="font-medium text-app-text">{f.name}.</span>{' '}
                  <span className="text-app-text-muted">{f.text}</span>
                </li>
              ))}
            </ul>
            {preview.subclassChoice ? (
              <Muted>{t('lu.subclass', { defaultValue: 'Choose a subclass on the Build tab.' })}</Muted>
            ) : null}
            {preview.asi ? (
              <Muted>
                {t('lu.asi', {
                  defaultValue: 'You gain an Ability Score Improvement or a feat — choose it on the Build tab.',
                })}
              </Muted>
            ) : null}
            {preview.epicBoon ? (
              <Muted>
                {t('lu.boon', { defaultValue: 'You gain an Epic Boon feat — choose it on the Build tab.' })}
              </Muted>
            ) : null}
            {preview.proficiencyBonusUp ? (
              <Muted>{t('lu.pb', { defaultValue: 'Your Proficiency Bonus increases.' })}</Muted>
            ) : null}
            {preview.cantripsGained || preview.preparedGained ? (
              <Muted>
                {t('lu.spells', {
                  defaultValue: '+{{c}} cantrip(s), +{{p}} prepared spell(s).',
                  c: preview.cantripsGained,
                  p: preview.preparedGained,
                })}
              </Muted>
            ) : null}
            {preview.newSlots.some(Boolean) ? (
              <Muted>
                {t('lu.slots', {
                  defaultValue: 'New spell slots: {{list}}',
                  list: preview.newSlots
                    .map((n, i) => (n ? `L${i + 1} +${n}` : ''))
                    .filter(Boolean)
                    .join(', '),
                })}
              </Muted>
            ) : null}
            {preview.masteryGained ? (
              <Muted>{t('lu.mastery', { defaultValue: '+{{n}} Weapon Mastery.', n: preview.masteryGained })}</Muted>
            ) : null}
            <Field
              label={t('lu.hp', {
                defaultValue: 'Hit points: average {{avg}}, or enter your d{{die}} roll',
                avg: preview.hpAverage,
                die: preview.hitDie,
              })}
            >
              <Input
                type="number"
                min={1}
                max={preview.hitDie}
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                placeholder={t('lu.average', { defaultValue: 'Average' })}
                className="w-32"
              />
            </Field>
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
          <Button type="button" variant="primary" disabled={!preview} onClick={apply}>
            {t('lu.apply', { defaultValue: 'Level up' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
