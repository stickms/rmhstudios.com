/**
 * The rules advisor: a short conversation about this one character. The sheet
 * it reads is built by the rules engine (`engine/summary.ts`), including what
 * the next level grants, so level-up advice starts from the real schedule.
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ADVISOR_LIMITS } from '@features/rmhcharacters/engine/advisor-limits';
import { useAdvisor, useAdvisorThread } from '@features/rmhcharacters/engine/advisor-store';
import type { Character, Dnd5eData, Pf2eData } from '@features/rmhcharacters/engine/types';
import { Recommendations } from './Recommendations';
import { Muted, Section } from './controls';

export function Advisor({
  c,
  data,
  onApply,
}: {
  c: Character;
  data: Dnd5eData | Pf2eData;
  onApply: (fn: (c: Character) => Character) => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const { turns, busy, error } = useAdvisorThread(c.id);
  const askStore = useAdvisor((st) => st.ask);
  const clear = useAdvisor((st) => st.clear);
  const [draft, setDraft] = useState('');

  const prompts =
    c.system === 'dnd5e'
      ? [
          t('advisor.q.levelUp', { defaultValue: 'What should I take when I level up?' }),
          t('advisor.q.spellPicks', { defaultValue: 'Recommend spells for my character.' }),
          t('advisor.q.items', { defaultValue: 'What magic items and gear should I look for?' }),
          t('advisor.q.feat', { defaultValue: 'Which feat or Ability Score Improvement fits my build best?' }),
          t('advisor.q.multiclass', { defaultValue: 'Is a multiclass worth it for this character?' }),
          t('advisor.q.spells', { defaultValue: 'Which spells should I prepare for a typical adventuring day?' }),
          t('advisor.q.turn', { defaultValue: 'What does a strong turn in combat look like for me?' }),
          t('advisor.q.check', { defaultValue: 'Check my sheet for rules mistakes.' }),
        ]
      : [
          t('advisor.q.levelUp', { defaultValue: 'What should I take when I level up?' }),
          t('advisor.q.spellPicks', { defaultValue: 'Recommend spells for my character.' }),
          t('advisor.q.items', { defaultValue: 'What magic items and gear should I look for?' }),
          t('advisor.q.pfFeats', { defaultValue: 'Which class and skill feats should I plan for the next few levels?' }),
          t('advisor.q.archetype', { defaultValue: 'Which archetype dedication would suit this character?' }),
          t('advisor.q.actions', { defaultValue: 'How should I spend my three actions each turn?' }),
          t('advisor.q.pfSpells', { defaultValue: 'Which spells should I prepare or learn next?' }),
          t('advisor.q.check', { defaultValue: 'Check my sheet for rules mistakes.' }),
        ];

  const ask = (question: string) => {
    if (!question.trim() || busy) return;
    setDraft('');
    void askStore(c, question);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title={t('advisor.title', { defaultValue: 'Advisor' })}>
        <Muted className="mb-3">
          {t('advisor.introAny', {
            defaultValue:
              'Ask anything: rules, builds, spells, items, tactics, backstory. The advisor reads your full sheet, including what your next level grants. Anything it recommends is listed with why; hover a name for the rules, and add it to your sheet in one click. Check its suggestions with your GM.',
          })}
        </Muted>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <Button key={p} type="button" size="sm" disabled={busy} onClick={() => ask(p)} className="h-auto min-h-9 max-w-full whitespace-normal py-1.5 text-left">
              {p}
            </Button>
          ))}
        </div>
      </Section>
      <ol className="flex flex-col gap-4" aria-live="polite">
        {turns.map((x, i) => (
          <li key={i} className={x.role === 'user' ? 'border-l-2 border-app-accent pl-3' : 'border-l-2 border-app-border pl-3'}>
            <p className="mb-1 font-mono text-xs text-app-text-muted">
              {x.role === 'user' ? t('advisor.you', { defaultValue: 'You' }) : t('advisor.name', { defaultValue: 'Advisor' })}
            </p>
            {x.role === 'user' ? (
              <p className="text-sm text-app-text">{x.content}</p>
            ) : (
              <>
                <div className="rmhc-markdown text-sm leading-relaxed text-app-text">
                  <ReactMarkdown>{x.content}</ReactMarkdown>
                </div>
                {x.recommendations?.length ? <Recommendations c={c} data={data} recs={x.recommendations} onApply={onApply} /> : null}
              </>
            )}
          </li>
        ))}
        {busy ? <li className="text-sm text-app-text-muted">{t('advisor.thinking', { defaultValue: 'Reading your sheet…' })}</li> : null}
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-app-danger">
          {error === 'limited'
            ? t('advisor.limited', { defaultValue: 'Too many questions in a row. Wait a minute and ask again.' })
            : error === 'unavailable'
              ? t('advisor.unavailable', { defaultValue: 'The advisor is unavailable right now.' })
              : t('advisor.failed', { defaultValue: 'The advisor could not answer. Try again.' })}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <Textarea
          rows={3}
          value={draft}
          maxLength={ADVISOR_LIMITS.question}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
          placeholder={t('advisor.placeholder', { defaultValue: 'Ask about your build, a rule, or your next level' })}
          aria-label={t('advisor.placeholder', { defaultValue: 'Ask about your build, a rule, or your next level' })}
        />
        <div className="flex justify-end gap-2">
          {turns.length ? (
            <Button type="button" variant="ghost" onClick={() => clear(c.id)} disabled={busy}>
              {t('advisor.clear', { defaultValue: 'Clear' })}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy || !draft.trim()}>
            <Send aria-hidden /> {t('advisor.ask', { defaultValue: 'Ask' })}
          </Button>
        </div>
      </form>
    </div>
  );
}
