/**
 * endTurn.ts — End-of-turn combat resolution for Signal Forge
 *
 * The core combat resolution function, broken into clear phases:
 *   1. Bleed tick on enemies
 *   2. Sequence match check & bonuses
 *   3. Card damage computation & application
 *   4. Post-damage effects (static reset, leech, thorns)
 *   5. Enemy attacks & player damage
 *   6. Shield reset & relic end-of-turn effects
 *   7. Card routing (sustain, exhaust, discard, retain, ethereal)
 *   8. Enemy end-of-turn abilities
 *   9. Glitch injection & static management
 *  10. Draw new hand & generate next sequence
 *  11. Victory/game-over check & rewards
 */

import type { GameState } from './GameTypes';
import { Card } from './Card';
import { Enemy } from './Enemy';
import { createGlitchCard, createNamedCard, CARD_CATALOG } from './Card';
import { applyStatus, tickStatusEffects } from './StatusEffect';
import { hasRelic, countRelic, getHandSize } from './gameHelpers';
import { drawHandCards } from './deckManagement';

/**
 * Compute the full end-of-turn state transition.
 * This is a pure function: prev state in, new state out.
 */
export function computeEndTurn(prev: GameState): GameState {
  if (prev.phase !== 'combat') return prev;

  const log: string[] = [];
  let playerHp = prev.playerHp;
  let playerShield = prev.playerShield;
  let safeLandingTriggered = false;

  // ── Phase 1: Process bleed on enemies ──
  const enemiesCloned = prev.enemies.map(e => e.clone());
  for (const enemy of enemiesCloned) {
    const bleed = enemy.statusEffects.find(s => s.type === 'bleed');
    if (bleed && bleed.stacks > 0) {
      const bleedDamage = hasRelic(prev.ownedRelics, 'bleed_catalyst')
        ? bleed.stacks + 2 * bleed.stacks
        : bleed.stacks;
      enemy.hp = Math.max(0, enemy.hp - bleedDamage);
      log.push(`${enemy.name} takes ${bleedDamage} bleed damage.`);
    }
  }

  // ── Phase 2: Sequence match check ──
  const isMatch = prev.currentSequence.length === prev.targetSequence.length &&
    prev.targetSequence.every((t, i) => t === '*' || t === prev.currentSequence[i]);
  const forgeBurstValue = prev.currentZone?.effect.type === 'forge_burst_bonus' ? prev.currentZone.effect.value : 12;
  const matchBonus = isMatch ? forgeBurstValue : 0;
  if (isMatch) log.push(`Forge Burst! +${forgeBurstValue} bonus damage`);

  const zoneDamageMult = prev.currentZone?.effect.type === 'damage_mult' ? prev.currentZone.effect.value : 1;
  // Volatile Zone: damage_mult 1.5 but also shield -25%
  const isVolatileZone = prev.currentZone?.id === 'volatile';
  const zoneShieldMult = prev.currentZone?.effect.type === 'shield_mult'
    ? prev.currentZone.effect.value
    : isVolatileZone ? 0.75 : 1;
  const isNoKeywordsZone = prev.currentZone?.effect.type === 'no_keywords';

  // Tempo gear
  let playerTempo = prev.playerTempo;
  const tempoGearCount = countRelic(prev.ownedRelics, 'tempo_gear');
  const tempoCap = prev.currentZone?.effect.type === 'tempo_cap' ? prev.currentZone.effect.value : 6;
  if (isMatch && tempoGearCount > 0) {
    playerTempo = Math.min(tempoCap, playerTempo + tempoGearCount);
    log.push(`Tempo Gear (x${tempoGearCount}): +${tempoGearCount} tempo from match`);
  }

  // Harmonic Resonator
  let resonatorBonus = 0;
  const resonatorCount = countRelic(prev.ownedRelics, 'harmonic_resonator');
  if (resonatorCount > 0) {
    const typeCounts: Record<string, number> = {};
    prev.playedThisTurn.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1; });
    const pairs = Object.values(typeCounts).reduce((sum, n) => sum + Math.floor(n / 2), 0);
    resonatorBonus = pairs * 4 * resonatorCount;
    if (resonatorBonus > 0) log.push(`Harmonic Resonator (x${resonatorCount}): +${resonatorBonus} dmg`);
  }

  const signalMirrorCount = countRelic(prev.ownedRelics, 'signal_mirror');
  const tempoBonusDmg = playerTempo;

  // ── Phase 3: Compute per-card damage ──
  // dual_wield relic: first card's effects applied twice
  let playedCards = prev.playedThisTurn;
  if (hasRelic(prev.ownedRelics, 'dual_wield') && prev.playedThisTurn.length > 0) {
    playedCards = [prev.playedThisTurn[0], ...prev.playedThisTurn];
    log.push(`Dual Wield: ${prev.playedThisTurn[0].name} triggers twice!`);
  }

  let totalDamage = matchBonus + resonatorBonus;
  let totalLeechDamage = 0;

  const echoCanceled = isNoKeywordsZone || enemiesCloned.some(e => e.auraEchoCanceled && e.hp > 0);
  const auraDmgReduce = enemiesCloned
    .filter(e => e.auraDamageReduction && e.auraDamageReduction > 0 && e.hp > 0)
    .reduce((sum, e) => sum + (e.auraDamageReduction ?? 0), 0);

  const cardDamages = computeCardDamages(
    prev, playedCards, enemiesCloned, echoCanceled, auraDmgReduce,
    signalMirrorCount, tempoBonusDmg, zoneDamageMult, playerShield, isNoKeywordsZone
  );

  // Apply Barrier Shift shield override
  for (const cd of cardDamages) {
    if (cd.card.name === 'Barrier Shift') {
      playerShield = 6;
    }
  }

  // ── Phase 4: Apply damage to enemies ──
  let thornsDamage = 0;
  const damageResult = applyCardDamageToEnemies(
    prev, cardDamages, enemiesCloned, totalDamage, totalLeechDamage, thornsDamage, log, isNoKeywordsZone
  );
  totalDamage = damageResult.totalDamage;
  totalLeechDamage = damageResult.totalLeechDamage;
  thornsDamage = damageResult.thornsDamage;
  playerShield += damageResult.siphonedShield;

  // Post-damage: special card effects (static reset)
  let playerStatic = prev.playerStatic;
  for (const { card } of cardDamages) {
    if (card.name === 'Entropy Bomb' || card.name === 'System Crash') {
      playerStatic = 0;
      log.push(`${card.name}: Static reset to 0!`);
    }
  }

  if (tempoBonusDmg > 0 && prev.playedThisTurn.length > 0) {
    log.push(`Tempo +${tempoBonusDmg} per card (x${prev.playedThisTurn.length} cards = +${tempoBonusDmg * prev.playedThisTurn.length})`);
  }

  // Apply match + resonator bonus to selected enemy
  if (matchBonus + resonatorBonus > 0) {
    const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
    if (target) {
      const vulnerable = target.statusEffects.find(s => s.type === 'vulnerable');
      const marked = target.statusEffects.find(s => s.type === 'marked');
      let bonusDmg = matchBonus + resonatorBonus;
      if (marked) bonusDmg += 5;
      if (vulnerable) {
        const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
        bonusDmg = Math.floor(bonusDmg * vulnMultiplier);
      }
      if (hasRelic(prev.ownedRelics, 'shattered_mirror')) bonusDmg = bonusDmg * 2;
      const absorbed = target.takeDamage(bonusDmg, prev.turn);
      totalDamage += absorbed;
      if (target.thorns > 0) thornsDamage += target.thorns;
    }
  }

  if (totalDamage > 0) log.push(`Total damage dealt: ${totalDamage}`);

  // ── Phase 4b: Splitter threshold check (≤50% HP triggers split) ──
  for (const e of enemiesCloned) {
    if (e.splitOnDeath && e.hp > 0 && e.hp <= e.maxHp / 2) {
      e.hp = 0; // Force-kill to trigger on-death split
      log.push(`${e.name} drops below 50% HP and splits!`);
    }
  }

  // ── Phase 5: On-death effects ──
  const defeated = enemiesCloned.filter(e => e.isDefeated());
  let onDeathDiscard = prev.discard;
  const splitterEnemies: Enemy[] = [];
  let defeatedBossName: string | undefined = undefined;
  let currency = prev.currency;

  for (const e of defeated) {
    if (['The Modulator', 'The Fault', 'The Debugger', 'The Overwriter'].includes(e.name)) {
      defeatedBossName = e.name;
    }
    if (e.onDeathGlitch > 0) {
      for (let i = 0; i < e.onDeathGlitch; i++) {
        onDeathDiscard = [...onDeathDiscard, createGlitchCard(Date.now() + Math.floor(Math.random() * 100000))];
      }
      log.push(`${e.name} dies and corrupts your deck!`);
    }
    if (e.onDeathStatic > 0) {
      playerStatic += e.onDeathStatic;
      log.push(`${e.name} dies and releases ${e.onDeathStatic} static!`);
    }
    if (e.splitOnDeath) {
      for (let i = 0; i < e.splitOnDeath.count; i++) {
        const childId = Date.now() + Math.floor(Math.random() * 100000);
        const child = new Enemy({
          id: childId, name: 'Half-Splitter', hp: e.splitOnDeath.hp,
          maxHp: e.splitOnDeath.hp, damage: e.splitOnDeath.damage,
          intent: 'Attack', description: 'Spawned from Splitter',
        });
        splitterEnemies.push(child);
      }
      log.push(`${e.name} splits into ${e.splitOnDeath.count} Half-Splitters!`);
    }
  }

  const defeatedCount = defeated.length;
  let enemies = enemiesCloned.filter(e => !e.isDefeated());
  enemies = [...enemies, ...splitterEnemies];
  const allDefeated = enemies.length === 0;

  // ── Phase 6: Leech healing ──
  const leechCards = prev.playedThisTurn.filter(c => c.leech && c.leech > 0);
  if (leechCards.length > 0 && totalLeechDamage > 0) {
    const maxLeech = Math.max(...leechCards.map(c => c.leech ?? 0));
    const healed = Math.floor(totalLeechDamage * (maxLeech / 100));
    if (healed > 0) {
      playerHp = Math.min(prev.playerMaxHp, playerHp + healed);
      log.push(`Leech healed ${healed} HP`);
    }
  }

  // ── Phase 7: Enemy attacks ──
  // Compiler: increment turn counter before attack calc
  for (const e of enemies) {
    if (e.compileCounter !== undefined && e.name === 'The Compiler') {
      e.compileCounter = (e.compileCounter ?? 0) + 1;
    }
  }
  const empowerBonus = enemies.reduce((sum, e) => sum + e.empowerAlly, 0);
  const darkInsightBonus = countRelic(prev.ownedRelics, 'dark_insight') * 2;
  const timeEaterBonus = enemies.some(e => e.timeEaterCharged) ? 3 : 0;
  const enemyDmgBreakdown: string[] = [];
  const totalTakeDamage = enemies.reduce((sum, e) => {
    const frozen = e.statusEffects.find(s => s.type === 'freeze');
    if (frozen) { log.push(`${e.name} is frozen!`); return sum; }
    let dmg = e.getDamage();
    let breakdown = `${e.name}: base ${dmg}`;
    const allyEmpower = empowerBonus - e.empowerAlly;
    if (allyEmpower > 0) { dmg += allyEmpower; breakdown += ` +${allyEmpower} empower`; }
    if (darkInsightBonus > 0) { dmg += darkInsightBonus; breakdown += ` +${darkInsightBonus} insight`; }
    if (e.compileCounter !== undefined && e.compileCounter > 0 && e.compileCounter % 3 === 0) { dmg = 15; breakdown = `${e.name}: COMPILE ${dmg}`; }
    if (e.timeEaterCharged) { dmg += timeEaterBonus; breakdown += ` +${timeEaterBonus} charged`; }
    if (e.glitchScaling) {
      const glitchBonus = prev.deckList.filter(c => c.isGlitch).length;
      dmg += glitchBonus; if (glitchBonus > 0) breakdown += ` +${glitchBonus} glitch`;
    }
    if (e.mimicType && prev.playedThisTurn.length > 0) {
      const lastCard = prev.playedThisTurn[prev.playedThisTurn.length - 1];
      if (lastCard.type === e.mimicType) { dmg += 2; breakdown += ' +2 mimic'; }
    }
    const weak = e.statusEffects.find(s => s.type === 'weak');
    if (weak) { dmg = Math.floor(dmg * 0.75); breakdown += ' x0.75 weak'; }
    enemyDmgBreakdown.push(`${breakdown} = ${dmg}`);
    return sum + dmg;
  }, 0) + thornsDamage;

  // Gravity Well: halve shield BEFORE it absorbs damage
  if (enemies.some(e => e.gravityWell && e.hp > 0)) {
    playerShield = Math.floor(playerShield / 2);
    log.push('Gravity Well: Shield halved!');
  }

  let finalTakeDamage = totalTakeDamage;
  if (hasRelic(prev.ownedRelics, 'shattered_mirror')) finalTakeDamage = totalTakeDamage * 2;
  if (zoneDamageMult !== 1) finalTakeDamage = Math.floor(finalTakeDamage * zoneDamageMult);

  const shieldUsed = Math.min(playerShield, finalTakeDamage);
  const damageAfterShield = finalTakeDamage - shieldUsed;
  playerHp = Math.max(0, playerHp - damageAfterShield);
  playerShield -= shieldUsed;

  // Detailed damage log
  if (enemyDmgBreakdown.length > 0) {
    log.push('--- Damage Taken ---');
    enemyDmgBreakdown.forEach(b => log.push(b));
    if (thornsDamage > 0) log.push(`Thorns: +${thornsDamage}`);
    let calcLine = `Total: ${totalTakeDamage}`;
    if (hasRelic(prev.ownedRelics, 'shattered_mirror')) calcLine += ' x2 mirror';
    if (zoneDamageMult !== 1) calcLine += ` x${zoneDamageMult} zone`;
    if (finalTakeDamage !== totalTakeDamage) calcLine += ` = ${finalTakeDamage}`;
    log.push(calcLine);
    if (shieldUsed > 0) log.push(`Shield absorbs ${shieldUsed}`);
    log.push(`You take ${damageAfterShield} damage`);
  }

  if (playerHp <= 0 && !prev.safeLandingUsed && hasRelic(prev.ownedRelics, 'safe_landing')) {
    playerHp = 1;
    safeLandingTriggered = true;
    log.push('Safe Landing: Survived fatal blow with 1 HP!');
  }

  // ── Phase 8: Vampiric, tempo siphon, shield reset ──
  for (const e of enemies) {
    if (e.vampiric > 0) {
      const vampHeal = Math.floor(e.getDamage() * e.vampiric / 100);
      if (vampHeal > 0) { e.heal(vampHeal); log.push(`${e.name} drained ${vampHeal} HP`); }
    }
    if (e.tempoSiphon > 0) {
      const stolen = Math.min(playerTempo, e.tempoSiphon);
      if (stolen > 0) { playerTempo -= stolen; log.push(`${e.name} steals ${stolen} tempo!`); }
    }
  }
  // Void Shield: if shield is still > 0 after enemy attacks, keep it
  const voidShieldActive = prev.voidShieldActive && playerShield > 0;

  if (voidShieldActive) {
    // Void Shield: shield persists — don't reset
    log.push('Void Shield: shield persists to next turn!');
  } else if (!hasRelic(prev.ownedRelics, 'sine_loom')) {
    playerShield = 0;
  }
  const shieldBatteryCount = countRelic(prev.ownedRelics, 'shield_battery');
  if (shieldBatteryCount > 0) {
    let shieldGain = 2 * shieldBatteryCount;
    if (zoneShieldMult !== 1) shieldGain = Math.floor(shieldGain * zoneShieldMult);
    playerShield += shieldGain;
    log.push(`Shield Battery (x${shieldBatteryCount}): +${shieldGain} shield`);
  }
  const isGameOver = playerHp <= 0;

  // ── Relic healing effects ──
  if (!isGameOver) {
    const hpRegenCount = countRelic(prev.ownedRelics, 'hp_regen');
    if (hpRegenCount > 0) {
      const healed = Math.min(hpRegenCount, prev.playerMaxHp - playerHp);
      if (healed > 0) { playerHp += healed; log.push(`HP Regenerator: +${healed} HP`); }
    }
    if (hasRelic(prev.ownedRelics, 'modulators_core')) {
      const mc = Math.min(1, prev.playerMaxHp - playerHp);
      if (mc > 0) { playerHp += mc; log.push(`Modulator's Core: +1 HP`); }
    }
  }
  if (isMatch && countRelic(prev.ownedRelics, 'healing_pulse') > 0) {
    const healAmt = 3 * countRelic(prev.ownedRelics, 'healing_pulse');
    playerHp = Math.min(prev.playerMaxHp, playerHp + healAmt);
    log.push(`Healing Pulse: +${healAmt} HP from Forge Burst!`);
  }
  if (countRelic(prev.ownedRelics, 'damage_echo') > 0) {
    for (const { card, dmg } of cardDamages) {
      if (!card.aoe && dmg >= 15) {
        const others = enemiesCloned.filter(e => e.id !== prev.selectedEnemyId && e.hp > 0);
        others.forEach(e => { e.takeDamage(5, prev.turn); });
        if (others.length > 0) log.push(`Damage Echo: 5 splash to ${others.length} enemies!`);
      }
    }
  }

  // Type Master (+1 energy if 3+ types)
  const typeMasterCount = countRelic(prev.ownedRelics, 'type_master');
  let typeMasterEnergyBonus = 0;
  if (typeMasterCount > 0) {
    const uniqueTypes = new Set(prev.playedThisTurn.map(c => c.type));
    if (uniqueTypes.size >= 3) {
      typeMasterEnergyBonus = typeMasterCount;
      log.push(`Type Master: +${typeMasterEnergyBonus} energy from type diversity!`);
    }
  }

  // Pattern Mastery
  let patternMasteryDraw = 0;
  if (isMatch && countRelic(prev.ownedRelics, 'pattern_mastery') > 0) {
    playerShield += 4;
    patternMasteryDraw = 1;
    log.push('Pattern Mastery: +4 shield and extra draw from sequence match!');
  }

  // ── Zone effects ──
  if (prev.currentZone?.effect.type === 'static_per_turn') {
    playerStatic += prev.currentZone.effect.value;
    log.push(`${prev.currentZone.name}: +${prev.currentZone.effect.value} Static`);
  }
  if (prev.currentZone?.effect.type === 'heal_per_turn' && !isGameOver) {
    const zoneHeal = Math.min(prev.currentZone.effect.value, prev.playerMaxHp - playerHp);
    if (zoneHeal > 0) { playerHp += zoneHeal; log.push(`${prev.currentZone.name}: +${zoneHeal} HP`); }
  }

  // ── Phase 9: Card routing ──
  let newDeckList = [...prev.deckList];
  const discardAfterPlay = [...onDeathDiscard];
  const curseCasterCards: Card[] = [];
  const sustainHand: Card[] = [];
  for (const card of prev.playedThisTurn) {
    if (card.exhaust) {
      newDeckList = newDeckList.filter(c => c.id !== card.id);
      log.push(`${card.name} exhausted`);
    } else if (card.sustain) {
      sustainHand.push(card);
    } else {
      discardAfterPlay.push(card);
    }
  }

  // ── Phase 10: Enemy end-of-turn abilities ──
  for (const e of enemies) {
    if (e.regen > 0) {
      const regenHealed = e.heal(e.regen);
      if (regenHealed > 0) log.push(`${e.name} regenerated ${regenHealed} HP`);
    }
    if (e.shieldAlly > 0) {
      enemies.forEach(ally => { if (ally.id !== e.id) ally.shield += e.shieldAlly; });
      if (enemies.length > 1) log.push(`${e.name} shields allies for ${e.shieldAlly}`);
    }
    if (e.healAlly > 0) {
      enemies.forEach(ally => {
        if (ally.id !== e.id && ally.hp > 0) {
          const healed = ally.heal(e.healAlly);
          if (healed > 0) log.push(`${e.name} heals ${ally.name} for ${healed} HP`);
        }
      });
    }
    if (e.name === 'Waveform Guardian') {
      const types = ['Pulse', 'Sine', 'Saw', 'Noise'];
      e.immuneType = types[Math.floor(Math.random() * types.length)];
    }
    e.turnCounter++;
    if (e.glitchGen > 0 && e.glitchFreq > 0 && e.turnCounter % e.glitchFreq === 0) {
      for (let g = 0; g < e.glitchGen; g++) {
        discardAfterPlay.push(createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + e.id * 10 + g));
      }
      log.push(`${e.name} injected ${e.glitchGen} Glitch card${e.glitchGen > 1 ? 's' : ''}`);
      currency += 10 * e.glitchGen * countRelic(prev.ownedRelics, 'fault_lens');
    }
    if (e.staticPulse > 0) { playerStatic += e.staticPulse; log.push(`${e.name}: +${e.staticPulse} Static`); }
  }

  // ── Glitch injection from static threshold ──
  const glitchThreshold = 4 + countRelic(prev.ownedRelics, 'stability_core') * 2
    - (hasRelic(prev.ownedRelics, 'overclocked_processor') ? 2 : 0);
  if (playerStatic >= glitchThreshold) {
    discardAfterPlay.push(createGlitchCard(Date.now() + Math.floor(Math.random() * 100000)));
    playerStatic -= glitchThreshold;
    log.push('Static overload! Glitch injected');
    const faultLensCount = countRelic(prev.ownedRelics, 'fault_lens');
    if (faultLensCount > 0) currency += 10 * faultLensCount;
  }

  const staticSinkCount = countRelic(prev.ownedRelics, 'static_sink');
  if (staticSinkCount > 0 && playerStatic > 0) playerStatic = Math.max(0, playerStatic - staticSinkCount);

  // ── Energy for next turn ──
  let playerEnergy = 3;
  playerEnergy += countRelic(prev.ownedRelics, 'energy_conduit');
  if (hasRelic(prev.ownedRelics, 'demon_core')) playerEnergy += 2;
  playerEnergy += typeMasterEnergyBonus;
  if (hasRelic(prev.ownedRelics, 'static_heart') && playerStatic >= 3) {
    const converted = Math.floor(playerStatic / 3);
    playerStatic -= converted * 3;
    playerEnergy += converted;
    log.push(`Static Heart: Converted ${converted * 3} Static → +${converted} energy`);
  }

  // Temporal Anchor vs normal tempo reset
  if (hasRelic(prev.ownedRelics, 'temporal_anchor')) {
    playerTempo = Math.max(0, playerTempo - 2);
  } else {
    playerTempo = 0;
  }

  // Momentum Core
  const momentumCoreActive = hasRelic(prev.ownedRelics, 'momentum_core') && prev.playedThisTurn.length >= 4;
  if (momentumCoreActive) log.push('Momentum Core: All cards cost 1 less next turn!');

  // Void Harvester
  let voidHarvesterDmgBonus = prev.voidHarvesterDmgBonus;
  if (hasRelic(prev.ownedRelics, 'void_harvester')) {
    const exhaustedCount = prev.playedThisTurn.filter(c => c.exhaust).length;
    if (exhaustedCount > 0) {
      voidHarvesterDmgBonus += exhaustedCount * 2;
      log.push(`Void Harvester: +${exhaustedCount * 2} permanent damage from exhausted cards`);
    }
  }

  // Enemy special abilities
  for (const e of enemies) {
    if (e.name === 'Time Eater') {
      if (prev.playedThisTurn.length >= 5) {
        e.timeEaterCharged = true;
        e.shield = (e.shield ?? 0) + 10;
        log.push('Time Eater charges up! Gained +10 shield and +3 next attack.');
      } else {
        e.timeEaterCharged = false;
      }
    }
    if (e.curseCaster && e.hp > 0) {
      const curseCard = createNamedCard('corrupted_signal', Date.now() + Math.floor(Math.random() * 100000));
      curseCasterCards.push(curseCard);
      log.push(`${e.name} casts a Corrupted Signal into your hand!`);
    }
    if (e.sequenceScramble && e.hp > 0) {
      // Sequence scramble happens after new sequence generation (Phase 12)
    }
  }

  // Enemy special abilities: overwriteCards, adaptiveImmunity, mimicType, counterAttack
  const overwrittenCardIds = new Set<number>();
  for (const e of enemies) {
    // Overwriter boss: replace 1-2 cards in hand with Glitches
    if (e.overwriteCards && e.hp > 0) {
      const replaceCount = e.hp < e.maxHp / 2 ? 2 : 1;
      const playableCards = prev.hand.filter(c => !c.isGlitch && !overwrittenCardIds.has(c.id));
      for (let i = 0; i < Math.min(replaceCount, playableCards.length); i++) {
        const victimIdx = Math.floor(Math.random() * playableCards.length);
        const victim = playableCards.splice(victimIdx, 1)[0];
        overwrittenCardIds.add(victim.id);
        const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + i);
        discardAfterPlay.push(glitch);
        log.push(`${e.name} overwrites ${victim.name} with a Glitch!`);
      }
    }
    // Debugger boss: immune to most common waveform, regen at low HP
    if (e.adaptiveImmunity && e.hp > 0) {
      const typeCounts: Record<string, number> = {};
      prev.deckList.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1; });
      const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        e.immuneType = sorted[0][0];
        log.push(`${e.name} adapts: now immune to ${e.immuneType}!`);
      }
      if (e.hp < e.maxHp * 0.5 && e.regen < 5) {
        e.regen = 5;
        log.push(`${e.name} activates emergency regen!`);
      }
    }
    // Pulse Mimic: copies last played waveform, +2 damage if matched
    if (e.mimicType !== undefined && e.hp > 0 && prev.playedThisTurn.length > 0) {
      const lastCard = prev.playedThisTurn[prev.playedThisTurn.length - 1];
      e.mimicType = lastCard.type;
      log.push(`${e.name} mimics ${lastCard.type}!`);
    }
    // Counter Attack: damage player when this enemy took damage this turn
    if (e.counterAttack && e.counterAttack > 0 && e.hp > 0 && totalDamage > 0) {
      playerHp = Math.max(0, playerHp - e.counterAttack);
      log.push(`${e.name} counter-attacks for ${e.counterAttack}!`);
    }
  }

  // Heal On Kill: surviving enemies heal when an ally dies
  if (defeated.length > 0) {
    for (const e of enemies) {
      if (e.healOnKill && e.healOnKill > 0 && e.hp > 0) {
        for (const dead of defeated) {
          const healAmt = Math.floor(dead.maxHp * e.healOnKill / 100);
          if (healAmt > 0) {
            e.heal(healAmt);
            log.push(`${e.name} drains ${healAmt} HP from ${dead.name}'s death!`);
          }
        }
      }
    }
  }

  // Infinite Loop revive
  for (const e of defeated) {
    if (e.name === 'The Infinite Loop' && (e.reviveCount ?? 0) < 2) {
      e.hp = 30;
      e.reviveCount = (e.reviveCount ?? 0) + 1;
      e.regen = 5 + (e.reviveCount ?? 0) * 2;
      enemies.push(e); // Re-add to living enemies
      log.push(`The Infinite Loop revives! (${e.reviveCount}/2) Regen now ${e.regen}`);
    } else if (e.name === 'The Infinite Loop' && (e.reviveCount ?? 0) >= 2) {
      defeatedBossName = e.name;
    }
  }

  // ── Phase 11: Draw new hand ──

  const retainedCards: Card[] = [];
  const exhaustedEthereal: Card[] = [];
  for (const card of prev.hand) {
    // Skip cards overwritten by Overwriter boss
    if (overwrittenCardIds.has(card.id)) continue;
    if (!isNoKeywordsZone && card.retain) {
      retainedCards.push(card);
    } else if (card.ethereal) {
      // Overheated Module: 8 self-damage on ethereal exhaust
      if (card.name === '⚠ Overheated Module') {
        playerHp = Math.max(0, playerHp - 8);
        log.push(`Overheated Module explodes on exhaust! -8 HP`);
      }
      exhaustedEthereal.push(card);
      newDeckList = newDeckList.filter(c => c.id !== card.id);
      log.push(`${card.name} fades away (Ethereal)`);
    } else {
      discardAfterPlay.push(card);
    }
  }

  // burn_fuel relic: +1 draw per exhausted card
  let burnFuelDraw = 0;
  if (hasRelic(prev.ownedRelics, 'burn_fuel')) {
    const exhaustedThisTurn = prev.playedThisTurn.filter(c => c.exhaust).length + exhaustedEthereal.length;
    burnFuelDraw = exhaustedThisTurn;
    if (burnFuelDraw > 0) log.push(`Burn Fuel: +${burnFuelDraw} draw from exhausted cards`);
  }

  // retention_matrix relic: +1 draw per Retain card in hand
  let retentionMatrixDraw = 0;
  if (hasRelic(prev.ownedRelics, 'retention_matrix')) {
    retentionMatrixDraw = retainedCards.length;
    if (retentionMatrixDraw > 0) log.push(`Retention Matrix: +${retentionMatrixDraw} draw from Retain cards`);
  }

  const sustainCards = isNoKeywordsZone ? [] : sustainHand;
  const handWithSustain = [...retainedCards, ...sustainCards];
  if (isNoKeywordsZone && sustainHand.length > 0) {
    for (const c of sustainHand) discardAfterPlay.push(c);
  }
  const extraDraws = burnFuelDraw + retentionMatrixDraw;
  const drawResult = drawHandCards(
    prev.deck, discardAfterPlay, handWithSustain,
    getHandSize(prev.ownedRelics) + extraDraws, prev.ownedRelics, prev.reshuffleCount, log
  );
  const { deck: newDeck, hand: newHand, discard: newDiscard, exhausted, reshuffleCount: drawReshuffleCount, fatigueDamage } = drawResult;
  let reshuffleCount = drawReshuffleCount;
  playerHp = Math.max(0, playerHp - fatigueDamage);

  if (exhausted.length > 0) {
    for (const ex of exhausted) newDeckList = newDeckList.filter(c => c.id !== ex.id);
  }

  // Echo Node (+1 draw on Forge Burst) + Pattern Mastery (+1 draw on match)
  let finalDeck = newDeck;
  let finalHand = [...newHand, ...curseCasterCards];
  let finalDiscard = newDiscard;
  const echoDrawCount = isMatch ? countRelic(prev.ownedRelics, 'echo_node') : 0;
  const bonusDraws = echoDrawCount + patternMasteryDraw;
  if (bonusDraws > 0) {
    const extra = drawHandCards(
      finalDeck, finalDiscard, finalHand,
      finalHand.length + bonusDraws,
      prev.ownedRelics, reshuffleCount, log
    );
    finalDeck = extra.deck;
    finalHand = extra.hand;
    finalDiscard = extra.discard;
    reshuffleCount = extra.reshuffleCount;
    playerHp = Math.max(0, playerHp - extra.fatigueDamage);
    if (extra.exhausted.length > 0) {
      for (const ex of extra.exhausted) newDeckList = newDeckList.filter(c => c.id !== ex.id);
    }
    if (echoDrawCount > 0) log.push(`Echo Node: drew ${echoDrawCount} extra card${echoDrawCount > 1 ? 's' : ''}`);
    if (patternMasteryDraw > 0) log.push('Pattern Mastery: +1 draw from match!');
  }

  // ── Phase 12: Generate new sequence ──
  const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const seqLength = Math.min(2 + Math.floor((prev.floor - 1) / 5), 3);
  const targetSequence: string[] = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);

  const phaseShifterCount = countRelic(prev.ownedRelics, 'phase_shifter');
  if (phaseShifterCount > 0 && targetSequence.length > 0) {
    const nonWildIndices = targetSequence.map((t, i) => t !== '*' ? i : -1).filter(i => i >= 0);
    const wildCount = Math.min(phaseShifterCount, nonWildIndices.length);
    for (let w = 0; w < wildCount; w++) {
      const pick = Math.floor(Math.random() * nonWildIndices.length);
      targetSequence[nonWildIndices[pick]] = '*';
      nonWildIndices.splice(pick, 1);
    }
    log.push(`Phase Shifter: ${wildCount} slot${wildCount > 1 ? 's' : ''} wildcarded`);
  }

  // sequenceScramble: randomize 1 slot of the new target sequence
  for (const e of enemies) {
    if (e.sequenceScramble && e.hp > 0 && targetSequence.length > 0) {
      const slotIdx = Math.floor(Math.random() * targetSequence.length);
      const current = targetSequence[slotIdx];
      const others = types.filter(t => t !== current);
      targetSequence[slotIdx] = others[Math.floor(Math.random() * others.length)];
      log.push(`${e.name} scrambles the sequence! Slot ${slotIdx + 1} changed.`);
    }
  }

  const newPhase = allDefeated ? 'card-reward' : (isGameOver ? 'game-over' : 'combat');

  // Card reward generation
  let cardRewardChoices = prev.cardRewardChoices;
  if (allDefeated) {
    const floor = prev.floor;
    const weights = floor < 4
      ? { common: 0.65, uncommon: 0.30, rare: 0.05 }
      : floor < 7
        ? { common: 0.40, uncommon: 0.45, rare: 0.15 }
        : { common: 0.20, uncommon: 0.50, rare: 0.30 };
    cardRewardChoices = [];
    for (let i = 0; i < 3; i++) {
      const roll = Math.random();
      let rarity: 'common' | 'uncommon' | 'rare';
      if (roll < weights.rare) rarity = 'rare';
      else if (roll < weights.rare + weights.uncommon) rarity = 'uncommon';
      else rarity = 'common';
      const pool = CARD_CATALOG.filter(t => t.rarity === rarity && !t.isGlitch && !t.keywords?.includes('Curse'));
      if (pool.length > 0) {
        const template = pool[Math.floor(Math.random() * pool.length)];
        const newId = Date.now() + Math.floor(Math.random() * 100000) + i;
        cardRewardChoices.push(Card.fromTemplate(template, newId));
      }
    }
  }

  const newSelectedEnemyId = enemies.some(e => e.id === prev.selectedEnemyId)
    ? prev.selectedEnemyId : (enemies[0]?.id ?? prev.selectedEnemyId);

  // Tick status effects
  enemies.forEach(e => { e.statusEffects = tickStatusEffects(e.statusEffects); });

  // Calculate enemy intents for next turn
  calculateEnemyIntents(enemies);

  // Performance bonuses on victory
  let bonusCurrency = 0;
  const finalFloorDmg = prev.floorDamageTaken + damageAfterShield;
  const finalFloorPatterns = prev.floorPatternsCompleted + (isMatch ? 1 : 0);
  const finalFloorTurns = prev.floorTurns + 1;
  if (allDefeated) {
    if (finalFloorDmg === 0) { bonusCurrency += 25; log.push('✨ No Damage bonus: +25💰'); }
    if (finalFloorPatterns > 0) {
      const patternBonus = finalFloorPatterns * 5;
      bonusCurrency += patternBonus;
      log.push(`✨ Pattern Master (×${finalFloorPatterns}): +${patternBonus}💰`);
    }
    if (finalFloorTurns <= 3) { bonusCurrency += 15; log.push('✨ Speed Clear: +15💰'); }
  }

  return {
    ...prev,
    deckList: newDeckList,
    deck: finalDeck,
    hand: finalHand,
    discard: finalDiscard,
    playedThisTurn: [],
    currentSequence: [],
    playerEnergy,
    playerTempo,
    playerStatic,
    playerShield,
    playerHp,
    turn: prev.turn + 1,
    enemies,
    phase: newPhase,
    floor: prev.floor,
    gameOver: isGameOver,
    targetSequence,
    glitchThreshold,
    score: prev.score + totalDamage * 5 + (isMatch ? 50 : 0) + defeatedCount * 25,
    currency: currency + (isMatch ? 15 : 0) + defeatedCount * (20 + prev.floor * 5) + (allDefeated ? (150 + prev.floor * 30) : 0) + bonusCurrency,
    selectedEnemyId: newSelectedEnemyId,
    firstPulsePlayedThisTurn: false,
    firstSawPlayedThisTurn: false,
    signalBoostCount: 0,
    chainDiscount: undefined,
    reshuffleCount,
    combatLog: log,
    cardRewardChoices,
    defeatedBossName: allDefeated ? defeatedBossName : undefined,
    damageTakenLastTurn: damageAfterShield,
    waveformTypesPlayedThisTurn: [],
    momentumCoreActive,
    safeLandingUsed: prev.safeLandingUsed || safeLandingTriggered,
    voidHarvesterDmgBonus,
    voidShieldActive,
    floorDamageTaken: prev.floorDamageTaken + damageAfterShield,
    floorPatternsCompleted: prev.floorPatternsCompleted + (isMatch ? 1 : 0),
    floorTurns: prev.floorTurns + 1,
  };
}

