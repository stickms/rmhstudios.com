/**
 * Signal Forge — game entity exports
 */

export { Card, createNamedCard, createGlitchCard, createStarterDeck, createShopCard, createRandomCard, deserializeCard } from './Card';
export { COMMON_CARDS, UNCOMMON_CARDS, RARE_CARDS, GLITCH_CARDS } from './Card';
export type { CardData, WaveformType, CardRarity } from './Card';

export { Enemy, createEnemy, createEnemies, deserializeEnemy, ENEMY_CATALOG } from './Enemy';
export type { EnemyData, EnemyTemplate } from './Enemy';

export { Relic, createRelicByKey, createRandomRelic, createShopRelics, deserializeRelic, RELIC_CATALOG } from './Relic';
export type { RelicData, RelicRarity, RelicTemplate } from './Relic';
