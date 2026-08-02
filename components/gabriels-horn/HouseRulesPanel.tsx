'use client';

/**
 * Gabriel's Horn — change the rules by asking for it.
 *
 * The host types what is wrong with the game ("the horn is too risky", "games
 * drag", "get rid of Scry") and gets back a concrete amendment to the table's
 * tunable rules, which they can read before applying.
 *
 * Two things this component deliberately does NOT do:
 *
 *  - **It does not decide anything.** The proposal comes from
 *    `/api/gabriels-horn/house-rule`, and the socket handler clamps whatever is
 *    sent to it a second time. This is a form and a diff.
 *  - **It has no error state for the AI.** The endpoint answers with a
 *    deterministic balancer whenever the model is unavailable or unusable, so
 *    there is always a proposal; the only thing the UI does with that is label
 *    which arm produced it, because a player deserves to know whether a machine
 *    read their sentence or a keyword matcher did.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles, Wand2, X } from 'lucide-react';
import type { HouseRules, RuleChange } from '@/lib/gabriels-horn/house-rules';
import {
  DEFAULT_HOUSE_RULES,
  clampHouseRules,
  diffHouseRules,
} from '@/lib/gabriels-horn/house-rules';
import { hornNet } from '@/lib/gabriels-horn/net/client';
import { HornButton, Panel } from './ui';

interface Proposal {
  rules: HouseRules;
  changes: RuleChange[];
  reasoning: string;
  source: 'ai' | 'fallback';
}

/** A rule key as a phrase. Keeps the diff readable without a lookup table in the UI. */
function useRuleLabel(): (key: string) => string {
  const { t } = useTranslation('c-gabriels-horn');
  return (key: string) => {
    switch (key) {
      case 'penaltyDraw':
        return t('rule-penalty-draw', { defaultValue: 'Cards drawn when caught' });
      case 'playDraw':
        return t('rule-play-draw', { defaultValue: 'Cards drawn on a discard' });
      case 'startingHand':
        return t('rule-starting-hand', { defaultValue: 'Starting hand' });
      case 'diceCount':
        return t('rule-dice-count', { defaultValue: 'Dice' });
      case 'actionMs':
        return t('rule-action-ms', { defaultValue: 'Turn clock' });
      case 'claimMs':
        return t('rule-claim-ms', { defaultValue: 'Claim clock' });
      case 'callMs':
        return t('rule-call-ms', { defaultValue: 'Call clock' });
      case 'minTurnsBeforeEnd':
        return t('rule-min-turns', { defaultValue: 'Turns before the horn' });
      case 'hornMustBeStrictlyLowest':
        return t('rule-horn-strict', { defaultValue: 'Horn must be strictly lowest' });
      case 'swapEnabled':
        return t('rule-swap', { defaultValue: 'Sevens swap hands' });
      case 'azure':
        return t('effect-glimpse', { defaultValue: 'Glimpse' });
      case 'crimson':
        return t('effect-accuse', { defaultValue: 'Accuse' });
      case 'verdant':
        return t('effect-ward', { defaultValue: 'Ward' });
      case 'amber':
        return t('effect-scry', { defaultValue: 'Scry' });
      default:
        return key;
    }
  };
}