// ── Helper: Compute per-card damage values ──

interface CardDamageEntry {
  card: Card;
  dmg: number;
  skipNormalDmg?: boolean;
  /** For Recursion: the card whose effects to copy */
  effectSource?: Card;
}

function computeCardDamages(
  prev: GameState, playedCards: Card[], enemiesCloned: Enemy[],
  echoCanceled: boolean, auraDmgReduce: number,
  signalMirrorCount: number, tempoBonusDmg: number,
  zoneDamageMult: number, playerShield: number,
  isNoKeywordsZone: boolean
): CardDamageEntry[] {
  return playedCards.map((card, idx) => {
    // In Silence Zone, use base damage only (no growing, no echo)
    let dmg = isNoKeywordsZone ? card.damage : card.getEffectiveDamage();
    let skipNormalDmg = false;

    // echo_chamber relic: echo at 75% instead of 50%
    if (card.echo && !echoCanceled && hasRelic(prev.ownedRelics, 'echo_chamber')) {
      // Undo the default 1.5x echo, apply 1.75x instead
      const baseDmg = card.damage + (card.growing ? card.growthCounter * (card.growing ?? 0) : 0);
      dmg = Math.floor(baseDmg * 1.75);
    }

    dmg += countRelic(prev.ownedRelics, 'signal_amplifier');
    dmg += prev.voidHarvesterDmgBonus;

    if (echoCanceled && card.echo) {
      dmg = card.damage + (card.growing ? card.growthCounter * (card.growing ?? 0) : 0);
    }

    // Special card damage overrides
    if (card.name === 'Final Cut') { dmg = prev.playedThisTurn.length * 8; }
    else if (card.name === 'Entropy Bomb') { dmg = prev.playerStatic * 8; }
    else if (card.name === 'White Noise') { dmg = prev.playerStatic * 3; }
    else if (card.name === 'Shield Nova') { dmg = playerShield; }
    else if (card.name === 'Harmonic Convergence') {
      dmg = new Set(prev.playedThisTurn.map(c => c.type)).size * 5;
    }
    else if (card.name === 'System Crash') { dmg = prev.playerStatic * 5; }
    else if (card.name === 'Recursion') {
      const lastPlayed = prev.playedThisTurn[idx - 1];
      if (lastPlayed) {
        dmg = lastPlayed.getEffectiveDamage();
        return { card, dmg: Math.max(0, Math.floor((dmg + tempoBonusDmg - auraDmgReduce) * zoneDamageMult)), skipNormalDmg: false, effectSource: lastPlayed };
      }
    }
    else if (card.name === 'Chaos Theory') { dmg = 3 + Math.floor(Math.random() * 10); }
    else if (card.name === 'Barrier Shift') { dmg = playerShield; }
    else if (card.name === 'Blade Storm') { skipNormalDmg = true; }
    else if (card.name === 'Chain Lightning') { skipNormalDmg = true; }
    else if (card.name === 'Glitch Exploit') { skipNormalDmg = true; }

    // Signal Boost: +4 per activation for Pulse cards
    if (card.type === 'Pulse' && prev.signalBoostCount > 0) {
      dmg += 4 * prev.signalBoostCount;
    }

    if (signalMirrorCount > 0 && card.type === 'Saw' && !prev.playedThisTurn.slice(0, idx).some(c => c.type === 'Saw')) {
      dmg += 3 * signalMirrorCount;
    }
    dmg += tempoBonusDmg;
    dmg = Math.max(0, dmg - auraDmgReduce);
    if (zoneDamageMult !== 1) dmg = Math.floor(dmg * zoneDamageMult);

    return { card, dmg, skipNormalDmg };
  });
}

