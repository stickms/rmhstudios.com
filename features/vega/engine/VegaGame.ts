/**
 * Project Vega's canvas host: runs a `Simulation` in real time, draws it with `Renderer`, turns pointer and
 * keyboard input into actions, and publishes snapshots to the UI store (`GameState`).
 *
 * Input:
 *   pointer  - with an instrument chosen, a click places it (a touch shows the ghost first; a second tap on the
 *              same bench confirms); on an instrument, selects it; elsewhere, clears the selection.
 *   keyboard - arrows move the board cursor, Enter acts on the cursor cell like a click, 1-8 choose an
 *              instrument, Space starts (or calls) a wave, U upgrades, Delete sells, T cycles targeting,
 *              F toggles 2x, Esc cancels or pauses.
 */
import { readJson, writeJson } from '@/lib/core/persist';
import { BOARD, TOWER_ORDER, TOWERS, type EnemyType, type MapId, type TargetMode, type TowerType } from './data';
import type { Tower } from './Entities';
import { useGameStore, type HudSnapshot, type SelectedSnapshot } from './GameState';
import { Renderer, type Cursor } from './Renderer';
import { Simulation, type RunSave, type SimEvent } from './Simulation';
import { TimeManager } from './TimeManager';
import { vegaAchievementsFor } from './achievements';
import type { EndResult } from './GameState';

export type SfxName =
  | 'place'
  | 'upgrade'
  | 'sell'
  | 'error'
  | 'wave'
  | 'boss'
  | 'clear'
  | 'leak'
  | 'kill'
  | 'fire'
  | 'victory'
  | 'over';

export interface VegaGameOptions {
  map: MapId;
  seed: number;
  save?: RunSave | null;
  /** The element whose box the board fits into (defaults to the canvas's parent). */
  container?: HTMLElement | null;
  /** Ambient motion off (Globe motion: Still). */
  still: () => boolean;
  sfx: (name: SfxName) => void;
  onEnd: (result: EndResult) => void;
  onSave: (save: RunSave | null) => void;
}

const SEEN_KEY = 'rmh:vega:catalogued';
const TARGET_MODES: TargetMode[] = ['first', 'strong', 'last'];

export function readCatalogued(): EnemyType[] {
  return readJson<EnemyType[]>(SEEN_KEY, [], { validate: (v) => (Array.isArray(v) ? (v as EnemyType[]) : undefined) });
}

export class VegaGame {
  public readonly sim: Simulation;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: Renderer;
  private time: TimeManager;
  private opts: VegaGameOptions;
  private resizeObserver: ResizeObserver | null = null;
  private animationId = 0;
  private lastFrame = 0;
  private clock = 0;
  private publishTimer = 0;
  private ended = false;
  private killSfxBudget = 0;
  private fireSfxBudget = 0;

  private hover: { cx: number; cy: number } | null = null;
  private keyCursor: { cx: number; cy: number } | null = null;
  private pendingTouch: { cx: number; cy: number } | null = null;
  private selectedId: number | null = null;
  private seen: Set<EnemyType>;

