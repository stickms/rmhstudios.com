// Lightweight particle system for dust, sparkles, dash trails, chip bursts,
// ability pickups and the coin-flip ritual. Pooled-ish: capped array.
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shrink: boolean;
}

export class Particles {
  list: Particle[] = [];
  private cap = 260;

  clear() {
    this.list.length = 0;
  }

  private add(p: Particle) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    opts: { speed?: number; gravity?: number; life?: number; size?: number } = {}
  ) {
    const speed = opts.speed ?? 80;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: opts.life ?? 0.5,
        maxLife: opts.life ?? 0.5,
        size: opts.size ?? 2,
        color,
        gravity: opts.gravity ?? 200,
        shrink: true,
      });
    }
  }

  trail(x: number, y: number, color: string) {
    this.add({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 0.28,
      maxLife: 0.28,
      size: 2,
      color,
      gravity: 0,
      shrink: true,
    });
  }

  dust(x: number, y: number, dir: number) {
    this.add({
      x,
      y,
      vx: dir * (20 + Math.random() * 30),
      vy: -Math.random() * 20,
      life: 0.3,
      maxLife: 0.3,
      size: 1,
      color: "#5a5048",
      gravity: 120,
      shrink: true,
    });
  }

  rise(x: number, y: number, color: string) {
    this.add({
      x: x + (Math.random() - 0.5) * 10,
      y,
      vx: (Math.random() - 0.5) * 14,
      vy: -20 - Math.random() * 30,
      life: 0.9,
      maxLife: 0.9,
      size: 2,
      color,
      gravity: -10,
      shrink: true,
    });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    for (const p of this.list) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, a);
      const s = p.shrink ? Math.max(1, Math.round(p.size * a)) : p.size;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
