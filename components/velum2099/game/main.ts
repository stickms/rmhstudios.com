// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Main Entry Point
   Orchestrates terminal → simulation →
   data collection flow
   ═══════════════════════════════════════════ */

import { Terminal } from './terminal/Terminal';
import { GameSettings } from './settings/GameSettings';
import { GameHud } from './ui/GameHud';
import { MobileControls } from './ui/MobileControls';
import { Minimap } from './ui/Minimap';

// Heavy simulation modules — lazy-loaded on first simulation start
let CyberpunkScene, Vehicle, Segmenter, DataCollector, Exporter, TextureManager, LiveStreamClient, LofiRadio, EngineSound, MissionManager, Weapon;
async function loadSimModules() {
    if (CyberpunkScene) return; // already loaded
    const [scene, vehicle, seg, dc, exp, tm, lsc, radio, engine, mission, weapon] = await Promise.all([
        import('./scene/CyberpunkScene'),
        import('./vehicle/Vehicle'),
        import('./segmentation/Segmenter'),
        import('./data/DataCollector'),
        import('./data/Exporter'),
        import('./textures/TextureManager'),
        import('./textures/LiveStreamClient'),
        import('./audio/LofiRadio'),
        import('./audio/EngineSound'),
        import('./gameplay/MissionManager'),
        import('./gameplay/Weapon'),
    ]);
    CyberpunkScene = scene.CyberpunkScene;
    Vehicle = vehicle.Vehicle;
    Segmenter = seg.Segmenter;
    DataCollector = dc.DataCollector;
    Exporter = exp.Exporter;
    TextureManager = tm.TextureManager;
    LiveStreamClient = lsc.LiveStreamClient;
    LofiRadio = radio.LofiRadio;
    EngineSound = engine.EngineSound;
    MissionManager = mission.MissionManager;
    Weapon = weapon.Weapon;
}

/* ── Scrolling Chinese text overlay ── */
const _SCROLL_PHRASES = [
    '神经网络同步中 ░░░░░░░░░░',
    '警告：未授权访问检测',
    '记忆碎片重组 ██████░░░░',
    '数据流加密传输中',
    '目标锁定 — 追踪协议启动',
    '城市基础设施扫描完成',
    '生体认证失败 — 重试中',
    '黑客入侵防御系统激活',
    '量子解密进度 47.3%',
    '虚拟现实界面校准',
    '信号干扰源定位中',
    '自动驾驶模块 v7.82 已加载',
    '街道监控网络接入',
    '义体改造数据同步',
    '电子战反制措施部署',
    '地下网络节点连接建立',
    '意识上传协议 — 待命',
    '区域封锁解除 — 通行许可',
    '合成记忆写入 ████████░░',
    '赛博空间坐标校正中',
    '隐形伪装场已激活',
    '全息投影系统正常运行',
    '深层网络扫描 — 无异常',
    '加速世界接口同步完成',
    '警告：第七区防火墙已被突破 — 所有单位立即切换至备用加密频道 — 重复 — 立即切换',
    '意识碎片回收程序运行中 ████████████░░░░ 回收率 73.2% — 预计剩余时间 00:04:17',
    '夜之城地下交通管制系统 v12.4 — 全部路段实时监控已启用 — 违规车辆自动标记',
    '检测到未注册义体信号 — 坐标：N34°07′ E118°21′ — 已通知执法单元 — 请勿移动',
    '合成记忆市场行情 ▲ 战斗经验 +12.4% ▼ 语言模块 -3.1% ■ 驾驶技能 持平',
    '全息广告投放中 — 赞助商：阿拉萨卡生体科技 — "超越人类，定义未来"',
    '紧急广播 ░░░ 第三区供电中断 ░░░ 预计恢复时间未知 ░░░ 请启用备用能源',
    '深层网络拍卖进行中 — 军用级神经接口 — 起拍价 ¥2,400,000 — 剩余时间 00:12:33',
    '城市AI管理核心状态报告 — CPU负载 94.7% — 内存占用 88.1% — 异常进程数 147',
    '量子通信卫星阵列校准完成 — 延迟降至 0.003ms — 加密等级提升至 OMEGA-9',
    '自动驾驶网络节点 #4472 已离线 — 周边车辆切换手动模式 — 请保持警惕',
    '黑市交易记录 — 时间戳已擦除 — 金额已加密 — 追踪程序已被反制',
];

