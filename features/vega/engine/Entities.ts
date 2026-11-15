export interface Point {
  x: number;
  y: number;
}

export type EnemyType = 'ANXIETY' | 'DEPRESSION' | 'MANIC' | 'DOUBT' | 'GUILT';
export type TowerType = 'SYNAPSE' | 'SUPPRESSOR' | 'LOBOTOMIZER' | 'ECHO';

export class Entity {
  public id: string;
  public x: number;
  public y: number;
  public active: boolean = true;

  constructor(x: number, y: number) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.x = x;
    this.y = y;
  }
}

export class Enemy extends Entity {
  public type: EnemyType;
  public health: number;
  public maxHealth: number;
  public speed: number;
  public pathIndex: number = 0;
  public progress: number = 0; // 0.0 to 1.0 between current path nodes
  
  // Special Properties
  public isShielded: boolean = false; // DOUBT mechanic

  constructor(type: EnemyType, pathStart: Point) {
    super(pathStart.x, pathStart.y);
    this.type = type;
    
    switch (type) {
      case 'ANXIETY':
        this.maxHealth = 20;
        this.speed = 3.0; // Fast
        break;
      case 'DEPRESSION':
        this.maxHealth = 200;
        this.speed = 0.5; // Slow
        break;
      case 'MANIC':
        this.maxHealth = 50;
        this.speed = 5.0; // Very fast
        break;
      case 'DOUBT':
        this.maxHealth = 100;
        this.speed = 1.5;
        this.isShielded = true; // Takes reduced damage
        break;
      case 'GUILT':
        this.maxHealth = 40;
        this.speed = 2.5; 
        break;
      default:
        this.maxHealth = 20;
        this.speed = 2.0;
    }
    this.health = this.maxHealth;
  }
  
  public takeDamage(amount: number) {
    if (this.isShielded) {
        amount *= 0.5; // 50% damage reduction
    }
    
    this.health -= amount;
    if (this.health <= 0) {
      this.active = false;
    }
  }
}

export class Tower extends Entity {
  public type: TowerType;
  public range: number;
  public damage: number;
  public fireRate: number; // Cooldown in ms
  public lastFireTime: number = 0;
  
  // Stats
  public damageDealt: number = 0;
  public totalInvested: number = 0;

  // Ghost Properties
  public isGhost: boolean = false;
  public isParadox: boolean = false;
  public loopOrigin: number = 1;

  // Upgrade State
  public upgrades: {
      damage: number;
      range: number;
      rate: number;
  } = { damage: 0, range: 0, rate: 0 };

  constructor(x: number, y: number, type: TowerType) {
    super(x, y);
    this.type = type;
    
    switch (type) {
      case 'SYNAPSE':
        this.range = 150;
        this.damage = 10;
        this.fireRate = 500;
        break;
      case 'SUPPRESSOR':
        this.range = 100;
        this.damage = 2;
        this.fireRate = 100;
        break;
      case 'LOBOTOMIZER':
        this.range = 400;
        this.damage = 100;
        this.fireRate = 2000;
        break;
      case 'ECHO':
        this.range = 100;
        this.damage = 0;
        this.fireRate = 0;
        break;
      default:
        this.range = 100;
        this.damage = 10;
        this.fireRate = 1000;
    }
  }

  public upgrade(stat: 'damage' | 'range' | 'rate') {
      this.upgrades[stat]++;
      
      // Apply Upgrade Logic based on Type and Stat
      if (stat === 'damage') {
          this.damage *= 1.5; // +50% Damage
      } else if (stat === 'range') {
          this.range *= 1.2; // +20% Range
      } else if (stat === 'rate') {
          this.fireRate *= 0.8; // -20% Cooldown (Faster)
      }
  }

  public getUpgradeCost(stat: 'damage' | 'range' | 'rate'): number {
      const level = this.upgrades[stat] + 1;
      // Base cost scales with level
      return 50 * level;
  }

  public getSellValue(): number {
    return Math.floor(this.totalInvested * 0.7);
  }
}

export class Projectile extends Entity {
  public targetId: string;
  public speed: number = 10;
  public damage: number;
  
  constructor(x: number, y: number, targetId: string, damage: number) {
    super(x, y);
    this.targetId = targetId;
    this.damage = damage;
  }
}
