import { useGameStore } from './GameState';
import { EntityManager } from './EntityManager';
import { Enemy, EnemyType, Point } from './Entities';

export class WaveManager {
  private entityManager: EntityManager;
  private pathStart: Point;
  private startTime: number = 0;
  private hasStarted: boolean = false;
  
  private lastSpawnTime: number = 0;

  constructor(entityManager: EntityManager, pathStart: Point) {
    this.entityManager = entityManager;
    this.pathStart = pathStart;
  }
  
  public start() {
    this.hasStarted = true;
    this.startTime = Date.now();
    this.lastSpawnTime = Date.now();
  }
  
  public stop() {
    this.hasStarted = false;
  }

  public update(timestamp: number) {
    if (!this.hasStarted) return;
    
    const now = Date.now();
    const elapsed = now - this.startTime;
    const state = useGameStore.getState();
    
    // Difficulty Scaling based on Level/Loop
    const difficultyMultiplier = Math.pow(0.9, state.level - 1); // 1.0, 0.9, 0.81... (Lower is harder/faster)
    
    let spawnInterval = 1000; // Base: 1 sec
    let enemyType: EnemyType = 'ANXIETY';

    // Wave Logic
    if (elapsed < 15000) {
        // 0-15s: Warmup
        spawnInterval = 1000;
    } else if (elapsed < 30000) {
        // 15-30s: Ramp up
        spawnInterval = 800;
        if (Math.random() > 0.9) enemyType = 'GUILT'; // Sprinkling small swarms
    } else if (elapsed < 45000) {
        // 30-45s: Heavy hit
        spawnInterval = 600;
        if (Math.random() > 0.7) enemyType = 'DEPRESSION';
        if (Math.random() > 0.8) enemyType = 'DOUBT'; // Shielded tank
    } else {
        // 45s+: Rush
        spawnInterval = 400;
        const roll = Math.random();
        if (roll > 0.9) enemyType = 'MANIC';
        else if (roll > 0.7) enemyType = 'DOUBT';
        else if (roll > 0.5) enemyType = 'DEPRESSION';
        else if (roll > 0.3) enemyType = 'GUILT';
    }
    
    // Apply Difficulty
    spawnInterval *= difficultyMultiplier;

    if (now - this.lastSpawnTime > spawnInterval) {
        this.spawnEnemy(enemyType);
        this.lastSpawnTime = now;
    }
  }

  private spawnEnemy(type: EnemyType) {
    const enemy = new Enemy(type, this.pathStart);
    // Add randomness to start to prevent stacking perfectly
    enemy.x += (Math.random() - 0.5) * 5;
    enemy.y += (Math.random() - 0.5) * 5;
    
    this.entityManager.addEnemy(enemy);
  }
}
