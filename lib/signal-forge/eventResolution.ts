/**
 * eventResolution.ts — Event system resolution for Signal Forge
 *
 * Handles the resolution of narrative events that appear between combats.
 * Each event offers choices with different effects (heal, currency, cards, etc.)
 */

import type { GameState } from './GameTypes';
import { Card, createGlitchCard, CARD_CATALOG } from './Card';

/**
 * Resolve an event choice and return the updated game state.
 */
export function computeResolveEventChoice(prev: GameState, choiceIndex: number): GameState {
  if (!prev.currentEvent) return prev;
  const event = prev.currentEvent;
  const choice = event.choices[choiceIndex];

  let playerHp = prev.playerHp;
  let playerMaxHp = prev.playerMaxHp;
  let currency = prev.currency;
  let playerStatic = prev.playerStatic;
  let deckList = [...prev.deckList];
  const log = [...prev.combatLog];

  switch (choice.effect) {
    case 'heal': {
      if (event.id === 'scrap_merchant') {
        if (currency < 30) { log.push('Not enough currency!'); break; }
        currency -= 30;
      }
      const healAmt = choice.value <= 100
        ? Math.floor(playerMaxHp * choice.value / 100)
        : choice.value;
      playerHp = Math.min(playerMaxHp, playerHp + healAmt);
      log.push(`Healed ${healAmt} HP.`);
      break;
    }
    case 'currency':
      if (event.id === 'the_wager' && choiceIndex === 0) {
        if (currency < 40) { log.push('Not enough currency to wager!'); break; }
        currency -= 40;
        if (Math.random() < 0.5) {
          currency += 100;
          log.push('Won the wager! +100💰');
        } else {
          log.push('Lost the wager! -40💰');
        }
      } else {
        currency += choice.value;
        if (choice.value > 0) log.push(`Gained ${choice.value}💰`);
      }
      break;

    case 'removeCard': {
      if (event.id === 'data_broker') {
        if (currency < 50) { log.push('Not enough currency!'); break; }
        currency -= 50;
      }
      const removable = deckList.filter(c => c.rarity !== 'common' || deckList.length > 5);
      if (removable.length > 0) {
        const toRemove = removable[Math.floor(Math.random() * removable.length)];
        deckList = deckList.filter(c => c.id !== toRemove.id);
        log.push(`Removed ${toRemove.name} from deck.`);
      }
      // data_broker also upgrades a random card
      if (event.id === 'data_broker') {
        const upgradable = deckList.filter(c => !c.upgraded);
        if (upgradable.length > 0) {
          const target = upgradable[Math.floor(Math.random() * upgradable.length)];
          const idx = deckList.findIndex(c => c.id === target.id);
          if (idx >= 0) {
            const up = deckList[idx].clone(Date.now() + Math.floor(Math.random() * 100000));
            up.upgraded = true;
            up.damage = Math.ceil(up.damage * 1.25);
            up.shield = Math.ceil(up.shield * 1.25);
            up.name = up.name + '+';
            deckList = [...deckList];
            deckList[idx] = up;
            log.push(`Upgraded ${target.name}!`);
          }
        }
      }
      break;
    }
    case 'addCard': {
      const rarePool = CARD_CATALOG.filter(t => t.rarity === 'rare' && !t.isGlitch);
      if (rarePool.length > 0) {
        const template = rarePool[Math.floor(Math.random() * rarePool.length)];
        const newId = Date.now() + Math.floor(Math.random() * 100000);
        deckList = [...deckList, Card.fromTemplate(template, newId)];
        log.push(`Added ${template.name} to deck.`);
      }
      if (event.id === 'data_broker') {
        playerStatic += 3;
        log.push('+3 Static from stolen data.');
      } else {
        const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + 99);
        deckList = [...deckList, glitch];
        log.push('Added a Glitch card to deck.');
      }
      break;
    }
    case 'upgradeCard': {
      const upgradable = deckList.filter(c => !c.upgraded);
      if (upgradable.length > 0) {
        const target = upgradable[Math.floor(Math.random() * upgradable.length)];
        const idx = deckList.findIndex(c => c.id === target.id);
        if (idx >= 0) {
          const upgraded = deckList[idx].clone(Date.now() + Math.floor(Math.random() * 100000));
          upgraded.upgraded = true;
          upgraded.damage = Math.ceil(upgraded.damage * 1.25);
          upgraded.shield = Math.ceil(upgraded.shield * 1.25);
          upgraded.name = upgraded.name + '+';
          deckList = [...deckList];
          deckList[idx] = upgraded;
          log.push(`Upgraded ${target.name}!`);
        }
      }
      if (event.id === 'corrupted_forge') {
        const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + 99);
        deckList = [...deckList, glitch];
        log.push('Corruption added a Glitch card to deck.');
      }
      break;
    }
    case 'maxHp':
      playerMaxHp += choice.value;
      playerHp += choice.value;
      log.push(`+${choice.value} max HP!`);
      break;
    case 'loseHp':
      playerHp = Math.max(1, playerHp - choice.value);
      currency += 60;
      log.push(`Lost ${choice.value} HP, gained 60💰.`);
      break;
    case 'reduceStatic':
      playerStatic = 0;
      log.push('Static reduced to 0.');
      break;
    case 'gainStatic':
      playerStatic += choice.value;
      currency += 35;
      log.push(`+${choice.value} Static, +35💰.`);
      break;
  }

  return {
    ...prev,
    playerHp, playerMaxHp, currency, playerStatic, deckList,
    currentEvent: undefined,
    phase: 'reward',
    combatLog: log,
  };
}
