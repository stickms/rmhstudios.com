/** The class resources on the 5e sheet. */
import { useTranslation } from 'react-i18next';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { setUsesLeft, trackableResources, usesLeft } from '@features/rmhcharacters/engine/dnd5e/rest';
import type { Dnd5eCharacter, Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Section, StatRow, Stepper } from '../controls';

type Set5e = (fn: (c: Dnd5eCharacter) => Dnd5eCharacter) => void;

/** The class resources: a counted one shows what is left (with a stepper on the player's own sheet), the rest as figures. */
export function ClassResources({
  c,
  d,
  set,
  readOnly,
}: {
  c: Dnd5eCharacter;
  d: Dnd5eData;
  set: Set5e;
  readOnly: boolean;
}) {
  const { t } = useTranslation('character-resources');
  const tracked = trackableResources(c, d);
  // A counted resource two classes share (Channel Divinity) is one pool, so one row.
  const rows = R.resources(c, d).filter((r, i, all) => all.findIndex((x) => x.name === r.name) === i);
  return (
    <Section title={t('res.title', { defaultValue: 'Class resources' })}>
      {rows.map((r) => {
        const counted = tracked.find((x) => x.name === r.name);
        if (!counted) {
          return <StatRow key={r.name} label={r.name} value={r.value} {...(r.recharge ? { note: r.recharge } : {})} />;
        }
        const left = usesLeft(c, counted);
        return (
          <div
            key={r.name}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-app-border py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-sm text-app-text-muted">
              {r.name}
              <span className="block text-xs">{counted.recharge}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-live="polite" className="font-mono text-sm tabular-nums text-app-text">
                {t('res.left', { defaultValue: '{{left}} of {{max}} left', left, max: counted.max })}
              </span>
              {readOnly ? null : (
                <Stepper
                  label={t('res.stepper', { defaultValue: 'Uses of {{name}} left', name: r.name })}
                  value={left}
                  max={counted.max}
                  onChange={(n) => set((x) => setUsesLeft(x, counted, n))}
                />
              )}
            </span>
          </div>
        );
      })}
    </Section>
  );
}