class _ScrollText {
    constructor(container) {
        this._container = container;
        this._active = [];
        this._timer = 0;
        this._nextDelay = 3 + Math.random() * 5;
    }

    update(dt) {
        this._timer += dt;
        if (this._timer >= this._nextDelay) {
            this._timer = 0;
            this._nextDelay = 4 + Math.random() * 8;
            this._spawn();
        }
        for (let i = this._active.length - 1; i >= 0; i--) {
            const s = this._active[i];
            s.x += s.speed * dt;
            s.el.style.transform = `translateX(${s.x}px)`;
            if (s.x > window.innerWidth + 100) {
                s.el.remove();
                this._active.splice(i, 1);
            }
        }
    }

    _spawn() {
        const el = document.createElement('div');
        const phrase = _SCROLL_PHRASES[Math.floor(Math.random() * _SCROLL_PHRASES.length)];
        el.textContent = phrase;
        const y = 30 + Math.random() * (window.innerHeight - 80);
        const size = 14 + Math.floor(Math.random() * 10);
        const opacity = 0.25 + Math.random() * 0.35;
        const hue = [0, 180, 270, 60, 120][Math.floor(Math.random() * 5)];
        el.style.cssText = `position:fixed;top:${y}px;left:0;font-family:'VT323',monospace;font-size:${size}px;color:hsla(${hue},100%,65%,${opacity});white-space:nowrap;pointer-events:none;z-index:150;text-shadow:0 0 8px hsla(${hue},100%,50%,0.4);letter-spacing:2px;`;
        this._container.appendChild(el);
        const speed = 60 + Math.random() * 120;
        this._active.push({ el, x: -el.offsetWidth - 20, speed });
        el.style.transform = `translateX(${-el.offsetWidth - 20}px)`;
    }

    cleanup() {
        for (const s of this._active) s.el.remove();
        this._active.length = 0;
    }
}

export class App {
    constructor(container) {
        this._container = container;
        this.terminalEl = container.querySelector('#terminal-screen');
        this.canvasEl = container.querySelector('#game-canvas');

        this.settings = new GameSettings();
        this.terminal = new Terminal(this.terminalEl);
        this.scene = null;
        this.vehicle = null;
        this.segmenter = null;
        this.collector = null;

        this.running = false;
        this._destroyed = false;
        this._animFrameId = null;
        this._captureRequested = false;
        this._vhsEl = container.querySelector('#vhs-timestamp');
        this._vhsTimer = 0;

        // FPS counter
        this._fpsFrames = 0;
        this._fpsTime = 0;
        this._fpsEl = null;

        this._init();
    }

    async _init() {
        // Set up terminal menu actions
        this.terminal.onAction = (action) => this._handleAction(action);

        // Start the terminal boot sequence
        await this.terminal.show();

        if (this._destroyed) return;

        // Pre-load simulation modules in background while user sees the terminal.
        // The segmenter is created but NOT initialised here — OpenCV.js only loads
        // the first time data collection actually runs (see _ensureDataPipeline).
        loadSimModules().then(() => {
            if (this._destroyed) return;
            this.segmenter = new Segmenter();
            this.collector = new DataCollector();
        });
    }

    _handleAction(action) {
        switch (action) {
            case 'start':
                this._startSimulation();
                break;
            case 'export':
                this._exportData();
                break;
            case 'settings':
                this.terminal.enterSettingsMode(this.settings);
                break;
        }
    }

