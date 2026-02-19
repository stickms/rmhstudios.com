import { Enemy, Tower, Projectile, Point } from './Entities';

export class EntityManager {
  public towers: Tower[] = [];
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];

  constructor() {}

  public addTower(tower: Tower) {
    this.towers.push(tower);
  }

  public addEnemy(enemy: Enemy) {
    this.enemies.push(enemy);
  }

  public addProjectile(projectile: Projectile) {
    this.projectiles.push(projectile);
  }

  public getTowerAt(x: number, y: number): Tower | undefined {
      return this.towers.find(t => t.x === x && t.y === y);
  }

  public update(deltaTime: number, path: Point[], cellSize: number) {
    this.updateEnemies(deltaTime, path, cellSize);
    this.updateTowers(deltaTime);
    this.updateProjectiles(deltaTime);
    
    // Cleanup dead entities
    this.enemies = this.enemies.filter(e => e.active);
    this.projectiles = this.projectiles.filter(p => p.active);
  }

  private updateEnemies(deltaTime: number, path: Point[], cellSize: number) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;

      // Movement Logic along Path
      // This is a simplified version. A real one would interpolate between path nodes.
      if (enemy.pathIndex < path.length - 1) {
        const currentTarget = path[enemy.pathIndex + 1];
        const targetX = currentTarget.x * cellSize + cellSize/2;
        const targetY = currentTarget.y * cellSize + cellSize/2;
        
        // Move towards target
        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < enemy.speed) {
          // Reached node
          enemy.x = targetX;
          enemy.y = targetY;
          enemy.pathIndex++;
        } else {
          // Move
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        }
      } else {
        // Reached end
        enemy.active = false;
        // TODO: Damage Core logic
      }
    }
  }

  private updateTowers(deltaTime: number) {
    const now = Date.now();
    for (const tower of this.towers) {
      if (now - tower.lastFireTime >= tower.fireRate) {
        // Find target
        const target = this.findTarget(tower);
        if (target) {
          // Fire
          this.addProjectile(new Projectile(
            tower.x * 40 + 20, // Center of cell
            tower.y * 40 + 20, 
            target.id, 
            tower.damage
          ));
          tower.lastFireTime = now;
        }
      }
    }
  }

  private updateProjectiles(deltaTime: number) {
    for (const proj of this.projectiles) {
      const target = this.enemies.find(e => e.id === proj.targetId);
      if (!target || !target.active) {
        proj.active = false;
        continue;
      }

      const dx = target.x - proj.x;
      const dy = target.y - proj.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < proj.speed) {
        // Hit
        target.takeDamage(proj.damage);
        proj.active = false;
        
        // Reward Focus on Kill
        if (!target.active) {
            // Need access to store here. 
            // Better practice: EntityManager emits event, Game listens.
            // For hackathon speed: direct import
            const { useGameStore } = require('./GameState');
            useGameStore.getState().modifyFocus(5);
        }
      } else {
        proj.x += (dx / dist) * proj.speed;
        proj.y += (dy / dist) * proj.speed;
      }
    }
  }

  private findTarget(tower: Tower): Enemy | null {
    let closest: Enemy | null = null;
    let minParams = Infinity;
    
    const towerX = tower.x * 40 + 20;
    const towerY = tower.y * 40 + 20;

    for (const enemy of this.enemies) {
      const dx = enemy.x - towerX;
      const dy = enemy.y - towerY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist <= tower.range) {
        if (dist < minParams) {
          minParams = dist;
          closest = enemy;
        }
      }
    }
    return closest;
  }
}
