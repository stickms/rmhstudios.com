/**
 * The advisor's recommendations: one row per option, with why it fits, a preview on hover
 * or focus (Tooltip), the full rules text on click (so touch screens get it too), and an
 * Add button that puts it on the sheet where it belongs.
 */
import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Recommendation } from '@features/rmhcharacters/engine/advisor.contract';
import { resolveRecommendation, type RecAction } from '@features/rmhcharacters/engine/recommend';
import type { Character, Dnd5eData, Pf2eData } from '@features/rmhcharacters/engine/types';

const PREVIEW_CHARS = 280;

export function Recommendations({
  c,
  data,
  recs,
  onApply,
}: {
  c: Character;
  data: Dnd5eData | Pf2eData;
  recs: Recommendation[];
  onApply: (fn: (c: Character) => Character) => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const [open, setOpen] = useState<number | null>(null);
  if (!recs.length) return null;

  const kindLabel: Record<string, string> = {
    spell: t('rec.kind.spell', { defaultValue: 'Spell' }),
    feat: t('rec.kind.feat', { defaultValue: 'Feat' }),
    item: t('rec.kind.item', { defaultValue: 'Item' }),
    weapon: t('rec.kind.weapon', { defaultValue: 'Weapon' }),
    armor: t('rec.kind.armor', { defaultValue: 'Armor' }),
    class: t('rec.kind.class', { defaultValue: 'Class' }),
    subclass: t('rec.kind.subclass', { defaultValue: 'Subclass' }),
    species: t('rec.kind.species', { defaultValue: 'Species' }),
    ancestry: t('rec.kind.ancestry', { defaultValue: 'Ancestry' }),
    heritage: t('rec.kind.heritage', { defaultValue: 'Heritage' }),
    background: t('rec.kind.background', { defaultValue: 'Background' }),
    archetype: t('rec.kind.archetype', { defaultValue: 'Archetype' }),
    other: t('rec.kind.other', { defaultValue: 'Option' }),
  };
  const actionLabel = (a: RecAction) =>
    a.label === 'add-spell'
      ? t('rec.addSpell', { defaultValue: 'Add spell' })
      : a.label === 'add-item'
        ? t('rec.addItem', { defaultValue: 'Add to inventory' })
        : a.label === 'add-feat'
          ? t('rec.addFeat', { defaultValue: 'Add feat' })
          : t('rec.addNote', { defaultValue: 'Add as note' });

  return (
    <div className="mt-3">
      <p className="mb-1 text-sm font-medium text-app-text-muted">{t('rec.title', { defaultValue: 'Recommended' })}</p>
      <ul className="flex flex-col">
        {recs.map((rec, i) => {
          const r = resolveRecommendation(rec, c, data);
          const expanded = open === i;
          const preview = r.details ? `${r.details.meta}\n\n${r.details.text.length > PREVIEW_CHARS ? `${r.details.text.slice(0, PREVIEW_CHARS)}…` : r.details.text}` : '';
          return (
            <li key={`${rec.kind}-${rec.name}`} className="border-b border-app-border py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.details ? (
                      <Tooltip className="w-72" content={<span className="block whitespace-pre-line text-left text-xs font-normal">{preview}</span>}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : i)}
                          className="inline-flex items-center gap-1 rounded-app-sm text-left text-sm font-semibold text-app-text underline decoration-dotted underline-offset-4 hover:decoration-solid"
                        >
                          {r.details.title}
                          <ChevronDown className={`size-3.5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="text-sm font-semibold text-app-text">{rec.name}</span>
                    )}
                    <span className="rounded-app-sm border border-app-border px-1.5 py-0.5 font-mono text-caption text-app-text-muted">{kindLabel[rec.kind] ?? rec.kind}</span>
                    {!r.details ? (
                      <span className="font-mono text-caption text-app-text-muted">{t('rec.notInData', { defaultValue: 'not in the built-in rules' })}</span>
                    ) : null}
                  </div>
                  {rec.why ? (
                    <p className="text-sm text-app-text">
                      <span className="font-medium text-app-text-muted">{t('rec.why', { defaultValue: 'Why:' })} </span>
                      {rec.why}
                    </p>
                  ) : null}
                </div>
                {r.action ? (
                  r.action.done ? (
                    <span className="inline-flex items-center gap-1 text-sm text-app-success">
                      <Check className="size-4" aria-hidden /> {t('rec.added', { defaultValue: 'Added' })}
                    </span>
                  ) : (
                    <Button type="button" size="sm" onClick={() => onApply(r.action!.apply)}>
                      <Plus aria-hidden /> {actionLabel(r.action)}
                    </Button>
                  )
                ) : null}
              </div>
              {expanded && r.details ? (
                <div className="mt-2 border-l-2 border-app-border pl-3">
                  <p className="font-mono text-xs text-app-text-muted">{r.details.meta}</p>
                  <p className="rmhc-prose mt-1 text-sm text-app-text-muted">{r.details.text}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
