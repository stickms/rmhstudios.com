import { EntityManager } from './EntityManager';
import { Enemy, EnemyType, Point } from './Entities';

export class WaveManager {
  private entityManager: EntityManager;
  private pathStart: Point;
  private startTime: number = 0;
  private waveDuration: number = 60000; // 60s per loop?
  private hasStarted: boolean = false;
  
  private lastSpawnTime: number = 0;

  constructor(entityManager: EntityManager, pathStart: Point) {
    this.entityManager = entityManager;
    this.pathStart = pathStart;
  }
  
  public start() {
    this.hasStarted = true;
    this.startTime = Date.now();
  }
  
  public stop() {
    this.hasStarted = false;
  }

  public update(timestamp: number) {
    if (!this.hasStarted) return;
    
    const now = Date.now();
    // Simple spawn logic for now: Spawn every 2 seconds
    if (now - this.lastSpawnTime > 2000) {
        this.spawnEnemy('ANXIETY');
        this.lastSpawnTime = now;
    }
  }

  private spawnEnemy(type: EnemyType) {
    const enemy = new Enemy(type, this.pathStart);
    // Add randomness to start to prevent stacking perfectly
    enemy.x += (Math.random() - 0.5) * 10;
    enemy.y += (Math.random() - 0.5) * 10;
    
    this.entityManager.addEnemy(enemy);
  }
}
