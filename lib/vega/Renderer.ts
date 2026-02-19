import { Entity, Enemy, Tower, Projectile } from './Entities';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private frameCount: number = 0;

  // Colors
  public static COLORS = {
    BACKGROUND: '#0f172a', // Slate-900
    GRID: 'rgba(148, 163, 184, 0.1)', // Slate-400 equivalent with opacity
    TOWER: '#38bdf8', // Sky-400
    ENEMY: '#f43f5e', // Rose-500
    PROJECTILE: '#f0f9ff', // Sky-50
    TEXT: '#94a3b8', // Slate-400
    PATH: 'rgba(56, 189, 248, 0.2)' // Sky-400 with opacity
  };

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  public clear() {
    this.ctx.fillStyle = Renderer.COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  public drawGrid(cols: number, rows: number, cellSize: number) {
    this.ctx.strokeStyle = Renderer.COLORS.GRID;
    this.ctx.lineWidth = 1;
    
    // Draw columns
    for (let x = 0; x <= cols; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * cellSize, 0);
      this.ctx.lineTo(x * cellSize, this.height);
      this.ctx.stroke();
    }
    
    // Draw rows
    for (let y = 0; y <= rows; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * cellSize);
      this.ctx.lineTo(this.width, y * cellSize);
      this.ctx.stroke();
    }
  }

  public drawGridPath(pathPoints: {x: number, y: number}[], cellSize: number) {
    if (pathPoints.length < 2) return;

    this.ctx.strokeStyle = Renderer.COLORS.PATH;
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 4;
    this.ctx.shadowColor = Renderer.COLORS.ENEMY;
    
    this.ctx.beginPath();
    const start = pathPoints[0];
    this.ctx.moveTo(start.x * cellSize + cellSize/2, start.y * cellSize + cellSize/2);
    
    for (let i = 1; i < pathPoints.length; i++) {
      const p = pathPoints[i];
      this.ctx.lineTo(p.x * cellSize + cellSize/2, p.y * cellSize + cellSize/2);
    }
    
    this.ctx.stroke();
    
    // Reset shadow
    this.ctx.shadowBlur = 0;
  }

  public drawTower(tower: Tower, cellSize: number, isGlitching: boolean = false) {
    let drawX = tower.x * cellSize + 2;
    let drawY = tower.y * cellSize + 2;
    let size = cellSize - 4;

    // Glitch Offset
    if (isGlitching && Math.random() > 0.8) {
      drawX += (Math.random() - 0.5) * 5;
      drawY += (Math.random() - 0.5) * 5;
    }

    this.ctx.fillStyle = Renderer.COLORS.TOWER;
    this.ctx.shadowColor = Renderer.COLORS.TOWER;
    this.ctx.shadowBlur = 10;
    
    // Check if ghost
    if (tower.isGhost) {
      this.ctx.globalAlpha = 0.5;
    }

    this.ctx.fillRect(drawX, drawY, size, size);
    
    // Inner detail based on type
    this.ctx.fillStyle = '#000';
    if (tower.type === 'SYNAPSE') {
        this.ctx.fillRect(drawX + size * 0.25, drawY + size * 0.25, size * 0.5, size * 0.5);
    } else if (tower.type === 'LOBOTOMIZER') {
        this.ctx.beginPath();
        this.ctx.arc(drawX + size/2, drawY + size/2, size * 0.2, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  public drawEnemy(enemy: Enemy) {
    this.ctx.fillStyle = Renderer.COLORS.ENEMY;
    this.ctx.shadowColor = Renderer.COLORS.ENEMY;
    this.ctx.shadowBlur = 5;
    
    const size = 20;
    this.ctx.fillRect(enemy.x - size/2, enemy.y - size/2, size, size);

    // Health Bar
    const hpPct = enemy.health / enemy.maxHealth;
    this.ctx.fillStyle = 'red';
    this.ctx.fillRect(enemy.x - size/2, enemy.y - size/2 - 5, size, 2);
    this.ctx.fillStyle = 'green';
    this.ctx.fillRect(enemy.x - size/2, enemy.y - size/2 - 5, size * hpPct, 2);

    this.ctx.shadowBlur = 0;
  }

  public drawProjectile(proj: Projectile) {
    this.ctx.fillStyle = Renderer.COLORS.PROJECTILE;
    this.ctx.beginPath();
    this.ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  public drawCRTOverlay() {
    // Scanlines
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < this.height; y += 4) {
      this.ctx.fillRect(0, y, this.width, 2);
    }
    
    // Vignette (simple radial gradient approximation)
    const gradient = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width * 0.3,
      this.width / 2, this.height / 2, this.width * 0.8
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  
  public drawRange(x: number, y: number, range: number, color: string = 'rgba(255, 255, 255, 0.1)') {
    const cx = x * 40 + 20;
    const cy = y * 40 + 20;

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, range, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  public render(timestamp: number) {
    this.frameCount++;
    // This method can coordinate standard render passes
  }
}
