/**
 * renderCanvas.ts — Main canvas renderer for Signal Forge combat view
 *
 * A single pure render function that paints the entire combat canvas:
 *   - Background grid
 *   - HUD panels (stats, debugger's lens, combat log)
 *   - Enemies with archetype colors & status indicators
 *   - Sequence pattern (target & current)
 *   - Damage preview & tempo bar
 *   - Played cards & hand cards (with sort, mulligan, sequence highlighting)
 *   - End turn button & player circle
 *   - Hover tooltips
 *
 * All mutable output (tooltip zones, card rects, button rects) is written
 * to the provided `out` object so the caller can wire up click handlers.
 */

import type { GameState } from '@/lib/signal-forge/GameTypes';
import { hasRelic, countRelic, getHandSize } from '@/lib/signal-forge/gameHelpers';
import { getRelevantTooltips } from '@/lib/signal-forge';
import {
  drawOutlinedText, drawRoundRect, drawCard, drawPanel,
  type TooltipZone, type CardRect,
} from './canvasHelpers';

/** Mutable output written by the renderer each frame. */
export interface RenderOutput {
  tooltipZones: TooltipZone[];
  cardRects: CardRect[];
  endTurnRect: { x: number; y: number; w: number; h: number } | null;
  hamburgerRect: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Paint one frame of the Signal Forge combat canvas.
 */
export function renderCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  canvasSize: { w: number; h: number },
  mousePos: { x: number; y: number } | null,
  out: RenderOutput,
): void {
  const W = canvasSize.w;
  const H = canvasSize.h;
  const dpr = window.devicePixelRatio || 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Reset output arrays
  out.tooltipZones = [];
  out.cardRects = [];
  out.endTurnRect = null;
  out.hamburgerRect = null;

  // ── Background ──
  ctx.fillStyle = '#0a0e27';
  ctx.fillRect(0, 0, W, H);

  const gridGradient = ctx.createLinearGradient(0, 0, 0, H);
  gridGradient.addColorStop(0, 'rgba(0, 255, 200, 0.08)');
  gridGradient.addColorStop(0.5, 'rgba(0, 150, 200, 0.05)');
  gridGradient.addColorStop(1, 'rgba(0, 255, 200, 0.08)');
  ctx.fillStyle = gridGradient;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(0, 255, 200, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }

  // ── Responsive layout ──
  const middleTop = 135;
  const middleBot = H - 60;
  const mScale = Math.max(0.4, (middleBot - middleTop) / 560);

  const seqY = middleTop + Math.round(15 * mScale);
  const seqPanelH = Math.round(130 * mScale);
  const seqBoxH = Math.round(30 * mScale);
  const dmgBoxY = middleTop + Math.round(160 * mScale);
  const dmgBoxH = Math.round(24 * mScale);
  const tempoY = middleTop + Math.round(200 * mScale);
  const tempoBarH = Math.round(28 * mScale);
  const playedPanelY = middleTop + Math.round(235 * mScale);
  const panelH = Math.round(145 * mScale);
  const handPanelY = playedPanelY + panelH + Math.round(28 * mScale);
  const cardH = Math.round(110 * mScale);
  const cardW = Math.round(90 * mScale);
  const cardPadY = Math.round(16 * mScale);
  const cardGapX = cardW + 10;

  // ── Top-left HUD ──
  const hasZone = gameState.currentZone && gameState.currentZone.effect.type !== 'none';
  drawPanel(ctx, 10, 10, 160, hasZone ? 120 : 100);
  ctx.fillStyle = '#00ffc8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('🗺️ FL ' + gameState.floor, 20, 32);
  out.tooltipZones.push({ x: 15, y: 20, w: 150, h: 16, text: ['Floor: Current dungeon depth', 'Higher floors have tougher enemies'] });
  ctx.fillText('❤️ ' + gameState.playerHp + '/' + gameState.playerMaxHp, 20, 50);
  out.tooltipZones.push({ x: 15, y: 38, w: 150, h: 16, text: ['Health Points (HP)', 'Reach 0 and it\'s game over', 'Heal between floors'] });
  ctx.fillText('🛡️ ' + gameState.playerShield, 20, 68);
  const shieldTip = ['Shield: Absorbs incoming damage first', 'Resets to 0 each turn'];
  if (hasRelic(gameState.ownedRelics, 'sine_loom')) shieldTip.push('Sine Loom: prevents reset');
  if (hasRelic(gameState.ownedRelics, 'shield_battery')) shieldTip.push(`Shield Battery: +${2 * countRelic(gameState.ownedRelics, 'shield_battery')}/turn`);
  out.tooltipZones.push({ x: 15, y: 56, w: 150, h: 16, text: shieldTip });
  ctx.fillText('⚡ ' + gameState.playerEnergy + '/3', 20, 86);
  const energyTip = ['Energy: Spend to play cards', 'Refills to 3 each turn'];
  if (hasRelic(gameState.ownedRelics, 'coil_capacitor')) energyTip.push(`Coil Capacitor: +${countRelic(gameState.ownedRelics, 'coil_capacitor')} at start`);
  if (hasRelic(gameState.ownedRelics, 'energy_conduit')) energyTip.push(`Energy Conduit: +${countRelic(gameState.ownedRelics, 'energy_conduit')} per turn`);
  out.tooltipZones.push({ x: 15, y: 74, w: 150, h: 16, text: energyTip });
  ctx.fillStyle = '#ffcc00';
  ctx.fillText('\ud83d\udcb0 ' + gameState.currency, 20, 104);
  const currencyTip = ['Currency: Spend in the shop', 'Earn from defeating enemies'];
  if (hasRelic(gameState.ownedRelics, 'fault_lens')) currencyTip.push(`Fault Lens: +${10 * countRelic(gameState.ownedRelics, 'fault_lens')} per Glitch`);
  out.tooltipZones.push({ x: 15, y: 92, w: 150, h: 16, text: currencyTip });
  if (hasZone && gameState.currentZone) {
    ctx.fillStyle = '#ff9900'; ctx.font = 'bold 10px monospace';
    ctx.fillText('🌐 ' + gameState.currentZone.name, 20, 120);
    out.tooltipZones.push({ x: 15, y: 110, w: 150, h: 14, text: [`Zone: ${gameState.currentZone.name}`, gameState.currentZone.description] });
  }

  // ── Hamburger menu (bottom-right) ──
  if (gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
    const hw = 28, hh = 24, hx = W - hw - 10, hy = H - hh - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ly = hy + 8 + i * 6;
      ctx.beginPath(); ctx.moveTo(hx + 6, ly); ctx.lineTo(hx + hw - 6, ly); ctx.stroke();
    }
    out.hamburgerRect = { x: hx, y: hy, w: hw, h: hh };
    out.tooltipZones.push({ x: hx, y: hy, w: hw, h: hh, text: ['Menu (Esc)'] });
  }

  // ── Top-right HUD ──
  drawPanel(ctx, W - 170, 10, 160, 100);
  ctx.fillStyle = '#00ffc8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'right';
  ctx.fillText('PT ' + gameState.score, W - 20, 32);
  out.tooltipZones.push({ x: W - 165, y: 20, w: 150, h: 16, text: ['Points: Your total score', 'Earn points by dealing damage'] });
  ctx.fillStyle = '#b78ef6';
  ctx.fillText('TM ' + gameState.playerTempo + '/6', W - 20, 50);
  out.tooltipZones.push({ x: W - 165, y: 38, w: 150, h: 16, text: ['Tempo: Builds as you play cards', 'At max tempo (6), gain bonus effects', 'Resets each turn'] });
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText('ST ' + gameState.playerStatic + '/' + gameState.glitchThreshold, W - 20, 68);
  const staticTip = ['Static: Noise interference counter', `Glitch injected at ${gameState.glitchThreshold}`, 'Accumulates from duplicate card types'];
  if (hasRelic(gameState.ownedRelics, 'static_sink')) staticTip.push(`Static Sink: -${countRelic(gameState.ownedRelics, 'static_sink')} per turn`);
  if (hasRelic(gameState.ownedRelics, 'stability_core')) staticTip.push(`Stability Core: threshold → ${4 + countRelic(gameState.ownedRelics, 'stability_core') * 2}`);
  out.tooltipZones.push({ x: W - 165, y: 56, w: 150, h: 16, text: staticTip });
  ctx.fillStyle = '#00ffc8';
  ctx.fillText('HND: ' + gameState.hand.length, W - 20, 86);
  const hs = getHandSize(gameState.ownedRelics);
  const handTip = ['Hand Size: Cards in your hand', `Draw up to ${hs} cards each turn`];
  if (hasRelic(gameState.ownedRelics, 'expanded_buffer')) handTip.push(`Expanded Buffer: +${countRelic(gameState.ownedRelics, 'expanded_buffer')} hand size`);
  if (hasRelic(gameState.ownedRelics, 'echo_node')) handTip.push(`Echo Node: +${countRelic(gameState.ownedRelics, 'echo_node')} on Forge Burst`);
  out.tooltipZones.push({ x: W - 165, y: 74, w: 150, h: 16, text: handTip });
  ctx.fillText('DSC: ' + gameState.discard.length, W - 20, 104);
  out.tooltipZones.push({ x: W - 165, y: 92, w: 150, h: 16, text: ['Discard Pile: Used cards', 'Cards stay here once played', 'Glitch cards may be injected here'] });

  // ── Debugger's Lens ──
  if (hasRelic(gameState.ownedRelics, 'debuggers_lens') && gameState.deck.length > 0) {
    const lensY = 115;
    drawPanel(ctx, W - 170, lensY, 160, 55);
    ctx.fillStyle = '#ffcc44'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'right';
    ctx.fillText('🔍 NEXT DRAWS:', W - 20, lensY + 14);
    const top3 = gameState.deck.slice(0, 3);
    top3.forEach((card, i) => {
      const typeColors: Record<string, string> = { Pulse: '#ff6b6b', Sine: '#6bffb8', Saw: '#ff9f43', Noise: '#a78bfa' };
      ctx.fillStyle = typeColors[card.type] || '#aaaaaa';
      ctx.font = '9px monospace';
      ctx.fillText(`${i + 1}. ${card.name}`, W - 20, lensY + 28 + i * 12);
    });
    out.tooltipZones.push({ x: W - 165, y: lensY, w: 150, h: 55, text: ['Debugger\'s Lens: See your next draws', ...top3.map((c, i) => `${i + 1}. ${c.name} (${c.type}, ${c.cost}⚡)`)] });
  }

  // ── Enemies ──
  if (gameState.enemies.length > 0) {
    const enemyCount = gameState.enemies.length;
    const spacing = W / (enemyCount + 1);
    gameState.enemies.forEach((enemy, idx) => {
      const enemyX = spacing * (idx + 1);
      const enemyY = 80;
      const isSelected = enemy.id === gameState.selectedEnemyId;
      const colors = enemy.getArchetypeColors();
      const glowSize = isSelected ? 50 : 42;
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 0, 0.3)' : colors.glow;
      ctx.beginPath(); ctx.arc(enemyX, enemyY, glowSize, 0, Math.PI * 2); ctx.fill();
      const enemyGradient = ctx.createRadialGradient(enemyX - 8, enemyY - 8, 0, enemyX, enemyY, 30);
      enemyGradient.addColorStop(0, isSelected ? '#ffff66' : colors.inner);
      enemyGradient.addColorStop(1, isSelected ? '#ffff00' : colors.outer);
      ctx.fillStyle = enemyGradient;
      ctx.beginPath(); ctx.arc(enemyX, enemyY, 28, 0, Math.PI * 2); ctx.fill();
      if (enemy.shield > 0) {
        ctx.strokeStyle = 'rgba(80, 180, 255, 0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(enemyX, enemyY, 32, 0, Math.PI * 2); ctx.stroke();
        drawOutlinedText(ctx, `🔵${enemy.shield}`, enemyX, enemyY - 18, 'bold 9px monospace', '#55ccff', '#000000', 1);
      }
      ctx.strokeStyle = isSelected ? '#ffff00' : colors.border;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath(); ctx.arc(enemyX, enemyY, 28, 0, Math.PI * 2); ctx.stroke();
      drawOutlinedText(ctx, `${enemy.hp}/${enemy.maxHp}`, enemyX, enemyY + 2, 'bold 11px monospace', '#ffffff', '#000000', 1);
      ctx.fillStyle = '#ffff00'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(enemy.name.substring(0, 14), enemyX, enemyY + 45);
      if (enemy.archetype !== 'common') {
        ctx.fillStyle = colors.border; ctx.font = 'bold 7px monospace';
        ctx.fillText(enemy.archetype.toUpperCase(), enemyX, enemyY + 54);
      }
    });
  }

  // ── Sequences ──
  drawPanel(ctx, W / 2 - 200, seqY, 400, seqPanelH, 'PATTERN');
  out.tooltipZones.push({ x: W / 2 - 200, y: seqY, w: 400, h: 20, text: ['Pattern: Match the target sequence', 'Play cards in order to fill CURRENT', `A full match = Forge Burst (+${gameState.currentZone?.effect.type === 'forge_burst_bonus' ? gameState.currentZone.effect.value : 12} bonus dmg)`, '★ slots accept any waveform type', 'Wildcard cards match any slot'] });

  ctx.fillStyle = '#00ffc8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('TARGET', W / 2, seqY + Math.round(20 * mScale));
  const tLen = gameState.targetSequence.length;
  const boxW = 36, boxGap = 30;
  const tTotalW = tLen * boxW + (tLen - 1) * boxGap;
  const tStartX = W / 2 - tTotalW / 2;
  gameState.targetSequence.forEach((type, i) => {
    const x = tStartX + i * (boxW + boxGap) + boxW / 2;
    const isWild = type === '*';
    const tc = isWild ? '#ffcc00' : ({ Pulse: '#ff4444', Sine: '#4488ff', Saw: '#44ff44', Noise: '#ff88ff' }[type] || '#cccccc');
    const grad = ctx.createLinearGradient(x - boxW / 2, seqY + Math.round(25 * mScale), x - boxW / 2, seqY + Math.round(55 * mScale));
    grad.addColorStop(0, tc + '44'); grad.addColorStop(1, tc + '11');
    ctx.fillStyle = grad;
    ctx.fillRect(x - boxW / 2, seqY + Math.round(25 * mScale), boxW, seqBoxH);
    ctx.strokeStyle = tc; ctx.lineWidth = 2;
    ctx.strokeRect(x - boxW / 2, seqY + Math.round(25 * mScale), boxW, seqBoxH);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace';
    ctx.fillText(isWild ? '★' : type.substring(0, 2), x, seqY + Math.round(45 * mScale));
  });

  ctx.fillStyle = '#00ffc8'; ctx.font = 'bold 11px monospace';
  ctx.fillText('CURRENT', W / 2, seqY + Math.round(75 * mScale));
  if (gameState.currentSequence.length > 0) {
    const cLen = gameState.currentSequence.length;
    const cTotalW = cLen * boxW + (cLen - 1) * boxGap;
    const cStartX = W / 2 - cTotalW / 2;
    gameState.currentSequence.forEach((type, i) => {
      const x = cStartX + i * (boxW + boxGap) + boxW / 2;
      const targetType = gameState.targetSequence[i];
      const isMatch = targetType === '*' || type === targetType;
      const matchColor = isMatch ? '#44ff44' : '#ff8844';
      const grad = ctx.createLinearGradient(x - boxW / 2, seqY + Math.round(80 * mScale), x - boxW / 2, seqY + Math.round(110 * mScale));
      grad.addColorStop(0, matchColor + '44'); grad.addColorStop(1, matchColor + '11');
      ctx.fillStyle = grad;
      ctx.fillRect(x - boxW / 2, seqY + Math.round(80 * mScale), boxW, seqBoxH);
      ctx.strokeStyle = matchColor; ctx.lineWidth = isMatch ? 3 : 2;
      ctx.strokeRect(x - boxW / 2, seqY + Math.round(80 * mScale), boxW, seqBoxH);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace';
      ctx.fillText(type.substring(0, 2), x, seqY + Math.round(100 * mScale));
    });
  }

  // ── Damage preview ──
  if (gameState.playedThisTurn.length > 0) {
    const isMatch = gameState.currentSequence.length === gameState.targetSequence.length &&
      gameState.targetSequence.every((t, i) => t === '*' || t === gameState.currentSequence[i]);
    const baseDamage = gameState.playedThisTurn.reduce((sum, c) => sum + c.getEffectiveDamage(), 0);
    const matchBonus = isMatch ? 12 : 0;
    let resonatorBonus = 0;
    const resCount = countRelic(gameState.ownedRelics, 'harmonic_resonator');
    if (resCount > 0) {
      const typeCounts: Record<string, number> = {};
      gameState.playedThisTurn.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });
      for (const count of Object.values(typeCounts)) { if (count >= 2) resonatorBonus += 4 * resCount; }
    }
    const mirrorBonus = gameState.playedThisTurn.some(c => c.type === 'Saw') ? 3 * countRelic(gameState.ownedRelics, 'signal_mirror') : 0;
    const totalDamage = baseDamage + matchBonus + resonatorBonus + mirrorBonus;
    const hasAoe = gameState.playedThisTurn.some(c => c.aoe);

    const dmgGrad = ctx.createLinearGradient(W / 2 - 120, dmgBoxY, W / 2 + 120, dmgBoxY + dmgBoxH);
    dmgGrad.addColorStop(0, 'rgba(255, 200, 0, 0.25)'); dmgGrad.addColorStop(0.5, 'rgba(255, 200, 0, 0.15)'); dmgGrad.addColorStop(1, 'rgba(255, 200, 0, 0.25)');
    ctx.fillStyle = dmgGrad; ctx.fillRect(W / 2 - 120, dmgBoxY, 240, dmgBoxH);
    ctx.strokeStyle = '#ffc800'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 120, dmgBoxY, 240, dmgBoxH);
    ctx.fillStyle = '#ffc800'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    const aoeMark = hasAoe ? ' [AOE]' : '';
    const bonusParts: string[] = [];
    if (matchBonus > 0) bonusParts.push(`${matchBonus}`);
    if (resonatorBonus > 0) bonusParts.push(`${resonatorBonus}`);
    if (mirrorBonus > 0) bonusParts.push(`${mirrorBonus}`);
    const equation = bonusParts.length > 0
      ? `DAMAGE: ${baseDamage}+${bonusParts.join('+')}=${totalDamage}${aoeMark}`
      : `DAMAGE: ${totalDamage}${aoeMark}`;
    ctx.fillText(equation, W / 2, dmgBoxY + Math.round(dmgBoxH * 0.7));

    const dmgTipLines = ['Damage Preview (applied on End Turn)', `Base: ${baseDamage} (sum of card damage)`];
    if (isMatch) dmgTipLines.push(`Forge Burst: +${matchBonus}`);
    if (resonatorBonus > 0) dmgTipLines.push(`Harmonic Resonator: +${resonatorBonus}`);
    if (mirrorBonus > 0) dmgTipLines.push(`Signal Mirror: +${mirrorBonus}`);
    if (hasAoe) dmgTipLines.push('AOE: Hits ALL enemies');
    dmgTipLines.push(`Total: ${totalDamage}`);
    out.tooltipZones.push({ x: W / 2 - 120, y: dmgBoxY, w: 240, h: dmgBoxH, text: dmgTipLines });
  }

  // ── Tempo bar ──
  const tempoW = 250;
  out.tooltipZones.push({ x: W / 2 - tempoW / 2, y: tempoY, w: tempoW, h: tempoBarH, text: ['Tempo Bar: Builds as you play cards', 'Each card played adds +1 tempo', 'Some cards grant bonus tempo', 'Max 6 — resets each turn'] });
  ctx.fillStyle = 'rgba(183, 142, 246, 0.1)'; ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoW, tempoBarH);
  const tempoFill = (gameState.playerTempo / 6) * tempoW;
  const tempoGrad = ctx.createLinearGradient(W / 2 - tempoW / 2, tempoY, W / 2 - tempoW / 2 + tempoFill, tempoY + tempoBarH);
  tempoGrad.addColorStop(0, '#9966ff'); tempoGrad.addColorStop(1, '#6b4fbb');
  ctx.fillStyle = tempoGrad; ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoFill, tempoBarH);
  ctx.strokeStyle = '#b78ef6'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - tempoW / 2, tempoY, tempoW, tempoBarH);
  drawOutlinedText(ctx, `TEMPO: ${gameState.playerTempo}/6`, W / 2, tempoY + Math.round(tempoBarH * 0.68), 'bold 12px monospace', '#ffffff', '#000000', 1);

  // ── Played cards ──
  drawPanel(ctx, 20, playedPanelY, W - 40, panelH, 'PLAYED (' + gameState.playedThisTurn.length + ')');
  out.tooltipZones.push({ x: 20, y: playedPanelY - 12, w: 120, h: 16, text: ['Played Cards: Cards used this turn', 'Click a played card to return it', 'to your hand and refund its cost', '🔒 = locked (irreversible effect)'] });
  if (gameState.playedThisTurn.length > 0) {
    const playedStartX = 40, playedStartY = playedPanelY + cardPadY;
    gameState.playedThisTurn.forEach((card, i) => {
      const cardX = playedStartX + i * cardGapX;
      if (cardX + cardW > W - 20) return;
      drawCard(ctx, card, cardX, playedStartY, cardW, cardH);
      const isLocked = !!(card.draw || card.glitchGen || card.stabilize);
      if (isLocked) {
        ctx.save();
        drawRoundRect(ctx, cardX, playedStartY, cardW, cardH, 8); ctx.clip();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(cardX, playedStartY, cardW, cardH);
        ctx.restore();
        ctx.fillStyle = '#ff8888'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('🔒', cardX + cardW / 2, playedStartY + cardH / 2 + 4);
      }
      out.cardRects.push({ index: i, x: cardX, y: playedStartY, w: cardW, h: cardH, type: 'played' });
    });
  }

  // ── Hand cards ──
  drawPanel(ctx, 20, handPanelY, W - 40, panelH, 'HAND (' + gameState.hand.length + ')');
  out.tooltipZones.push({ x: 20, y: handPanelY - 12, w: 120, h: 16, text: ['Your Hand: Available cards to play', 'Click a card to play it', 'Grayed = not enough energy'] });

  const nextSlotIdx = gameState.currentSequence.length;
  const neededType = nextSlotIdx < gameState.targetSequence.length ? gameState.targetSequence[nextSlotIdx] : null;

  // Sort hand
  let sortedHand = [...gameState.hand];
  const handIndexMap: number[] = gameState.hand.map((_, i) => i);
  switch (gameState.handSortMode) {
    case 'cost': { const s = sortedHand.map((c, i) => ({ card: c, origIdx: i })).sort((a, b) => a.card.cost - b.card.cost); sortedHand = s.map(x => x.card); handIndexMap.splice(0, handIndexMap.length, ...s.map(x => x.origIdx)); break; }
    case 'type': { const typeOrder: Record<string, number> = { Pulse: 0, Sine: 1, Saw: 2, Noise: 3 }; const s = sortedHand.map((c, i) => ({ card: c, origIdx: i })).sort((a, b) => (typeOrder[a.card.type] ?? 4) - (typeOrder[b.card.type] ?? 4)); sortedHand = s.map(x => x.card); handIndexMap.splice(0, handIndexMap.length, ...s.map(x => x.origIdx)); break; }
    case 'damage': { const s = sortedHand.map((c, i) => ({ card: c, origIdx: i })).sort((a, b) => b.card.damage - a.card.damage); sortedHand = s.map(x => x.card); handIndexMap.splice(0, handIndexMap.length, ...s.map(x => x.origIdx)); break; }
  }

  const handStartX = 40, handStartY = handPanelY + cardPadY;
  const cardsPerRow = Math.floor((W - 60) / cardGapX);
  sortedHand.forEach((card, i) => {
    const row = Math.floor(i / cardsPerRow), col = i % cardsPerRow;
    const cx = handStartX + col * cardGapX;
    const cy = handStartY + row * (cardH + 10);
    const canPlay = card.cost <= gameState.playerEnergy;
    const isSequenceMatch = neededType && (neededType === '*' || card.type === neededType || card.wildcard);
    if (isSequenceMatch && canPlay) {
      ctx.save(); ctx.shadowColor = '#eab308'; ctx.shadowBlur = 12;
      ctx.strokeStyle = '#eab308'; ctx.lineWidth = 2;
      drawRoundRect(ctx, cx - 1, cy - 1, cardW + 2, cardH + 2, 8); ctx.stroke(); ctx.restore();
    }
    drawCard(ctx, card, cx, cy, cardW, cardH);
    const origIdx = handIndexMap[i];
    if (gameState.mulliganAvailable && gameState.mulliganSelected.includes(origIdx)) {
      ctx.save(); ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 14;
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
      drawRoundRect(ctx, cx - 1, cy - 1, cardW + 2, cardH + 2, 8); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#ff4444'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('MULLIGAN', cx + cardW / 2, cy + cardH - 4);
    }
    if (!canPlay && !gameState.mulliganAvailable) {
      ctx.save(); drawRoundRect(ctx, cx, cy, cardW, cardH, 8); ctx.clip();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(cx, cy, cardW, cardH); ctx.restore();
      ctx.fillStyle = '#888888'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('NO', cx + cardW / 2, cy + cardH / 2 - 2);
      ctx.fillText('COST', cx + cardW / 2, cy + cardH / 2 + 8);
    }
    out.cardRects.push({ index: origIdx, x: cx, y: cy, w: cardW, h: cardH, type: 'hand' });
  });

  // ── End turn button ──
  const btnY = H - 45, btnW = 160, btnH = 35, btnX = W / 2 - btnW / 2;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
  btnGrad.addColorStop(0, '#00d4ff'); btnGrad.addColorStop(1, '#0088cc');
  ctx.fillStyle = btnGrad; drawRoundRect(ctx, btnX, btnY, btnW, btnH, 8); ctx.fill();
  ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; drawRoundRect(ctx, btnX, btnY, btnW, btnH, 8); ctx.stroke();
  drawOutlinedText(ctx, 'END TURN', btnX + btnW / 2, btnY + btnH / 2 + 5, 'bold 14px monospace', '#ffffff', '#000000', 2);
  out.endTurnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

  // End turn tooltip with damage preview
  const pvDmgMult = gameState.currentZone?.effect.type === 'damage_mult' ? gameState.currentZone.effect.value : 1;
  const previewPlayerDmg = Math.floor(gameState.playedThisTurn.reduce((sum, c) => {
    let d = c.getEffectiveDamage(); d += gameState.playerTempo;
    if (c.echo) d = Math.floor(d * 1.5);
    return sum + d;
  }, 0) * pvDmgMult);
  const previewEnemyDmg = Math.floor(gameState.enemies.reduce((sum, e) => {
    if (e.hp <= 0) return sum;
    const frozen = e.statusEffects?.find(s => s.type === 'freeze' && s.duration > 0);
    if (frozen) return sum; return sum + e.damage;
  }, 0) * pvDmgMult);
  const previewAfterShield = Math.max(0, previewEnemyDmg - gameState.playerShield);
  out.tooltipZones.push({ x: btnX, y: btnY, w: btnW, h: btnH, text: [
    'End Turn: Resolve combat', `⚔️ You deal ~${previewPlayerDmg} damage`,
    `🛡️ Enemies deal ~${previewEnemyDmg} (${previewAfterShield} after shield)`,
    '', 'Q: End turn | 1-9: Play cards', 'S: Sort | D: Deck | F: Discard',
  ] });

  // ── Player circle ──
  const playerX = W - 70, playerY = btnY + 10;
  ctx.fillStyle = 'rgba(0, 255, 200, 0.15)'; ctx.beginPath(); ctx.arc(playerX, playerY, 30, 0, Math.PI * 2); ctx.fill();
  const playerGradient = ctx.createRadialGradient(playerX - 5, playerY - 5, 0, playerX, playerY, 25);
  playerGradient.addColorStop(0, '#00ffdd'); playerGradient.addColorStop(1, '#00aa99');
  ctx.fillStyle = playerGradient; ctx.beginPath(); ctx.arc(playerX, playerY, 25, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(playerX, playerY, 25, 0, Math.PI * 2); ctx.stroke();
  drawOutlinedText(ctx, `${gameState.playerHp}/${gameState.playerMaxHp}`, playerX, playerY - 2, 'bold 12px monospace', '#ffffff', '#000000', 1);

  // Turn indicator
  const turnX = playerX - 55, turnY = playerY;
  ctx.fillStyle = 'rgba(0, 100, 120, 0.5)'; ctx.beginPath(); ctx.arc(turnX, turnY, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#00cccc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(turnX, turnY, 18, 0, Math.PI * 2); ctx.stroke();
  drawOutlinedText(ctx, 'T' + gameState.turn, turnX, turnY + 1, 'bold 11px monospace', '#00ffc8', '#000000', 1);
  out.tooltipZones.push({ x: turnX - 18, y: turnY - 18, w: 36, h: 36, text: ['Turn: Current turn number'] });
  const playerTipLines = [
    'You: The Signal Forger', `HP: ${gameState.playerHp}/${gameState.playerMaxHp}`,
    `Shield: ${gameState.playerShield}`, `Static: ${gameState.playerStatic}/${gameState.glitchThreshold}`,
  ];
  if (gameState.voidShieldActive) playerTipLines.push('🛡️ Void Shield: Active');
  if (gameState.momentumCoreActive) playerTipLines.push('⚡ Momentum Core: -1 cost next turn');
  if (gameState.damageTakenLastTurn > 0) playerTipLines.push(`Last turn damage: ${gameState.damageTakenLastTurn}`);
  playerTipLines.push(`Relics: ${gameState.ownedRelics.length > 0 ? gameState.ownedRelics.map(r => r.name).join(', ') : 'None'}`);
  out.tooltipZones.push({ x: playerX - 30, y: playerY - 30, w: 60, h: 60, text: playerTipLines });

  // ── Card tooltips ──
  for (const cr of out.cardRects) {
    const card = cr.type === 'hand' ? gameState.hand[cr.index] : gameState.playedThisTurn[cr.index];
    if (!card) continue;
    const lines: string[] = [
      card.name,
      `Type: ${card.type}  |  Rarity: ${card.rarity}`,
      card.cost >= 99 ? 'Cost: UNPLAYABLE' : `Cost: ${card.cost} Energy`,
    ];
    if (card.damage > 0) lines.push(`Damage: ${card.getEffectiveDamage()}${card.echo ? ' (Echo +50%)' : ''}${card.aoe ? ' [AOE]' : ''}`);
    if (card.shield > 0) lines.push(`Shield: ${card.getEffectiveShield()}${card.echo ? ' (Echo +50%)' : ''}`);
    if (card.draw) lines.push(`Draw: +${card.draw} card(s)`);
    if (card.tempoGain) lines.push(`Tempo: +${card.tempoGain} extra`);
    if (card.staticGain) lines.push(`Static: +${card.staticGain}`);
    if (card.staticReduce) lines.push(`Static Reduce: -${card.staticReduce}`);
    if (card.stabilize) lines.push(`Stabilize: Purge ${card.stabilize} Glitch`);
    if (card.selfDamage) lines.push(`Self Damage: ${card.selfDamage}`);
    if (card.glitchGen) lines.push(`Generates ${card.glitchGen} Glitch card(s)`);
    if (card.leech) lines.push(`Leech: Heal ${card.leech}% of dmg dealt`);
    if (card.sustain) lines.push('Sustain: Returns to hand');
    if (card.exhaust) lines.push('Exhaust: Removed after use');
    if (card.wildcard) lines.push('Wildcard: Matches any type');
    if (card.piercing) lines.push('Piercing: Ignores enemy shield/armor');
    if (card.chain) lines.push(`Chain: Next ${card.type} costs ${card.chain} less`);
    if (card.growing) lines.push(`Growing: +${card.growing} dmg each play (${card.growthCounter ?? 0} stacks)`);
    if (card.retain) lines.push('Retain: Stays in hand between turns');
    if (card.multihit) lines.push(`Multihit: Hits ${card.multihit} times`);
    if (card.innate) lines.push('Innate: Always in opening hand');
    if (card.ethereal) lines.push('Ethereal: Auto-exhausts if unplayed');
    if (card.siphon) lines.push(`Siphon: Steal ${card.siphon} shield from enemy`);
    if (card.bleed) lines.push(`Bleed: Apply ${card.bleed} bleed stacks`);
    if (card.freeze) lines.push(`Freeze: Apply ${card.freeze} freeze`);
    if (card.vulnerable) lines.push(`Vulnerable: Apply ${card.vulnerable} stacks`);
    if (card.weak) lines.push(`Weak: Apply ${card.weak} stacks`);
    if (card.upgraded) lines.push('★ UPGRADED (+25% stats)');
    lines.push(card.effect);
    const keywordTips = getRelevantTooltips(card);
    if (keywordTips.length > 0) { lines.push(''); keywordTips.forEach(tip => lines.push(`• ${tip.term}: ${tip.explanation}`)); }
    out.tooltipZones.push({ x: cr.x, y: cr.y, w: cr.w, h: cr.h, text: lines });
  }

  // ── Enemy tooltips ──
  if (gameState.enemies.length > 0) {
    const enemyCount = gameState.enemies.length;
    const enemySpacing = W / (enemyCount + 1);
    gameState.enemies.forEach((enemy, idx) => {
      const ex = enemySpacing * (idx + 1), ey = 80;
      const tipLines: string[] = [
        `${enemy.name}${enemy.archetype !== 'common' ? ` [${enemy.archetype.toUpperCase()}]` : ''}`,
        enemy.description || '',
        `HP: ${enemy.hp}/${enemy.maxHp}${enemy.shield > 0 ? ` | Shield: ${enemy.shield}` : ''}`,
        `Intent: ${enemy.intent} | Dmg: ${enemy.getDamage()}${enemy.enrage && enemy.hp <= enemy.maxHp * 0.5 ? ' (ENRAGED!)' : ''}`,
      ].filter(Boolean);
      // Status effects
      if (enemy.statusEffects && enemy.statusEffects.length > 0) {
        tipLines.push('--- Status ---');
        const statusIcons: Record<string, string> = { bleed: '🩸', freeze: '❄️', vulnerable: '💥', weak: '😵', marked: '🎯' };
        for (const s of enemy.statusEffects) {
          tipLines.push(`${statusIcons[s.type] || '•'} ${s.type}: ${s.stacks} stacks (${s.duration}t)`);
        }
      }
      const abilities = enemy.getAbilityDescriptions();
      if (abilities.length > 0) { tipLines.push('--- Abilities ---'); tipLines.push(...abilities); }
      tipLines.push('Click to target this enemy');
      out.tooltipZones.push({ x: ex - 35, y: ey - 35, w: 70, h: 95, text: tipLines });
    });
  }

  // ── Combat log ──
  if (gameState.combatLog.length > 0) {
    const logX = 10;
    const hasZoneLog = gameState.currentZone && gameState.currentZone.effect.type !== 'none';
    const logY = hasZoneLog ? 140 : 120;
    const logLineH = 14;
    const maxLogChars = 38; // chars that fit in 200px at 10px mono
    // Wrap log lines that exceed the panel width
    const wrappedLogLines: string[] = [];
    for (const line of gameState.combatLog.slice(0, 8)) {
      if (line.length <= maxLogChars) { wrappedLogLines.push(line); }
      else {
        for (let i = 0; i < line.length; i += maxLogChars) wrappedLogLines.push(line.slice(i, i + maxLogChars));
      }
      if (wrappedLogLines.length >= 6) break;
    }
    const logLines = wrappedLogLines.slice(0, 6);
    ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10, 14, 39, 0.7)';
    const logH = logLines.length * logLineH + 10;
    drawRoundRect(ctx, logX, logY, 200, logH, 4); ctx.fill();
    logLines.forEach((line, li) => {
      ctx.fillStyle = '#aaeeff';
      ctx.fillText(line, logX + 6, logY + 12 + li * logLineH);
    });
    // Tooltip shows all log entries, wrapped at 60 chars
    const allLogWrapped: string[] = ['Combat Log: Last turn events'];
    for (const line of gameState.combatLog) {
      if (line.length <= 60) { allLogWrapped.push(line); }
      else { for (let i = 0; i < line.length; i += 60) allLogWrapped.push(line.slice(i, i + 60)); }
    }
    out.tooltipZones.push({ x: logX, y: logY, w: 200, h: logH, text: allLogWrapped });
  }

  // ── Hover tooltip ──
  if (mousePos) {
    for (let i = out.tooltipZones.length - 1; i >= 0; i--) {
      const zone = out.tooltipZones[i];
      if (mousePos.x >= zone.x && mousePos.x <= zone.x + zone.w && mousePos.y >= zone.y && mousePos.y <= zone.y + zone.h) {
        const lines = zone.text;
        ctx.font = 'bold 11px monospace';
        const lineH = 16, pad = 10;
        let maxLineW = 0;
        for (const line of lines) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
        const tipW = maxLineW + pad * 2;
        const tipH = lines.length * lineH + pad * 2 - 4;
        let tipX = mousePos.x + 14, tipY = mousePos.y + 14;
        if (tipX + tipW > W - 4) tipX = mousePos.x - tipW - 8;
        if (tipY + tipH > H - 4) tipY = mousePos.y - tipH - 8;
        if (tipX < 4) tipX = 4; if (tipY < 4) tipY = 4;
        ctx.fillStyle = 'rgba(10, 14, 39, 0.95)';
        drawRoundRect(ctx, tipX, tipY, tipW, tipH, 6); ctx.fill();
        ctx.strokeStyle = '#00ffc8'; ctx.lineWidth = 1.5;
        drawRoundRect(ctx, tipX, tipY, tipW, tipH, 6); ctx.stroke();
        ctx.textAlign = 'left';
        lines.forEach((line, li) => {
          ctx.fillStyle = li === 0 ? '#00ffc8' : '#cccccc';
          ctx.font = li === 0 ? 'bold 11px monospace' : '11px monospace';
          ctx.fillText(line, tipX + pad, tipY + pad + li * lineH + 10);
        });
        break;
      }
    }
  }
}