    async _startSimulation() {
        // Ensure simulation modules are loaded
        await loadSimModules();
        if (this._destroyed) return;
        if (!this.segmenter) this.segmenter = new Segmenter();
        if (!this.collector) this.collector = new DataCollector();

        // Hide terminal, show canvas
        this.terminal.hide();
        this.canvasEl.style.display = 'block';

        // Initialize Three.js scene and vehicle
        if (!this.scene) {
            // Load pre-generated textures (Layer 1)
            const textureManager = new TextureManager();
            await textureManager.loadAll();

            if (this._destroyed) return;

            this.scene = new CyberpunkScene(this.canvasEl, textureManager);

            // Initialize live stream client (Layer 2)
            this._liveClient = new LiveStreamClient(
                this.scene.getRenderer(),
                this.scene.scene,
                this.scene.camera
            );
            this.scene.liveStreamClient = this._liveClient;
        }
        if (!this.vehicle) {
            this.vehicle = new Vehicle(this.scene.scene);
        }

        // Apply settings
        this._applySettings();

        // Start data collection session
        this.collector.startSession();

        // Bind capture key (C)
        this._captureKeyHandler = (e) => {
            if (e.code === 'KeyC') {
                this._captureRequested = true;
            }
            // ESC returns to menu
            if (e.code === 'Escape') {
                this._stopSimulation();
            }
            // Cycle palette with E
            if (e.code === 'KeyE') {
                this.scene.nextPalette();
            }
            // Toggle continuous mode with T
            if (e.code === 'KeyT') {
                const newMode = this.collector.mode === 'manual' ? 'continuous' : 'manual';
                this.collector.setMode(newMode);
            }
            // Toggle live StreamDiffusion mode with L
            if (e.code === 'KeyL' && this._liveClient) {
                this._liveClient.toggle();
            }
            // Open settings console overlay with /
            if (e.key === '/' || e.code === 'Slash') {
                this._openConsole();
                return;
            }
            // Cycle radio with R: OFF → lo-fi → jazz → OFF
            if (e.code === 'KeyR') {
                if (!this._radio) {
                    this._radio = new LofiRadio();
                    if (this._radioVolume !== undefined && this._radio._masterGain) {
                        this._radio._masterGain.gain.value = this._radioVolume;
                    }
                }
                const mode = this._radio.toggle();
                this._updateRadioHud(mode);
            }
            // Fire laser with F (or Ctrl) — hold to keep firing
            if (e.code === 'KeyF' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
                this._fireHeld = true;
            }
        };
        this._captureKeyUpHandler = (e) => {
            if (e.code === 'KeyF' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
                this._fireHeld = false;
            }
        };
        window.addEventListener('keydown', this._captureKeyHandler);
        window.addEventListener('keyup', this._captureKeyUpHandler);

        // Show VHS timestamp
        if (this._vhsEl) this._vhsEl.style.display = 'block';

        // FPS counter overlay
        if (!this._fpsEl) {
            this._fpsEl = document.createElement('div');
            this._fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;font:bold 14px monospace;z-index:9999;text-shadow:0 0 4px #000;pointer-events:none;';
            this._container.appendChild(this._fpsEl);
        }
        this._fpsEl.style.display = 'block';
        this._fpsFrames = 0;
        this._fpsTime = 0;

        // Scrolling Chinese text overlay
        if (!this._scrollText) this._scrollText = new _ScrollText(this._container);

        // Start engine sound (always on during simulation)
        if (!this._engine) this._engine = new EngineSound();
        this._engine.start();

        // Hex HUD
        if (!this._hexHud) {
            const { HexHud } = await import('./ui/HexHud');
            this._hexHud = new HexHud();
        }
        this._hexHud.show();

        // ── Gameplay HUD + mission/pursuit system ──
        if (!this._gameHud) this._gameHud = new GameHud(this._container);
        this._gameHud.show();

        if (!this._mission) {
            this._mission = new MissionManager(this.scene, this.vehicle, {
                onToast: (text, kind) => { if (this._gameHud) this._gameHud.toast(text, kind); },
            });
        }
        this._mission.startSession();

        // ── Laser cannon ──
        if (!this._weapon) {
            this._weapon = new Weapon(this.scene, this.vehicle, this._mission, {
                onToast: (text, kind) => { if (this._gameHud) this._gameHud.toast(text, kind); },
            });
        }

        // ── GTA-style minimap ──
        if (!this._minimap) {
            this._minimap = new Minimap(this._container, this.scene, this.vehicle, this._mission);
        }
        this._minimap.show();

        // ── Mobile touch controls (joystick) — only on touch devices ──
        if (MobileControls.isTouch()) {
            if (!this._mobileControls) {
                this._mobileControls = new MobileControls(this._container, this.vehicle, {
                    onExit: () => this._stopSimulation(),
                });
            }
            this._mobileControls.show();
        } else {
            // Desktop controls hint
            this._gameHud.toast('WASD 驾驶 · SPACE 漂移 · F 开火 · ESC 返回菜单', 'info');
        }

        // Start game loop
        this.running = true;
        this._lastTime = performance.now();
        this._gameLoop();

        // Seatbelt chime
        this._playSeatbeltChime();
    }

