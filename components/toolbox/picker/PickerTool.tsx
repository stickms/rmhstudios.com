import { useId, useState } from 'react';
import { Shuffle, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import { drawWinners, parseEntries, splitBySize, splitTeams } from '@/lib/toolbox/picker';

type Mode = 'winners' | 'shuffle' | 'teams';
type Outcome = { kind: 'list'; items: string[] } | { kind: 'teams'; teams: string[][] };

export function PickerTool() {
  const { t } = useTranslation('toolbox');
  const entriesId = useId();
  const countId = useId();
  const splitById = useId();
  const [mode, setMode] = useState<Mode>('winners');
  const [text, setText] = useState('');
  const [dedupe, setDedupe] = useState(true);
  const [count, setCount] = useState(1);
  const [splitBy, setSplitBy] = useState<'teams' | 'size'>('teams');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const entries = parseEntries(text, { dedupe });

  const run = () => {
    if (entries.length === 0) return;
    if (mode === 'winners') setOutcome({ kind: 'list', items: drawWinners(entries, count) });
    else if (mode === 'shuffle') setOutcome({ kind: 'list', items: drawWinners(entries, entries.length) });
    else
      setOutcome({
        kind: 'teams',
        teams: splitBy === 'teams' ? splitTeams(entries, count) : splitBySize(entries, count),
      });
  };

  const asText =
    outcome?.kind === 'list'
      ? outcome.items.map((item, i) => `${i + 1}. ${item}`).join('\n')
      : outcome?.kind === 'teams'
        ? outcome.teams
            .map((team, i) => `${t('picker-team', { defaultValue: 'Team {{n}}', n: i + 1 })}: ${team.join(', ')}`)
            .join('\n')
        : '';

  return (
    <ToolFrame slug="picker">
      <Tabs
        value={mode}
        onChange={(id) => {
          setMode(id as Mode);
          setOutcome(null);
          setCount(id === 'teams' ? 2 : 1);
        }}
        aria-label={t('picker-mode', { defaultValue: 'What to do' })}
        tabs={[
          { id: 'winners', label: t('picker-tab-winners', { defaultValue: 'Draw winners' }) },
          { id: 'shuffle', label: t('picker-tab-shuffle', { defaultValue: 'Shuffle' }) },
          { id: 'teams', label: t('picker-tab-teams', { defaultValue: 'Make teams' }) },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={entriesId}>{t('picker-entries', { defaultValue: 'Entries, one per line' })}</Label>
        <Textarea id={entriesId} value={text} onChange={(e) => setText(e.target.value)} rows={8} />
        <p className="t-meta">{t('picker-count', { defaultValue: '{{count}} entries', count: entries.length })}</p>
      </div>
      <ToolSwitch
        label={t('picker-dedupe', { defaultValue: 'Count repeated entries once' })}
        checked={dedupe}
        onCheckedChange={setDedupe}
      />
      {mode !== 'shuffle' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'teams' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={splitById}>{t('picker-split-by', { defaultValue: 'Split by' })}</Label>
              <Select id={splitById} value={splitBy} onChange={(e) => setSplitBy(e.target.value as 'teams' | 'size')}>
                <option value="teams">{t('picker-split-teams', { defaultValue: 'Number of teams' })}</option>
                <option value="size">{t('picker-split-size', { defaultValue: 'People per team' })}</option>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={countId}>
              {mode === 'winners'
                ? t('picker-winners', { defaultValue: 'Winners' })
                : splitBy === 'teams'
                  ? t('picker-teams', { defaultValue: 'Teams' })
                  : t('picker-size', { defaultValue: 'People per team' })}
            </Label>
            <Input
              id={countId}
              type="number"
              inputMode="numeric"
              min={1}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </div>
        </div>
      )}
      <div>
        <Button variant="primary" onClick={run} disabled={entries.length === 0}>
          {mode === 'winners' ? (
            <Trophy aria-hidden />
          ) : mode === 'shuffle' ? (
            <Shuffle aria-hidden />
          ) : (
            <Users aria-hidden />
          )}
          {mode === 'winners'
            ? t('picker-draw', { defaultValue: 'Draw' })
            : mode === 'shuffle'
              ? t('picker-shuffle', { defaultValue: 'Shuffle' })
              : t('picker-make-teams', { defaultValue: 'Make teams' })}
        </Button>
      </div>

      {outcome && (
        <ToolSection
          title={t('picker-result', { defaultValue: 'Result' })}
          action={<CopyButton value={asText} label={t('picker-copy', { defaultValue: 'Copy result' })} />}
        >
          <div aria-live="polite">
            {outcome.kind === 'list' ? (
              <ol>
                {outcome.items.map((item, i) => (
                  <li key={`${i}-${item}`} className="flex gap-3 border-b border-site-border py-2 last:border-b-0">
                    <span className="t-meta w-8 shrink-0 text-right">{i + 1}</span>
                    <span className="t-body break-words">{item}</span>
                  </li>
                ))}
              </ol>
            ) : (
              outcome.teams.map((team, i) => (
                <div key={i} className="flex flex-col gap-1 border-b border-site-border py-2 last:border-b-0">
                  <h3 className="t-label">
                    {t('picker-team-size', {
                      defaultValue: 'Team {{n}}, {{count}} people',
                      n: i + 1,
                      count: team.length,
                    })}
                  </h3>
                  <p className="t-body break-words">{team.join(', ')}</p>
                </div>
              ))
            )}
          </div>
        </ToolSection>
      )}
    </ToolFrame>
  );
}
