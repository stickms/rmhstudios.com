/**
 * canvasHelpers.ts — Canvas drawing primitives for Signal Forge
 *
 * Reusable drawing helper functions used by the canvas renderer.
 * All functions take a CanvasRenderingContext2D as their first argument
 * so they're pure/stateless and easy to test.
 */

import type { Card } from '@/lib/signal-forge/Card';

/** Tooltip hover zone tracked during rendering. */
export interface TooltipZone {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string[];
}

/** Clickable card rectangle tracked during rendering. */
export interface CardRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'hand' | 'played';
}

/** Draw text with a contrasting outline. */
export function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  font: string, fillColor: string, outlineColor: string, outlineWidth: number,
): void {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

/** Draw a rounded rectangle path (does NOT fill or stroke). */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number = 8,
): void {
  const rr = (ctx as CanvasRenderingContext2D & { roundRect?: typeof CanvasRenderingContext2D.prototype.roundRect }).roundRect;
  if (rr) {
    ctx.beginPath();
    rr.call(ctx, x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/** Draw a translucent panel with optional title. */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, title: string = '',
): void {
  ctx.fillStyle = 'rgba(0, 255, 200, 0.08)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  if (title) {
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 10, y - 5);
  }
}

/** Draw a card with type-colored gradient, border, name, cost, damage, shield, keywords. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Card, x: number, y: number, w: number, h: number, isHovered: boolean = false,
): void {
  const cardRadius = 8;
  const isGlitch = card.isGlitch;
  const typeColor = isGlitch
    ? '#ff2222'
    : ({ Pulse: '#ff4444', Sine: '#4488ff', Saw: '#44ff44', Noise: '#ff88ff' }[card.type as string] || '#cccccc');

  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, typeColor + (isGlitch ? '55' : '33'));
  gradient.addColorStop(1, typeColor + (isGlitch ? '22' : '11'));
  ctx.fillStyle = gradient;
  drawRoundRect(ctx, x, y, w, h, cardRadius);
  ctx.fill();

  ctx.strokeStyle = isHovered ? typeColor : typeColor + '99';
  ctx.lineWidth = isHovered ? 2 : 1;
  drawRoundRect(ctx, x, y, w, h, cardRadius);
  ctx.stroke();

  if (isHovered) {
    ctx.shadowColor = typeColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = typeColor;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x + 1, y + 1, w - 2, h - 2, cardRadius - 1);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
  }

  ctx.fillStyle = isGlitch ? '#ff4444' : '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(card.name.substring(0, 14), x + w / 2, y + h / 2 - 12);

  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = typeColor;
  ctx.fillText(`⚡${card.cost >= 99 ? '✕' : card.cost}`, x + w / 2 - 15, y + h / 2 + 2);
  if (card.damage > 0) {
    const dmgText = card.echo ? `💢${card.getEffectiveDamage()}` : `💢${card.damage}`;
    ctx.fillText(dmgText, x + w / 2 + 15, y + h / 2 + 2);
  }

  if (card.shield > 0) {
    const shText = card.echo ? `🛡️${card.getEffectiveShield()}` : `🛡️${card.shield}`;
    ctx.fillStyle = '#4488ff';
    ctx.fillText(shText, x + w / 2, y + h - 12);
  }

  if (card.keywords && card.keywords.length > 0 && w > 50) {
    const kw = card.keywords.slice(0, 2).join(' ');
    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = isGlitch ? '#ff4444' : '#ffcc00';
    ctx.fillText(kw, x + w / 2, y + h - 3);
  }
}
