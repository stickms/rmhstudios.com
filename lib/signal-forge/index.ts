/**
 * Signal Forge — game entity exports
 */

export { Card, createNamedCard, createGlitchCard, createStarterDeck, createShopCard, createRandomCard, deserializeCard, CARD_CATALOG } from './Card';
export { COMMON_CARDS, UNCOMMON_CARDS, RARE_CARDS, GLITCH_CARDS, CURSE_CARDS } from './Card';
export type { CardData, WaveformType, CardRarity, CardTemplate } from './Card';

export { Enemy, createEnemy, createEnemies, deserializeEnemy, ENEMY_CATALOG } from './Enemy';
export type { EnemyData, EnemyTemplate } from './Enemy';

export { Relic, createRelicByKey, createRandomRelic, createShopRelics, deserializeRelic, RELIC_CATALOG } from './Relic';
export type { RelicData, RelicRarity, RelicTemplate } from './Relic';

export { applyStatus, getStatusStacks, hasStatus, tickStatusEffects, removeStatus } from './StatusEffect';
export type { StatusEffect, StatusType } from './StatusEffect';

export { eventTemplates } from './Event';
export type { GameEvent, EventChoice } from './Event';

export { zoneTemplates, selectZone } from './Zone';
export type { CombatZone, ZoneEffect } from './Zone';

export { KEYWORD_GLOSSARY, getRelevantTooltips } from './Glossary';
