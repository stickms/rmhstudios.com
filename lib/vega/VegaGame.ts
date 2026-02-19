import { TimeManager, GameAction } from './TimeManager';
import { useGameStore } from './GameState';
import { GridManager } from './GridManager';
import { Renderer } from './Renderer';
import { EntityManager } from './EntityManager';
import { WaveManager } from './WaveManager';
import { Tower, TowerType } from './Entities';

export class VegaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private timeManager: TimeManager;
  private gridManager: GridManager;
  private renderer: Renderer;
  private entityManager: EntityManager;
  private waveManager: WaveManager;
  private resizeObserver: ResizeObserver;
  
  private animationId: number = 0;
  private lastTime: number = 0;
  private gameTime: number = 0; // Track game time for replay window
  private shakeDuration: number = 0;
  
  // Logical Resolution
  private readonly LOGICAL_WIDTH = 1200;
  private readonly LOGICAL_HEIGHT = 800;
  private scaleFactor: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    this.timeManager = new TimeManager();
    this.gridManager = new GridManager();
    this.renderer = new Renderer(this.ctx, this.LOGICAL_WIDTH, this.LOGICAL_HEIGHT);
    this.entityManager = new EntityManager();
    
    // Initial resize to set up scaling (Now safe to call draw)
    this.handleResize();
    
    // Wave Manager needs path start
    const path = this.gridManager.getPath();
    const startCell = path.length > 0 ? path[0] : {x:0, y:0};
    
    this.waveManager = new WaveManager(this.entityManager, {
        x: startCell.x * this.gridManager.cellSize + this.gridManager.cellSize/2,
        y: startCell.y * this.gridManager.cellSize + this.gridManager.cellSize/2
    });
    
    // Interactions
    // Use ResizeObserver for more robust sizing
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
    }
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', () => this.handleResize());
    this.canvas.addEventListener('mousedown', (e) => this.handleInput(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
  }
  
  private lastMousePos: {x: number, y: number} | null = null;
  
  private handleMouseMove(e: MouseEvent) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.lastMousePos = { x: mouseX / this.scaleFactor, y: mouseY / this.scaleFactor };
  }

  private handleResize() {
    // Get parent container dimensions (or window)
    const container = this.canvas.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate scale to fit while maintaining aspect ratio
    const scaleX = containerWidth / this.LOGICAL_WIDTH;
    const scaleY = containerHeight / this.LOGICAL_HEIGHT;
    this.scaleFactor = Math.min(scaleX, scaleY);
    
    // Calculate centered offsets
    const displayWidth = this.LOGICAL_WIDTH * this.scaleFactor;
    const displayHeight = this.LOGICAL_HEIGHT * this.scaleFactor;
    
    this.offsetX = (containerWidth - displayWidth) / 2;
    this.offsetY = (containerHeight - displayHeight) / 2;
    
    // Set actual canvas size (resolution) to match display size for crispness
    // or keep it logical and scale context? 
    // Better: Set internal resolution to Logical * DPR, display size via CSS.
    // BUT for pixel art games, usually best to render small and scale up via CSS.
    // Here we want HD vectors/glitch effects, so let's render at high res.
    
    // Set actual canvas size (resolution) to match display size for crispness
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = displayWidth * dpr;
    this.canvas.height = displayHeight * dpr;

    // Set CSS size to match calculated display size (prevents stretching)
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    
    // Scale Context to match Logical Coordinates
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
    this.ctx.scale(dpr * this.scaleFactor, dpr * this.scaleFactor);
    
    // Force redraw
    if (!this.animationId) this.draw();
  }
  
  private handleInput(e: MouseEvent) {
    // Check if transitioning or paused
    const state = useGameStore.getState();
    if (state.isTransitioning) return;

    const rect = this.canvas.getBoundingClientRect();
    
    // Mouse relative to Canvas Element
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert to Logical Coordinates
    const logicalX = mouseX / this.scaleFactor;
    const logicalY = mouseY / this.scaleFactor;
    
    const cell = this.gridManager.getCellFromScreen(logicalX, logicalY);
    
    // 1. Check for existing tower (Selection or Paradox)
    const existingTower = this.entityManager.getTowerAt(cell.x, cell.y);
    
    if (existingTower) {
        // PARADOX CHECK: Placing a tower on a Ghost
        if (state.selectedTower && existingTower.isGhost && !existingTower.isParadox) {
            // Check costs
             const { TOWER_COSTS } = require('./GameState');
             const cost = TOWER_COSTS[state.selectedTower];
             
             if (state.focus < cost) {
                 state.addLog('INSUFFICIENT FOCUS FOR PARADOX MERGE', 'warning');
                 return;
             }

             // Execute Merge
             this.createParadoxTower(existingTower, state.selectedTower);
             state.modifyFocus(-cost);
             state.setSelectedTower(null); // Clear selection
             return;
        }

        state.setSelectedEntity(existingTower);
        state.addLog(`SELECTED: ${existingTower.type}`, 'info');
        console.log('Selected tower:', existingTower);
        return;
    }
    
    // ... rest of placement logic ...
    
    // 2. If no tower and clicking empty space while having a selection, deselect?
    if (state.selectedEntity) {
        state.setSelectedEntity(null);
        return; 
    }

    // Economy Check
    if (!state.selectedTower) return; // No tower selected to place

    const { TOWER_COSTS } = require('./GameState'); // Dynamic import to avoid cycles if any
    const cost = TOWER_COSTS[state.selectedTower];
    
    if (state.focus < cost) {
        state.addLog('INSUFFICIENT FOCUS', 'warning');
        return;
    }
    
    // Attempt to place tower
    console.log(`Attempting to place tower at ${cell.x},${cell.y}`);
    if (this.gridManager.placeTower(cell.x, cell.y)) {
      state.modifyFocus(-cost);
      state.addLog(`DEPLOYED: ${state.selectedTower}`, 'success');
      
      const tower = new Tower(cell.x, cell.y, state.selectedTower);
      tower.totalInvested = cost; // Set initial investment
      
      this.entityManager.addTower(tower);
      console.log(`Tower placed. Total towers: ${this.entityManager.towers.length}`);
      this.timeManager.recordAction('PLACE_TOWER', { x: cell.x, y: cell.y, type: state.selectedTower }, state.currentLoop);
      
      // Clear selection after placement (QOL)
      state.setSelectedTower(null);
    } else {
        console.log('Placement failed');
        state.addLog('PLACEMENT BLOCKED', 'error');
    }
  }

  private createParadoxTower(ghost: Tower, newType: TowerType) {
      const state = useGameStore.getState();
      
      // Upgrade Ghost to Paradox status
      ghost.isGhost = false; // It becomes real/anchored
      ghost.isParadox = true;
      ghost.type = newType; // Take the form of the new tower (or maybe a hybrid?) - Let's use new type but boosted
      
      // Paradox Buffs (2x Stats)
      ghost.damage *= 2;
      ghost.fireRate *= 0.8; // Faster
      ghost.range *= 1.25;
      
      // Visual Feedback
      state.addLog('PARADOX DETECTED: TIMELINE MERGED', 'warning');
      
      // Screen Shake
      this.shakeDuration = 500; // 500ms shake
  }
  
  public sellTower(tower: Tower) {
      const state = useGameStore.getState();
      // Handle potential prototype loss (safeguard)
      const refund = typeof tower.getSellValue === 'function' 
        ? tower.getSellValue() 
        : Math.floor((tower.totalInvested || 0) * 0.7);
      
      // Remove from Entity Manager
      this.entityManager.towers = this.entityManager.towers.filter(t => t !== tower);
      
      // Remove from Grid
      this.gridManager.removeTower(tower.x, tower.y);
      
      // Refund Focus
      state.modifyFocus(refund);
      state.addLog(`SOLD TOWER (+${refund}F)`, 'info');
      
      // Deselect
      state.setSelectedEntity(null);
  }

  public start() {
    if (this.animationId) return;
    
    useGameStore.getState().setRunning(true);
    useGameStore.getState().addLog('SIMULATION STARTED', 'info');
    
    this.timeManager.startLoop(useGameStore.getState().currentLoop);
    this.waveManager.start();
    
    this.lastTime = performance.now();
    this.gameTime = 0;
    this.loop(this.lastTime);
  }

  public stop() {
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
    this.timeManager.stopLoop();
    this.waveManager.stop();
    useGameStore.getState().setRunning(false);
  }
  
  public async advanceLevel() {
    this.stop();
    
    const state = useGameStore.getState();
    const cost = 250 * state.level; // Lowered from 1000 for faster pacing
    
    if (state.focus < cost) {
        state.addLog(`INSUFFICIENT FOCUS FOR RECALL (REQ: ${cost})`, 'error');
        this.start(); // Resume
        return;
    }
    
    state.setTransitioning(true);
    state.addLog('INITIATING MEMORY RECALL...', 'warning');
    state.modifyFocus(-cost); // Deduct cost? Or maybe reset focus to 100?
    // Plan said: "Reset Focus to starting amount". Let's do that for balance.
    
    // Delayed Restart
    setTimeout(() => {
        // 1. Find MVP Tower
        let mvpTower: Tower | null = null;
        let maxDamage = -1;
        
        for (const t of this.entityManager.towers) {
            if (t.damageDealt > maxDamage && !t.isGhost) {
                maxDamage = t.damageDealt;
                mvpTower = t;
            }
        }
        
        // 2. Clear Game
        this.entityManager = new EntityManager();
        this.gridManager = new GridManager();
        this.timeManager = new TimeManager(); // Clear recording? Yes, we only keep the MVP Ghost.
        
        // 3. Level Up & Unlock
        state.setLevel(state.level + 1);
        
        const { TOWER_UNLOCK_ORDER } = require('./GameState');
        if (state.level <= TOWER_UNLOCK_ORDER.length) {
            const newTower = TOWER_UNLOCK_ORDER[state.level - 1]; // level is now 2, index 1
            if (newTower && !state.unlockedTowers.includes(newTower)) {
                state.unlockTower(newTower);
                state.addLog(`UNLOCKED: ${newTower}`, 'success');
            }
        }
        
        // 4. Reset Resources
        useGameStore.getState().modifyFocus(-state.focus + 100); // Reset to 100
        
        // 5. Add MVP Ghost
        if (mvpTower) {
            const ghost = new Tower(mvpTower.x, mvpTower.y, mvpTower.type);
            ghost.isGhost = true;
            ghost.damageDealt = mvpTower.damageDealt; // Keep stats?
            // Apply upgrades?
            ghost.upgrades = { ...mvpTower.upgrades };
            ghost.damage = mvpTower.damage;
            ghost.range = mvpTower.range;
            ghost.fireRate = mvpTower.fireRate;
            
            this.entityManager.addTower(ghost);
            this.gridManager.placeTower(ghost.x, ghost.y); // Mark occupied
            state.addLog(`MEMORY PRESERVED: ${ghost.type}`, 'info');
        }
        
        // 6. Difficulty Scaling (WaveManager needs to know level)
        // Passed via GameState currentLoop/level
        
        // Re-init WaveManager
        const path = this.gridManager.getPath();
        const startCell = path.length > 0 ? path[0] : {x:0, y:0};
        this.waveManager = new WaveManager(this.entityManager, {
            x: startCell.x * this.gridManager.cellSize + this.gridManager.cellSize/2,
            y: startCell.y * this.gridManager.cellSize + this.gridManager.cellSize/2
        });
    
        state.setTransitioning(false);
        state.addLog(`LEVEL ${state.level} STARTED`, 'success');
        
        this.start();
    }, 2000);
  }

  private loop(timestamp: number) {
    const state = useGameStore.getState();
    if (state.isPaused) {
        this.draw(); // Keep drawing UI/freeze frame
        this.animationId = requestAnimationFrame((t) => this.loop(t));
        return;
    }

    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    
    this.update(deltaTime);
    this.draw();
    
    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }

  private update(deltaTime: number) {
    // Skip Ghost Replay logic (removed in this iteration favor of MVP Ghost) 

    // Update Wave (Spawning)
    this.waveManager.update(deltaTime);
    
    // Update Entities (Movement, Combat)
    this.entityManager.update(deltaTime, this.gridManager.getPath(), this.gridManager.cellSize);

    // Screen Shake Logic
    if (this.shakeDuration > 0) {
        const intensity = 5;
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        this.canvas.style.transform = `translate(${x}px, ${y}px)`;
        this.shakeDuration -= deltaTime;
    } else {
        this.canvas.style.transform = 'none';
    }
  }

  private draw() {
    // 1. Clear Screen
    this.renderer.clear();
    
    // 2. Draw Grid
    this.renderer.drawGrid(this.gridManager.cols, this.gridManager.rows, this.gridManager.cellSize);
    
    // 3. Draw Path
    const path = this.gridManager.getPath();
    this.renderer.drawGridPath(path, this.gridManager.cellSize);
    
    // 4. Draw Entities
    for (const tower of this.entityManager.towers) {
      // Chance to glitch
      const isGlitching = Math.random() > 0.95;
      this.renderer.drawTower(tower, this.gridManager.cellSize, isGlitching);
    }
    
    for (const enemy of this.entityManager.enemies) {
      this.renderer.drawEnemy(enemy);
    }
    
    for (const proj of this.entityManager.projectiles) {
      this.renderer.drawProjectile(proj);
    }
    
    // 6. Draw UI / Ranges
    const state = useGameStore.getState();
    
    // Priority 1: Selected Tower (Persistent)
    if (state.selectedEntity && state.selectedEntity instanceof Tower) {
        this.renderer.drawRange(state.selectedEntity.x, state.selectedEntity.y, state.selectedEntity.range, 'rgba(255, 255, 255, 0.15)');
    }
    
    // Priority 2: Hovered Tower (Transient)
    // Only if we have mouse position
    if (this.lastMousePos) {
        const cell = this.gridManager.getCellFromScreen(this.lastMousePos.x, this.lastMousePos.y);
        
        // Check if there is a tower at this cell
        const hoveredTower = this.entityManager.getTowerAt(cell.x, cell.y);
        
        if (hoveredTower) {
             // Draw range for hovered tower (if not already selected)
             if (hoveredTower !== state.selectedEntity) {
                 this.renderer.drawRange(hoveredTower.x, hoveredTower.y, hoveredTower.range, 'rgba(255, 255, 255, 0.1)');
             }
        } else if (state.selectedTower) {
             // Priority 3: Placement Preview (only if no tower hovered AND we have a tower selected to place)
             let range = 100;
             switch(state.selectedTower) {
                 case 'SYNAPSE': range = 150; break;
                 case 'SUPPRESSOR': range = 100; break;
                 case 'LOBOTOMIZER': range = 400; break;
                 case 'ECHO': range = 100; break;
             }
             this.renderer.drawRange(cell.x, cell.y, range, 'rgba(56, 189, 248, 0.1)'); // Blue-ish for placement
        }
    }
  }

  public destroy() {
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', () => this.handleResize());
  }
}