    _gameLoop() {
        if (!this.running) return;

        const now = performance.now();
        const dt = Math.min((now - this._lastTime) / 1000, 0.05); // cap at 50ms
        this._lastTime = now;

        // Update vehicle physics
        this.vehicle.groundY = this.scene.getGroundHeight(this.vehicle.position.x, this.vehicle.position.z);
        this.vehicle.update(dt);

        // Collision detection — include solid cop cars so they can block/ram
        const collidables = this.scene.getCollidables(this.vehicle.position, 30);
        if (this._mission) this._mission.getPoliceCollidables(collidables);
        const collisions = this.vehicle.checkCollisions(collidables, dt);

        // Update scene (camera, rain, neon flicker, post-processing render)
        this.scene.update(this.vehicle.position, this.vehicle.rotation, dt);

        // ── Gameplay: missions + police pursuit ──
        if (this._mission) {
            this._mission.reportCollisions(collisions);
            this._mission.update(dt);

            // Laser cannon — fire while held (respects cooldown/overheat)
            if (this._weapon) {
                const firing = this._fireHeld ||
                    (this.vehicle.mobileInput && this.vehicle.mobileInput.fire);
                if (firing) this._weapon.fire();
                this._weapon.update(dt);
            }

            if (this._gameHud) {
                this._gameHud.update(this._mission.getState(), this._weapon ? this._weapon.getState() : null);
                this._gameHud.tickToasts(dt);
            }
            if (this._minimap) this._minimap.update(dt);
        }

        // Segmentation + data collection — the OpenCV pass is expensive, so only
        // run it when data is actually being recorded (continuous mode, or a
        // manual capture this frame). Idle gameplay skips it entirely.
        const needSeg = this.collector.recording &&
            (this.collector.mode === 'continuous' || this._captureRequested);
        if (needSeg) this._ensureDataPipeline();
        const mask = needSeg ? this.segmenter.processFrame(this.canvasEl) : null;
        if (needSeg) {
            this.collector.tick(
                this.canvasEl,
                this.vehicle,
                mask,
                this._captureRequested
            );
        }
        this._captureRequested = false;

        // VHS timestamp — throttled to 1Hz
        this._vhsTimer += dt;
        if (this._vhsEl && this._vhsTimer >= 1) {
            this._vhsTimer = 0;
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const date = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()}`;
            const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            this._vhsEl.innerHTML = `<span class="rec-dot"></span>REC  ${date}  ${time}\nPLAY  \u25B6`;
        }

        // Scrolling Chinese text
        if (this._scrollText) this._scrollText.update(dt);

        // Lo-fi radio scheduling
        if (this._radio) this._radio.update(dt);

        // Engine sound
        if (this._engine) this._engine.update(dt, this.vehicle);

        // Hex HUD — collision proximity
        if (this._hexHud) {
            let minDist = Infinity;
            for (const col of collidables) {
                const dx = (col.box.min.x + col.box.max.x) * 0.5 - this.vehicle.position.x;
                const dz = (col.box.min.z + col.box.max.z) * 0.5 - this.vehicle.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < minDist) minDist = dist;
            }
            this._hexHud.update(dt, Math.max(0, 1 - minDist / 15));
        }

        // FPS counter
        this._fpsFrames++;
        this._fpsTime += dt;
        if (this._fpsTime >= 0.5) {
            const fps = this._fpsFrames / this._fpsTime;
            if (this._fpsEl) this._fpsEl.textContent = `${fps.toFixed(1)} FPS`;
            this._fpsFrames = 0;
            this._fpsTime = 0;
        }

        this._animFrameId = requestAnimationFrame(() => this._gameLoop());
    }

    /** Lazily initialise the segmentation/OpenCV pipeline on first data capture. */
    _ensureDataPipeline() {
        if (this._segInitStarted || !this.segmenter) return;
        this._segInitStarted = true;
        this.segmenter.init().catch(err => {
            console.warn('[Segmenter] 初始化警告:', err);
        });
    }

    _stopSimulation() {
        this.running = false;
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        // Unbind capture key
        if (this._captureKeyHandler) {
            window.removeEventListener('keydown', this._captureKeyHandler);
            this._captureKeyHandler = null;
        }
        if (this._captureKeyUpHandler) {
            window.removeEventListener('keyup', this._captureKeyUpHandler);
            this._captureKeyUpHandler = null;
        }
        this._fireHeld = false;

        // Disconnect live stream if active
        if (this._liveClient) {
            this._liveClient.disconnect();
        }

        // Stop recording
        this.collector.stopSession();

        // Clean up scrolling text, radio, and engine
        if (this._scrollText) this._scrollText.cleanup();
        if (this._radio) { this._radio.dispose(); this._radio = null; }
        if (this._engine) { this._engine.dispose(); this._engine = null; }
        this._updateRadioHud(false);
        if (this._hexHud) this._hexHud.hide();

        // Gameplay HUD + mobile controls + pursuit cleanup
        if (this._mission) this._mission.suspend();
        if (this._gameHud) this._gameHud.hide();
        if (this._minimap) this._minimap.hide();
        if (this._mobileControls) this._mobileControls.hide();

        // Hide canvas, VHS overlay, and FPS counter, show terminal
        this.canvasEl.style.display = 'none';
        if (this._vhsEl) this._vhsEl.style.display = 'none';
        if (this._fpsEl) this._fpsEl.style.display = 'none';
        this.terminal.show();
    }

    async _exportData() {
        const data = this.collector.getData();
        await Exporter.exportZip(data);
    }

    _updateRadioHud(mode) {
        if (!this._radioHud) {
            this._radioHud = document.createElement('div');
            this._radioHud.style.cssText = 'position:fixed;top:8px;right:12px;font-family:"VT323",monospace;font-size:16px;color:#0ff;letter-spacing:2px;z-index:200;pointer-events:none;text-shadow:0 0 6px rgba(0,255,255,0.4),1px 0 0 rgba(255,40,40,0.3),-1px 0 0 rgba(40,40,255,0.2);opacity:0.85;white-space:pre;';
            this._container.appendChild(this._radioHud);
        }
        if (mode === 'lofi') {
            this._radioHud.textContent = '\uD83D\uDCFB NEURODRIVE FM \u2014 \u266A lo-fi beats';
            this._radioHud.style.display = 'block';
        } else if (mode === 'jazz') {
            this._radioHud.textContent = '\uD83D\uDCFB NEURODRIVE FM \u2014 \uD83C\uDFB7 jazz session';
            this._radioHud.style.display = 'block';
        } else {
            this._radioHud.style.display = 'none';
        }
    }

    _applySettings() {
        const s = this.settings.getAll();

        // Camera
        this.scene.camera.fov = s.fov;
        this.scene.camera.updateProjectionMatrix();
        this.scene.camDist = s.cameraDistance;
        this.scene.camHeight = s.cameraHeight;

        // Palette
        this.scene.setPalettePool(s.paletteMode);
        this.scene.setPalette(s.palette);
        this.scene.setPaletteLock(s.paletteLock);

        // Bloom — passes[1] is UnrealBloomPass
        const bloomPass = this.scene.composer.passes[1];
        if (bloomPass) {
            bloomPass.strength = s.bloomStrength;
            bloomPass.threshold = s.bloomThreshold;
        }

        // Retro shader (scanlines + chromatic aberration)
        if (this.scene.retroPass) {
            this.scene.retroPass.uniforms.scanlineIntensity.value = s.scanlines ? 0.06 : 0;
            this.scene.retroPass.uniforms.chromaticAberration.value = s.chromaticAberration;
        }

        // Vehicle
        this.vehicle.maxSpeed = s.maxSpeed;
        this.vehicle.driftLateralKick = s.driftKick;
        if (this.vehicle._bodyMat) {
            this.vehicle._bodyMat.emissiveIntensity = s.vehicleEmissive;
        }
        if (this.vehicle._underglow) {
            this.vehicle._underglow.material.color.set(s.neonUnderglow);
        }

        // Building edges
        if (this.scene) this.scene.setEdgesVisible(s.buildingEdges);

        // Data collection
        this.collector.setMode(s.dataMode);
        this.collector.continuousInterval = s.dataCaptureInterval;

        // Radio volume (applied when radio starts)
        this._radioVolume = s.radioVolume;
    }

    _playSeatbeltChime() {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._chimeCtx = ctx;
        const now = ctx.currentTime;
        const playTone = (freq, t) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(0.06, t + 0.02);
            env.gain.setValueAtTime(0.06, t + 0.15);
            env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.connect(env);
            env.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.45);
        };
        playTone(523.25, now + 0.1); // C5
        playTone(659.25, now + 0.35); // E5
        setTimeout(() => ctx.close().catch(() => {}), 1500);
    }

    _openConsole() {
        // Pause game loop
        this.running = false;
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        // Unbind simulation keys
        if (this._captureKeyHandler) {
            window.removeEventListener('keydown', this._captureKeyHandler);
        }
        if (this._captureKeyUpHandler) {
            window.removeEventListener('keyup', this._captureKeyUpHandler);
        }
        this._fireHeld = false;

        // Hide gameplay HUD/controls while the console is open
        if (this._gameHud) this._gameHud.hide();
        if (this._minimap) this._minimap.hide();
        if (this._mobileControls) this._mobileControls.hide();

        // Show terminal as overlay (canvas stays visible behind)
        this.terminalEl.classList.add('overlay-mode');
        this.terminalEl.style.display = 'flex';

        // Enter settings mode with overlay flag
        this.terminal.enterSettingsMode(this.settings, {
            overlay: true,
            onClose: () => this._closeConsole(),
        });
    }

    _closeConsole() {
        // Hide terminal overlay
        this.terminalEl.style.display = 'none';
        this.terminalEl.classList.remove('overlay-mode');

        // Re-apply settings to scene/vehicle
        this._applySettings();

        // Restore gameplay HUD/controls
        if (this._gameHud) this._gameHud.show();
        if (this._minimap) this._minimap.show();
        if (this._mobileControls) this._mobileControls.show();

        // Rebind simulation keys
        if (this._captureKeyHandler) {
            window.addEventListener('keydown', this._captureKeyHandler);
        }
        if (this._captureKeyUpHandler) {
            window.addEventListener('keyup', this._captureKeyUpHandler);
        }

        // Resume game loop
        this.running = true;
        this._lastTime = performance.now();
        this._gameLoop();
    }

    /** Clean up all resources — called on React unmount */
    destroy() {
        this._destroyed = true;
        this.running = false;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        // Remove event listeners
        if (this._captureKeyHandler) {
            window.removeEventListener('keydown', this._captureKeyHandler);
            this._captureKeyHandler = null;
        }
        if (this._captureKeyUpHandler) {
            window.removeEventListener('keyup', this._captureKeyUpHandler);
            this._captureKeyUpHandler = null;
        }

        // Stop audio
        if (this._radio) { this._radio.dispose(); this._radio = null; }
        if (this._engine) { this._engine.dispose(); this._engine = null; }
        if (this._chimeCtx) { this._chimeCtx.close().catch(() => {}); this._chimeCtx = null; }

        // Disconnect live stream
        if (this._liveClient) { this._liveClient.disconnect(); }

        // Clean up scrolling text
        if (this._scrollText) { this._scrollText.cleanup(); this._scrollText = null; }

        // Clean up dynamic DOM elements
        if (this._fpsEl) { this._fpsEl.remove(); this._fpsEl = null; }
        if (this._radioHud) { this._radioHud.remove(); this._radioHud = null; }

        // Clean up gameplay systems
        if (this._weapon) { this._weapon.dispose(); this._weapon = null; }
        if (this._mission) { this._mission.dispose(); this._mission = null; }
        if (this._gameHud) { this._gameHud.dispose(); this._gameHud = null; }
        if (this._minimap) { this._minimap.dispose(); this._minimap = null; }
        if (this._mobileControls) { this._mobileControls.dispose(); this._mobileControls = null; }

        // Dispose Three.js resources
        if (this.scene) {
            const renderer = this.scene.getRenderer();
            if (renderer) renderer.dispose();
        }

        // Unbind vehicle keyboard listeners
        if (this.vehicle) { this.vehicle.unbindInput(); }

        // Unbind terminal keyboard listeners
        if (this.terminal) { this.terminal._unbindKeys(); }
    }
}