  constructor(canvas: HTMLCanvasElement, opts: VegaGameOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.opts = opts;
    this.sim = opts.save ? Simulation.restore(opts.save) : new Simulation(opts.map, opts.seed);
    this.time = new TimeManager(opts.save?.elapsedMs ?? 0);
    this.renderer = new Renderer(this.ctx);
    this.seen = new Set(readCatalogued());

    this.handleResize();
    const box = this.container();
    if (typeof ResizeObserver !== 'undefined' && box) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(box);
    }
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKeyDown);
    // Canvas text uses the game's faces; redraw the cached backdrop once they arrive.
    document.fonts?.ready.then(() => this.renderer.invalidate()).catch(() => {});

    if (opts.save) useGameStore.getState().pushLog({ kind: 'resumed', wave: this.sim.wave });
    this.checkDossier();
    this.publish();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  public start() {
    if (this.animationId) return;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  public destroy() {
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private frame(now: number) {
    const delta = now - this.lastFrame;
    this.lastFrame = now;
    const store = useGameStore.getState();
    this.time.paused = store.paused || store.manualOpen;
    const steps = this.time.frame(delta, this.sim.phase === 'wave');
    for (let i = 0; i < steps; i++) this.sim.step();
    const events = this.sim.drain();
    const dt = this.time.paused ? 0 : Math.min(delta, 100) / 1000;
    this.clock += dt;
    this.killSfxBudget = Math.min(4, this.killSfxBudget + dt * 8);
    this.fireSfxBudget = Math.min(3, this.fireSfxBudget + dt * 6);
    if (events.length) this.handleEvents(events);
    this.renderer.update(dt);
    this.draw();
    this.publishTimer -= delta;
    if (this.publishTimer <= 0 || events.length) this.publish();
  }

  private draw() {
    const store = useGameStore.getState();
    let cursor: Cursor | null = null;
    const at = this.keyCursor ?? this.pendingTouch ?? this.hover;
    if (at) {
      const build = store.build;
      cursor = {
        cx: at.cx,
        cy: at.cy,
        build,
        valid: build ? this.sim.grid.canBuild(at.cx, at.cy) && this.sim.serum >= TOWERS[build].tiers[0].cost : true,
        keyboard: !!this.keyCursor,
      };
    }
    this.renderer.draw(this.sim, this.clock, { cursor, selected: this.selectedTower(), still: this.opts.still() });
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  private handleEvents(events: SimEvent[]) {
    const store = useGameStore.getState();
    this.renderer.ingest(events, this.opts.still());
    for (const e of events) {
      switch (e.t) {
        case 'waveStart':
          store.pushLog({ kind: e.boss ? 'boss' : e.early ? 'waveEarly' : 'waveStart', wave: e.wave, enemy: e.boss ?? undefined });
          this.opts.sfx(e.boss ? 'boss' : 'wave');
          store.tutorialEvent({ type: 'waveStart' });
          store.setDossier(null);
          break;
        case 'waveClear':
          store.pushLog({ kind: e.perfect ? 'perfect' : 'waveClear', wave: e.wave, amount: e.serum + e.income });
          this.opts.sfx('clear');
          store.tutorialEvent({ type: 'waveClear' });
          break;
        case 'leak':
          store.pushLog({ kind: 'leak', amount: e.amount, enemy: e.enemy });
          this.opts.sfx('leak');
          break;
        case 'kill':
          if (this.killSfxBudget >= 1 || e.boss) {
            this.killSfxBudget -= 1;
            this.opts.sfx('kill');
          }
          break;
        case 'fire':
          if (this.fireSfxBudget >= 1 && (e.tower === 'LOBOTOMIZER' || e.tower === 'DEFIBRILLATOR')) {
            this.fireSfxBudget -= 1;
            this.opts.sfx('fire');
          }
          break;
        case 'sever':
          store.pushLog({ kind: 'sever' });
          break;
        case 'victory':
          store.pushLog({ kind: 'victory' });
          store.setVictoryOpen(true);
          this.opts.sfx('victory');
          break;
        case 'over':
          this.finish(e.complete);
          break;
        default:
          break;
      }
    }
    if (this.sim.phase === 'build' && events.some((e) => e.t === 'waveClear')) {
      this.opts.onSave(this.sim.save(this.time.elapsedMs));
      this.checkDossier();
    }
  }

  /** Before a wave that catalogues a specimen the player has never met, show its dossier. */
  private checkDossier() {
    if (this.sim.phase !== 'build') return;
    const fresh = this.sim.nextPlan().introduces.filter((t) => !this.seen.has(t));
    if (!fresh.length) return;
    const store = useGameStore.getState();
    store.setDossier(fresh[0]!);
    for (const t of fresh) {
      this.seen.add(t);
      store.pushLog({ kind: 'catalogued', enemy: t });
    }
    writeJson(SEEN_KEY, [...this.seen]);
  }

  private finish(complete: boolean) {
    if (this.ended) return;
    this.ended = true;
    const s = this.sim;
    const result: EndResult = {
      map: s.mapId,
      score: s.score,
      cleared: s.cleared,
      complete,
      contained: s.victoryShown,
      stats: { ...s.stats, typesBuilt: [...s.stats.typesBuilt] },
      durationMs: Math.round(this.time.elapsedMs),
      achievements: vegaAchievementsFor({
        map: s.mapId,
        cleared: s.cleared,
        integrityLost: s.stats.integrityLost,
        typesBuilt: s.stats.typesBuilt,
        maxTier: s.stats.maxTier,
        earlyCalls: s.stats.earlyCalls,
        bossesKilled: s.stats.bossesKilled,
        biobankIncome: s.stats.biobankIncome,
      }),
    };
    this.opts.sfx(complete ? 'victory' : 'over');
    this.opts.onSave(null);
    this.opts.onEnd(result);
  }

  /** Give up the run from the pause menu: it ends as a loss with whatever was cleared. */
  public abandon() {
    this.finish(false);
  }

  // ── Publishing ─────────────────────────────────────────────────────────────

  private publish() {
    this.publishTimer = 100;
    const s = this.sim;
    const store = useGameStore.getState();
    const plan = s.nextPlan();
    const counts = new Map<EnemyType, number>();
    for (const sp of plan.spawns) counts.set(sp.type, (counts.get(sp.type) ?? 0) + 1);
    const hud: HudSnapshot = {
      phase: s.phase,
      wave: s.wave,
      cleared: s.cleared,
      serum: Math.floor(s.serum),
      integrity: Math.max(0, s.integrity),
      score: s.score,
      canStart: s.canStartWave(),
      speed: this.time.speed,
      next: [...counts].map(([type, count]) => ({ type, count })),
      nextBoss: plan.boss,
      introduces: plan.introduces,
    };
    const prev = store.hud;
    if (
      prev.phase !== hud.phase ||
      prev.wave !== hud.wave ||
      prev.serum !== hud.serum ||
      prev.integrity !== hud.integrity ||
      prev.score !== hud.score ||
      prev.canStart !== hud.canStart ||
      prev.speed !== hud.speed ||
      prev.cleared !== hud.cleared
    ) {
      store.setHud(hud);
    }
    const t = this.selectedTower();
    if (!t) {
      if (store.selected) store.setSelected(null);
      this.selectedId = null;
    } else {
      const snap: SelectedSnapshot = {
        id: t.id,
        type: t.type,
        tier: t.tier,
        mode: t.targetMode,
        kills: t.kills,
        damage: Math.round(t.damageDealt),
        sell: t.getSellValue(),
        upgradeCost: t.upgradeCost(),
        stunned: t.stunTimer > 0,
      };
      const p = store.selected;
      if (!p || p.id !== snap.id || p.tier !== snap.tier || p.mode !== snap.mode || p.kills !== snap.kills || p.damage !== snap.damage || p.stunned !== snap.stunned) {
        useGameStore.setState({ selected: snap });
      }
    }
  }

  private selectedTower(): Tower | null {
    if (this.selectedId === null) return null;
    return this.sim.entities.towers.find((t) => t.id === this.selectedId) ?? null;
  }

  // ── Actions (called by the UI too) ─────────────────────────────────────────

  public chooseBuild(type: TowerType | null) {
    const store = useGameStore.getState();
    this.pendingTouch = null;
    if (type) {
      this.selectedId = null;
      store.tutorialEvent({ type: 'select' });
    }
    store.setBuild(type);
    this.publish();
  }

  public select(tower: Tower | null) {
    this.selectedId = tower ? tower.id : null;
    useGameStore.getState().setBuild(null);
    this.publish();
  }

  private actOnCell(cx: number, cy: number) {
    const store = useGameStore.getState();
    const existing = this.sim.entities.getTowerAt(cx, cy);
    if (existing) {
      this.select(existing);
      return;
    }
    const build = store.build;
    if (!build) {
      this.select(null);
      return;
    }
    const r = this.sim.place(build, cx, cy);
    if (r.ok) {
      this.opts.sfx('place');
      store.tutorialEvent({ type: 'placed' });
      // Keep the instrument chosen while the player can afford another (shift-like repeat building).
      if (this.sim.serum < TOWERS[build].tiers[0].cost) store.setBuild(null);
    } else {
      this.opts.sfx('error');
      store.pushLog({ kind: r.reason === 'funds' ? 'funds' : 'blocked' });
    }
    this.publish();
  }

  public upgradeSelected() {
    const t = this.selectedTower();
    if (!t) return;
    const r = this.sim.upgrade(t);
    if (r.ok) {
      this.opts.sfx('upgrade');
      useGameStore.getState().tutorialEvent({ type: 'upgraded' });
    } else {
      this.opts.sfx('error');
      if (r.reason === 'funds') useGameStore.getState().pushLog({ kind: 'funds' });
    }
    this.publish();
  }

  public sellSelected() {
    const t = this.selectedTower();
    if (!t) return;
    if (this.sim.sell(t).ok) this.opts.sfx('sell');
    this.selectedId = null;
    this.publish();
  }

  public setTargetMode(mode: TargetMode) {
    const t = this.selectedTower();
    if (!t) return;
    this.sim.setTargetMode(t, mode);
    this.publish();
  }

  public cycleTargetMode() {
    const t = this.selectedTower();
    if (!t || !t.def.kind || t.def.attack === 'aura') return;
    this.setTargetMode(TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length]!);
  }

  public startWave() {
    if (this.sim.startWave()) this.publish();
  }

  public toggleSpeed() {
    this.time.toggleSpeed();
    this.publish();
  }

  public continueOvertime() {
    this.sim.continueOvertime();
    useGameStore.getState().setVictoryOpen(false);
    this.publish();
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private cellFromEvent(e: PointerEvent): { cx: number; cy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((e.clientX - rect.left) / rect.width) * BOARD.WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD.HEIGHT;
    if (x < 0 || y < 0 || x >= BOARD.WIDTH || y >= BOARD.HEIGHT) return null;
    const c = this.sim.grid.getCellFromScreen(x, y);
    return { cx: c.x, cy: c.y };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = this.cellFromEvent(e);
    if (!cell) return;
    this.keyCursor = null;
    const store = useGameStore.getState();
    if (store.paused) return;
    // Touch with an instrument chosen: the first tap previews, a second tap on the same bench places.
    if (e.pointerType !== 'mouse' && store.build && !this.sim.entities.getTowerAt(cell.cx, cell.cy)) {
      if (!this.pendingTouch || this.pendingTouch.cx !== cell.cx || this.pendingTouch.cy !== cell.cy) {
        this.pendingTouch = cell;
        return;
      }
    }
    this.pendingTouch = null;
    this.actOnCell(cell.cx, cell.cy);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    this.hover = this.cellFromEvent(e);
  };

  private onPointerLeave = () => {
    this.hover = null;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const store = useGameStore.getState();
    if (store.screen !== 'play' || store.manualOpen || store.victoryOpen) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
    const onControl = tag === 'BUTTON' || tag === 'A' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (store.build || this.selectedId !== null || this.keyCursor) {
        this.chooseBuild(null);
        this.select(null);
        this.keyCursor = null;
      } else {
        store.setPaused(!store.paused);
      }
      e.preventDefault();
      return;
    }
    if (store.paused) return;
    const digit = Number.parseInt(e.key, 10);
    if (digit >= 1 && digit <= TOWER_ORDER.length) {
      const type = TOWER_ORDER[digit - 1]!;
      this.chooseBuild(store.build === type ? null : type);
      if (!this.keyCursor) this.keyCursor = this.firstFreeBench();
      e.preventDefault();
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const move = arrows[e.key];
    if (move && !onControl) {
      const from = this.keyCursor ?? this.firstFreeBench();
      this.keyCursor = {
        cx: Math.max(0, Math.min(BOARD.COLS - 1, from.cx + move[0])),
        cy: Math.max(0, Math.min(BOARD.ROWS - 1, from.cy + move[1])),
      };
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && this.keyCursor && !onControl) {
      this.actOnCell(this.keyCursor.cx, this.keyCursor.cy);
      e.preventDefault();
      return;
    }
    if (onControl) return;
    switch (e.key) {
      case ' ':
        this.startWave();
        e.preventDefault();
        break;
      case 'u':
      case 'U':
        this.upgradeSelected();
        break;
      case 'Delete':
      case 'Backspace':
        this.sellSelected();
        break;
      case 't':
      case 'T':
        this.cycleTargetMode();
        break;
      case 'f':
      case 'F':
        this.toggleSpeed();
        break;
      default:
        break;
    }
  };

  private firstFreeBench(): { cx: number; cy: number } {
    const b = this.sim.grid.benches().find((c) => this.sim.grid.canBuild(c.x, c.y)) ?? { x: 0, y: 0 };
    return { cx: b.x, cy: b.y };
  }

  /** Put the keyboard cursor on the board (the canvas took focus from the keyboard). */
  public focusCursor() {
    if (!this.keyCursor) this.keyCursor = this.firstFreeBench();
  }

  // ── Sizing ─────────────────────────────────────────────────────────────────

  private container(): HTMLElement | null {
    return this.opts.container ?? this.canvas.parentElement;
  }

  private handleResize() {
    const container = this.container();
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.min(cw / BOARD.WIDTH, ch / BOARD.HEIGHT);
    const w = Math.floor(BOARD.WIDTH * scale);
    const h = Math.floor(BOARD.HEIGHT * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    this.draw();
  }

  /** The suggested bench for the tutorial: the free bench with the most corridor in a Synapse's reach. */
  public suggestedBench(): { cx: number; cy: number } {
    let best = { cx: 0, cy: 0 };
    let score = -1;
    for (const c of this.sim.grid.benches()) {
      if (!this.sim.grid.canBuild(c.x, c.y)) continue;
      const v = this.sim.grid.coverage(c.x, c.y, TOWERS.SYNAPSE.tiers[0].range);
      if (v > score) {
        score = v;
        best = { cx: c.x, cy: c.y };
      }
    }
    return best;
  }
}