/** The rules in force, for everyone at the table. Only shows what differs. */
export function HouseRulesSummary({ rules }: { rules: HouseRules | undefined }) {
  const { t } = useTranslation('c-gabriels-horn');
  const label = useRuleLabel();
  // A hub that predates house rules sends no `rules` at all, which is the state
  // a rolling deploy passes through. Resolve to the defaults rather than
  // throwing a whole screen away over a missing field.
  const resolved = clampHouseRules(rules);
  // Diffed against the defaults so the list is "what is unusual about THIS
  // table" rather than a wall of every knob. Empty means the shipped rules.
  const changes = diffHouseRules(DEFAULT_HOUSE_RULES, resolved);
  if (changes.length === 0) return null;
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-(--app-accent) uppercase">
        <Wand2 className="size-3.5" aria-hidden="true" />
        {t('house-rules-active', { defaultValue: 'House rules' })}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {changes.map((change) => (
          <li
            key={change.key}
            className="rounded-[var(--app-radius-sm)] bg-(--app-accent-dim) px-2 py-0.5 text-xs text-(--app-text)"
          >
            {label(change.key)}: <strong>{change.to}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HouseRulesPanel({
  rules,
  state,
}: {
  rules: HouseRules | undefined;
  /** The table as it stands, so the balancer reasons about a real game. */
  state: {
    playerCount: number;
    round: number;
    turnsTaken: number;
    handCounts: number[];
    callsMade: number;
    callsCorrect: number;
  };
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const label = useRuleLabel();
  const current = clampHouseRules(rules);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const ask = async () => {
    const prompt = wish.trim();
    if (!prompt) return;
    setBusy(true);
    setProposal(null);
    try {
      const response = await fetch('/api/gabriels-horn/house-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, current, state }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setProposal((await response.json()) as Proposal);
    } catch {
      // The endpoint itself does not fail, so reaching here means the NETWORK
      // did. Say so plainly rather than pretending the balancer refused.
      setProposal({
        rules: current,
        changes: [],
        reasoning: t('house-rules-offline', {
          defaultValue: 'Could not reach the server. Try again in a moment.',
        }),
        source: 'fallback',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-2.5">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-(--app-text-muted) uppercase">
        <Wand2 className="size-3.5" aria-hidden="true" />
        {t('house-rules-title', { defaultValue: 'Change the rules' })}
      </h2>
      <p className="text-xs text-(--app-text-dim)">
        {t('house-rules-hint', {
          defaultValue:
            'Say what is wrong with the game and it will be balanced for you — “the horn is too risky”, “games drag on”, “drop Scry”.',
        })}
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <label className="sr-only" htmlFor="gh-wish">
          {t('house-rules-label', { defaultValue: 'What should change?' })}
        </label>
        <input
          id="gh-wish"
          value={wish}
          maxLength={400}
          onChange={(event) => setWish(event.target.value)}
          placeholder={t('house-rules-placeholder', { defaultValue: 'What should change?' })}
          className="gh-inset min-w-0 grow px-3 py-2 text-sm text-(--app-text) placeholder:text-(--app-text-dim) focus-visible:border-(--app-accent)"
        />
        <HornButton type="submit" variant="primary" disabled={busy || !wish.trim()}>
          <Sparkles className="size-4" aria-hidden="true" />
          {busy
            ? t('house-rules-thinking', { defaultValue: 'Thinking…' })
            : t('house-rules-ask', { defaultValue: 'Ask' })}
        </HornButton>
      </form>

      {proposal ? (
        <div className="space-y-2 border-t border-(--app-border) pt-2.5">
          <p className="text-sm text-(--app-text)">{proposal.reasoning}</p>

          {proposal.changes.length > 0 ? (
            <>
              <ul className="space-y-1 text-xs">
                {proposal.changes.map((change) => (
                  <li key={change.key} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-(--app-text-muted)">
                      {label(change.key)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      <span className="text-(--app-text-dim) line-through">{change.from}</span>
                      <span className="mx-1 text-(--app-text-dim)">→</span>
                      <span className="font-bold text-(--app-accent)">{change.to}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <HornButton
                  variant="primary"
                  className="grow"
                  onClick={() => {
                    hornNet.houseRules(proposal.rules);
                    setProposal(null);
                    setWish('');
                  }}
                >
                  <Check className="size-4" aria-hidden="true" />
                  {t('house-rules-apply', { defaultValue: 'Apply to the table' })}
                </HornButton>
                <HornButton variant="ghost" onClick={() => setProposal(null)}>
                  <X className="size-4" aria-hidden="true" />
                  {t('house-rules-discard', { defaultValue: 'Discard' })}
                </HornButton>
              </div>
            </>
          ) : null}

          <p className="text-[0.6875rem] text-(--app-text-dim)">
            {proposal.source === 'ai'
              ? t('house-rules-by-ai', { defaultValue: 'Balanced by AI.' })
              : t('house-rules-by-fallback', {
                  defaultValue: 'Balanced locally — the AI was unavailable.',
                })}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
