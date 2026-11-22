import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { GameCapabilities } from '@/lib/game-capabilities';
import { ASSIST_CAPABLE, OWN_ASSIST_IMPLEMENTATION } from '@/lib/game/assist';
import { descriptorLabels, featureLabels, inputLabels, playerLabels, requiredLabels } from './access-labels';

/**
 * "Playing this game": what a title supports, read from the capabilities registry and shown as
 * written. Three short lists (controls, players, accessibility) and the content warnings. A claim is
 * never invented or upgraded here, and a game with none says so plainly rather than "not accessible".
 */
export function PlayingThisGame({ gameId, caps }: { gameId: string; caps: GameCapabilities | undefined }) {
  const { t, i18n } = useTranslation('game-access');
  if (!caps) return null;

  const inputs = inputLabels(t);
  const required = requiredLabels(t);
  const features = featureLabels(t);
  const descriptors = descriptorLabels(t);

  const list = (items: string[]): string => {
    try {
      return new Intl.ListFormat(i18n.language, {
        type: 'disjunction',
      }).format(items);
    } catch {
      return items.join(', ');
    }
  };

  const controls: string[] = [];
  if (caps.input.supported.length > 0) {
    const names = caps.input.supported.map((m) => inputs[m]);
    controls.push(
      t('controls-with', {
        defaultValue: 'Play with {{inputs}}',
        inputs: list(names),
      }),
    );
  }
  for (const r of caps.input.required) controls.push(required[r]);

  const modes = caps.players;
  const players = playerLabels(t, caps.maxPlayers ?? 0);
  const playerLines = modes.map((m) => {
    if ((m === 'online-versus' || m === 'online-coop') && caps.maxPlayers === undefined) {
      return m === 'online-versus' ? players['online-versus-open'] : players['online-coop-open'];
    }
    return players[m];
  });

  const sharedAssists = ASSIST_CAPABLE.has(gameId);
  const ownAssists = OWN_ASSIST_IMPLEMENTATION.has(gameId);

  const accessItems = caps.accessibility.map((f) => {
    if (f === 'assist-mode' && sharedAssists) {
      return (
        <li key={f}>
          <Link to="/settings/game-assists">
            {t('assists-shared', {
              defaultValue: 'Assists: set them once in Game assists',
            })}
          </Link>
        </li>
      );
    }
    if (f === 'assist-mode' && ownAssists) {
      return (
        <li key={f}>
          {t('assists-own', {
            defaultValue: "Assists are in this game's own settings",
          })}
        </li>
      );
    }
    return <li key={f}>{features[f]}</li>;
  });

  const content = (caps.descriptors ?? []).map((d) => <li key={d}>{descriptors[d]}</li>);

  return (
    <section className="stm-card" aria-labelledby="stm-playing-h" id="playing">
      <h2 id="stm-playing-h" className="stm-card-head">
        {t('playing-heading', {
          defaultValue: 'Playing this game',
        })}
      </h2>
      <div className="stm-access">
        <h3>
          {t('controls-heading', {
            defaultValue: 'Controls',
          })}
        </h3>
        <ul>
          {controls.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <h3>
          {t('players-heading', {
            defaultValue: 'Players',
          })}
        </h3>
        <ul>
          {playerLines.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <h3>
          {t('accessibility-heading', {
            defaultValue: 'Accessibility',
          })}
        </h3>
        {accessItems.length > 0 ? (
          <ul>{accessItems}</ul>
        ) : (
          <p>
            {t('accessibility-none', {
              defaultValue: 'No accessibility features are listed for this game yet.',
            })}
          </p>
        )}
        {content.length > 0 ? (
          <>
            <h3>
              {t('content-heading', {
                defaultValue: 'Content',
              })}
            </h3>
            <ul>{content}</ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