// ── Helper: Apply card damage to enemies ──

function applyCardDamageToEnemies(
  prev: GameState,
  cardDamages: CardDamageEntry[],
  enemiesCloned: Enemy[],
  totalDamage: number,
  totalLeechDamage: number,
  thornsDamage: number,
  log: string[],
  isNoKeywordsZone: boolean
): { totalDamage: number; totalLeechDamage: number; thornsDamage: number; counterAttackDamage: number; siphonedShield: number } {
  const tempoBonusDmg = prev.playerTempo;
  const counterAttackDamage = 0;
  let siphonedShield = 0;

  for (const { card, dmg, skipNormalDmg, effectSource } of cardDamages) {
    // effectCard: use effectSource (for Recursion) or the card itself
    const ec = effectSource ?? card;
    // Special cards with custom targeting
    if (skipNormalDmg) {
      const livingEnemies = enemiesCloned.filter(e => e.hp > 0);
      if (card.name === 'Blade Storm') {
        const hitCount = prev.playerTempo;
        for (let h = 0; h < hitCount; h++) {
          const randomTarget = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
          if (randomTarget) { totalDamage += randomTarget.takeDamage(4, prev.turn); }
        }
        log.push(`Blade Storm hits ${hitCount} times for 4 each!`);
      } else if (card.name === 'Chain Lightning') {
        const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
        const cascadeDmg = [12 + tempoBonusDmg, 8 + tempoBonusDmg, 4 + tempoBonusDmg];
        const targetIdx = target ? livingEnemies.indexOf(target) : 0;
        for (let i = 0; i < Math.min(3, livingEnemies.length); i++) {
          const idx = (targetIdx + i) % livingEnemies.length;
          totalDamage += livingEnemies[idx].takeDamage(cascadeDmg[i], prev.turn);
        }
        log.push(`Chain Lightning cascades for ${cascadeDmg.slice(0, livingEnemies.length).join(' → ')} damage!`);
      } else if (card.name === 'Glitch Exploit') {
        const glitchCards = [...prev.hand].filter(c => c.isGlitch);
        const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
        if (target && glitchCards.length > 0) {
          glitchCards.forEach(() => { totalDamage += target.takeDamage(8, prev.turn); });
          log.push(`Glitch Exploit! ${glitchCards.length} Glitch cards deal ${glitchCards.length * 8} damage!`);
        }
      }
      // Apply status effects from special cards
      if (!isNoKeywordsZone && (card.bleed || card.freeze || card.vulnerable || card.weak)) {
        const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
        if (target) {
          if (card.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', card.bleed, 2);
          if (card.freeze) {
            const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
            target.statusEffects = applyStatus(target.statusEffects, 'freeze', 1, freezeDuration);
          }
          if (card.vulnerable) target.statusEffects = applyStatus(target.statusEffects, 'vulnerable', 1, card.vulnerable);
          if (card.weak) target.statusEffects = applyStatus(target.statusEffects, 'weak', 1, card.weak);
        }
      }
      continue;
    }

    // Razor Cascade ricochet
    if (card.name === 'Razor Cascade' && dmg > 0) {
      const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
      if (target) {
        totalDamage += target.takeDamage(dmg, prev.turn);
        const others = enemiesCloned.filter(e => e.id !== prev.selectedEnemyId && e.hp > 0);
        if (others.length > 0) {
          const splashTarget = others[Math.floor(Math.random() * others.length)];
          const splashDmg = Math.floor(dmg * 0.5);
          totalDamage += splashTarget.takeDamage(splashDmg, prev.turn);
          log.push(`Razor Cascade: ${dmg} to ${target.name}, ${splashDmg} splash to ${splashTarget.name}`);
        }
        if (!isNoKeywordsZone && ec.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', ec.bleed, 2);
      }
      continue;
    }

    if (dmg <= 0 && !ec.bleed && !ec.freeze && !ec.vulnerable && !ec.weak && !ec.siphon) continue;
    const hits = isNoKeywordsZone ? 1 : (ec.multihit ?? 1);
    const isPiercing = !isNoKeywordsZone && (ec.piercing || hasRelic(prev.ownedRelics, 'unstoppable_force') || hasRelic(prev.ownedRelics, 'piercing_edge'));

    if (ec.aoe) {
      // AOE damage
      enemiesCloned.forEach(e => {
        if (e.immuneType && card.type === e.immuneType) { log.push(`${e.name} is immune to ${card.type}!`); return; }
        const vulnerable = e.statusEffects.find(s => s.type === 'vulnerable');
        const marked = e.statusEffects.find(s => s.type === 'marked');
        let finalDmg = dmg;
        if (marked) finalDmg += 5;
        if (vulnerable) {
          const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
          finalDmg = Math.floor(finalDmg * vulnMultiplier);
        }
        if (hasRelic(prev.ownedRelics, 'shattered_mirror')) finalDmg = finalDmg * 2;
        for (let hit = 0; hit < hits; hit++) {
          if (finalDmg > 0) {
            const absorbed = e.takeDamage(finalDmg, prev.turn, isPiercing);
            totalDamage += absorbed;
            if (!isNoKeywordsZone && ec.leech) totalLeechDamage += absorbed;
          }
        }
        if (e.thorns > 0 && finalDmg > 0) thornsDamage += e.thorns;
        if (!isNoKeywordsZone) {
          if (ec.bleed) e.statusEffects = applyStatus(e.statusEffects, 'bleed', ec.bleed, 2);
          if (ec.freeze) {
            const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
            e.statusEffects = applyStatus(e.statusEffects, 'freeze', 1, freezeDuration);
          }
          if (ec.vulnerable) e.statusEffects = applyStatus(e.statusEffects, 'vulnerable', 1, ec.vulnerable);
          if (ec.weak) e.statusEffects = applyStatus(e.statusEffects, 'weak', 1, ec.weak);
        }
      });
      log.push(`${card.name} (AOE) hits all for ${dmg}${hits > 1 ? ` ×${hits}` : ''}`);
    } else {
      // Single target
      const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
      if (target) {
        if (target.immuneType && card.type === target.immuneType) {
          log.push(`${target.name} is immune to ${card.type}!`);
        } else {
          const vulnerable = target.statusEffects.find(s => s.type === 'vulnerable');
          const marked = target.statusEffects.find(s => s.type === 'marked');
          let finalDmg = dmg;
          if (marked) finalDmg += 5;
          if (vulnerable) {
            const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
            finalDmg = Math.floor(finalDmg * vulnMultiplier);
          }
          if (hasRelic(prev.ownedRelics, 'shattered_mirror')) finalDmg = finalDmg * 2;
          for (let hit = 0; hit < hits; hit++) {
            if (finalDmg > 0) {
              const absorbed = target.takeDamage(finalDmg, prev.turn, isPiercing);
              totalDamage += absorbed;
              if (!isNoKeywordsZone && ec.leech) totalLeechDamage += absorbed;
            }
          }
          if (target.thorns > 0 && finalDmg > 0) thornsDamage += target.thorns;
          if (!isNoKeywordsZone) {
            if (ec.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', ec.bleed, 2);
            if (ec.freeze) {
              const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
              target.statusEffects = applyStatus(target.statusEffects, 'freeze', 1, freezeDuration);
            }
            if (ec.vulnerable) target.statusEffects = applyStatus(target.statusEffects, 'vulnerable', 1, ec.vulnerable);
            if (ec.weak) target.statusEffects = applyStatus(target.statusEffects, 'weak', 1, ec.weak);
            if (ec.siphon && ec.siphon > 0) {
              const stolen = Math.min(target.shield ?? 0, ec.siphon);
              if (stolen > 0) {
                target.shield = (target.shield ?? 0) - stolen;
                siphonedShield += stolen;
                log.push(`Siphoned ${stolen} shield from ${target.name}!`);
              }
            }
          }
        }
      }
    }
  }
  return { totalDamage, totalLeechDamage, thornsDamage, counterAttackDamage, siphonedShield };
}

// ── Helper: Calculate enemy intents for next turn ──

export function calculateEnemyIntents(enemies: Enemy[]): void {
  enemies.forEach(enemy => {
    if (enemy.hp <= 0) { enemy.intentDisplay = undefined; return; }
    const frozen = enemy.statusEffects?.find(s => s.type === 'freeze' && s.duration > 0);
    if (frozen) { enemy.intentDisplay = { type: 'special', label: '❄️ Frozen' }; return; }
    const empowerBonus = enemies
      .filter(e => e.id !== enemy.id && e.hp > 0)
      .reduce((sum, e) => sum + (e.empowerAlly ?? 0), 0);
    const baseDmg = enemy.damage + empowerBonus;
    enemy.intentDisplay = { type: 'attack', value: baseDmg };
    if (enemy.shieldAlly && enemy.shieldAlly > 0 && enemies.length > 1) {
      enemy.intentDisplay = { type: 'buff', value: enemy.shieldAlly, label: 'Shield Allies' };
    } else if (enemy.regen && enemy.regen > 0 && enemy.hp < enemy.maxHp) {
      enemy.intentDisplay = { type: 'heal', value: enemy.regen };
    } else if (enemy.vampiric && enemy.vampiric > 0) {
      enemy.intentDisplay = { type: 'special', value: baseDmg, label: `💉 ${baseDmg}` };
    } else if (enemy.tempoSiphon && enemy.tempoSiphon > 0) {
      enemy.intentDisplay = { type: 'debuff', value: enemy.tempoSiphon, label: 'Steal Tempo' };
    }
  });
}
