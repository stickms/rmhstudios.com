// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Terminal Boot Menu
   Chinese-language CRT terminal interface
   ═══════════════════════════════════════════ */

const ASCII_BANNER = `
  ╔══════════════════════════════════════════════════════════════════╗
  ║                                                                  ║
  ║    ███  神   经   驾   驶   系   统  ███                         ║
  ║                                                                  ║
  ║    ░▒▓  N  E  U  R  O  D  R  I  V  E  ▓▒░                      ║
  ║                                                                  ║
  ║    版本 v2.077  ░░  新上海城市网格  ░░  量子引擎                 ║
  ║                                                                  ║
  ║    ╠═══ 自动驾驶数据采集 ═══╣  ╠═══ 神经网络训练 ═══╣           ║
  ║                                                                  ║
  ╠══════════════════════════════════════════════════════════════════╣
  ║  赛 博 朋 克 ◆ 无 限 城 市 ◆ 全 方 位 驾 驶 ◆ 数 据 链 路     ║
  ╚══════════════════════════════════════════════════════════════════╝
`;

const BOOT_SEQUENCE = [
    { text: '系统初始化中...', delay: 80, cls: '' },
    { text: 'BIOS v4.77 — 量子协处理器已就绪', delay: 60, cls: 'dim' },
    { text: '内存检测: 2048 TB 神经突触 RAM .................. 通过', delay: 40, cls: '' },
    { text: 'GPU 矩阵: NVIDIA ATLAS Ω-9000 .................. 在线', delay: 40, cls: '' },
    { text: '载入神经接口驱动 v7.33 .......................... 完成', delay: 40, cls: '' },
    { text: '连接城市网格 NODE://NEO-SHANGHAI ................ 已连接', delay: 60, cls: 'cyan' },
    { text: '自动驾驶数据链路 ............................... 激活', delay: 40, cls: 'cyan' },
    { text: 'OpenCV 视觉皮层 v5.0 ........................... 在线', delay: 40, cls: '' },
    { text: '语义分割引擎 ................................... 就绪', delay: 40, cls: '' },
    { text: '车辆传感器阵列 ................................. 校准完毕', delay: 40, cls: 'yellow' },
    { text: '', delay: 20, cls: '' },
    { text: '█ 所有系统正常 — 欢迎回来，驾驶员 █', delay: 0, cls: 'bright' },
];

const MENU_ITEMS = [
    { key: '1', label: '[ 1 ] 启动模拟', action: 'start' },
    { key: '2', label: '[ 2 ] 数据导出', action: 'export' },
    { key: '3', label: '[ 3 ] 系统设置', action: 'settings' },
];

const PALETTE_NAMES = [
    'Classic Cyber', 'Toxic Neon', 'Bloodline', 'Ice',
    'Synthwave', 'Gold Rush', 'Light Cyber', 'Bebop',
];

export class Terminal {
    constructor(containerEl) {
        this.container = containerEl;
        this.lines = [];
        this.menuVisible = false;
        this.selectedIndex = 0;
        this.onAction = null; // callback

        // Settings mode state
        this.inputMode = false;
        this.inputBuffer = '';
        this._settings = null;
        this._inputEl = null;
        this._commandHistory = [];
        this._historyIdx = -1;

        // Overlay mode (opened with / during simulation)
        this._overlayMode = false;
        this._onClose = null;

        this._keyHandler = null;
    }

    async show() {
        this.container.style.display = 'flex';
        this.container.innerHTML = '';
        this.lines = [];
        this.menuVisible = false;

        // Render ASCII banner
        await this._renderBanner();
        await this._sleep(400);

        // Boot sequence
        for (const step of BOOT_SEQUENCE) {
            await this._typeLine(step.text, step.cls, step.delay);
        }

        await this._sleep(600);
        this._showMainMenu();
    }

    hide() {
        this.container.style.display = 'none';
        this._unbindKeys();
    }

    /* ── Settings mode entry ── */

    enterSettingsMode(settings, opts = {}) {
        this._settings = settings;
        this.inputMode = true;
        this.inputBuffer = '';
        this._historyIdx = -1;
        this._overlayMode = !!opts.overlay;
        this._onClose = opts.onClose || null;

        // Clear container and show settings panel
        this.container.innerHTML = '';
        this.lines = [];
        this.menuVisible = false;
        this._unbindKeys();

        this._showSettingsPanel();
        this._renderInputLine();
        this._bindKeys();
    }

    /* —— internal —— */

    _showMainMenu() {
        this._addLine('');
        this._addLine('══════════════════════════════════════════', 'magenta');
        this._addLine('   请选择操作：', '');
        this._addLine('══════════════════════════════════════════', 'magenta');
        this._addLine('');

        this._renderMenu();
        this._bindKeys();
    }

    _showSettingsPanel() {
        const s = this._settings.getAll();

        this._addLine('╔══════════════════════════════════════════════════════╗', 'magenta');
        this._addLine('║         系 统 设 置 控 制 台  /  SETTINGS           ║', 'magenta');
        this._addLine('╚══════════════════════════════════════════════════════╝', 'magenta');
        this._addLine('');

        // ── 视觉 / Visual ──
        this._addLine('  ▸ 视觉 / Visual', 'cyan');
        this._addLine(`    palette ............ ${PALETTE_NAMES[s.palette]} (${s.palette})`, 'yellow');
        this._addLine(`    paletteMode ........ ${s.paletteMode}`, 'yellow');
        this._addLine(`    paletteLock ........ ${s.paletteLock ? 'ON' : 'OFF'}`, 'yellow');
        this._addLine(`    bloomStrength ...... ${s.bloomStrength}`, 'yellow');
        this._addLine(`    bloomThreshold ..... ${s.bloomThreshold}`, 'yellow');
        this._addLine(`    scanlines .......... ${s.scanlines ? 'ON' : 'OFF'}`, 'yellow');
        this._addLine(`    chromaticAberration  ${s.chromaticAberration}`, 'yellow');
        this._addLine(`    buildingEdges ...... ${s.buildingEdges ? 'ON' : 'OFF'}`, 'yellow');
        this._addLine('');

        // ── 相机 / Camera ──
        this._addLine('  ▸ 相机 / Camera', 'cyan');
        this._addLine(`    fov ................ ${s.fov}`, 'yellow');
        this._addLine(`    cameraDistance ..... ${s.cameraDistance}`, 'yellow');
        this._addLine(`    cameraHeight ...... ${s.cameraHeight}`, 'yellow');
        this._addLine('');

        // ── 车辆 / Vehicle ──
        this._addLine('  ▸ 车辆 / Vehicle', 'cyan');
        this._addLine(`    maxSpeed ........... ${s.maxSpeed}`, 'yellow');
        this._addLine(`    driftKick .......... ${s.driftKick}`, 'yellow');
        this._addLine(`    vehicleEmissive .... ${s.vehicleEmissive}`, 'yellow');
        this._addLine(`    neonUnderglow ...... ${s.neonUnderglow}`, 'yellow');
        this._addLine('');

        // ── 数据 / Data ──
        this._addLine('  ▸ 数据 / Data', 'cyan');
        this._addLine(`    dataMode ........... ${s.dataMode}`, 'yellow');
        this._addLine(`    dataCaptureInterval  ${s.dataCaptureInterval}s`, 'yellow');
        this._addLine('');

        // ── 天气 / Weather & Audio ──
        this._addLine('  ▸ 天气·音频 / Weather & Audio', 'cyan');
        this._addLine(`    rainIntensity ...... ${s.rainIntensity}`, 'yellow');
        this._addLine(`    radioVolume ........ ${s.radioVolume}`, 'yellow');
        this._addLine('');

        this._addLine('──────────────────────────────────────────', 'dim');
        const escHint = this._overlayMode ? 'ESC 返回模拟' : 'ESC 返回菜单';
        this._addLine(`  输入 /help 查看命令  |  ${escHint}`, 'dim');
        this._addLine('──────────────────────────────────────────', 'dim');
        this._addLine('');
    }

    _renderInputLine() {
        // Remove previous input line
        if (this._inputEl) this._inputEl.remove();

        const line = document.createElement('div');
        line.className = 'term-input-line';

        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.textContent = '> ';

        const text = document.createElement('span');
        text.className = 'input-text';
        text.textContent = this.inputBuffer;

        const cursor = document.createElement('span');
        cursor.className = 'cursor';

        line.appendChild(prompt);
        line.appendChild(text);
        line.appendChild(cursor);

        this.container.appendChild(line);
        this._inputEl = line;
        this._scrollToBottom();
    }

    async _renderBanner() {
        const bannerDiv = document.createElement('div');
        bannerDiv.className = 'ascii-art glitch';
        bannerDiv.textContent = ASCII_BANNER;
        this.container.appendChild(bannerDiv);

        const subtitle = document.createElement('div');
        subtitle.className = 'term-line cyan';
        subtitle.textContent = '        神 经 驾 驶  —  自 动 驾 驶 数 据 采 集 平 台  v2.077';
        this.container.appendChild(subtitle);

        this._addLine('');
    }

    async _typeLine(text, cls = '', charDelay = 30) {
        const div = document.createElement('div');
        div.className = `term-line ${cls}`;
        this.container.appendChild(div);
        this.lines.push(div);

        if (charDelay <= 0) {
            div.textContent = text;
        } else {
            for (let i = 0; i < text.length; i++) {
                div.textContent += text[i];
                if (i % 3 === 0) {
                    await this._sleep(charDelay);
                }
            }
        }
        this._scrollToBottom();
        return div;
    }

    _addLine(text, cls = '') {
        const div = document.createElement('div');
        div.className = `term-line ${cls}`;
        div.textContent = text;
        this.container.appendChild(div);
        this.lines.push(div);
        this._scrollToBottom();
        return div;
    }

    _renderMenu() {
        this.menuEls = [];
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const item = MENU_ITEMS[i];
            const div = document.createElement('div');
            div.className = 'term-line menu-item';
            div.textContent = '   ' + item.label;
            if (i === this.selectedIndex) div.classList.add('selected');
            this.container.appendChild(div);
            this.menuEls.push(div);

            div.addEventListener('click', () => {
                this._selectItem(i);
                this._activateItem();
            });
        }
        this.menuVisible = true;

        // Blinking cursor at the end
        this._addLine('');
        const cursorLine = document.createElement('div');
        cursorLine.className = 'term-line';
        cursorLine.innerHTML = '  > <span class="cursor"></span>';
        this.container.appendChild(cursorLine);
        this._scrollToBottom();
    }

    _selectItem(index) {
        this.selectedIndex = Math.max(0, Math.min(index, MENU_ITEMS.length - 1));
        this.menuEls.forEach((el, i) => {
            el.classList.toggle('selected', i === this.selectedIndex);
        });
    }

    _activateItem() {
        const action = MENU_ITEMS[this.selectedIndex].action;
        if (this.onAction) this.onAction(action);
    }

    _bindKeys() {
        this._unbindKeys();
        this._keyHandler = (e) => {
            if (this.inputMode) {
                this._handleInputKey(e);
            } else {
                this._handleMenuKey(e);
            }
        };
        window.addEventListener('keydown', this._keyHandler);
    }

    _handleMenuKey(e) {
        if (!this.menuVisible) return;

        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            e.preventDefault();
            this._selectItem(this.selectedIndex - 1);
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            e.preventDefault();
            this._selectItem(this.selectedIndex + 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this._activateItem();
        } else if (e.key === '1' || e.key === '2' || e.key === '3') {
            e.preventDefault();
            const idx = parseInt(e.key) - 1;
            this._selectItem(idx);
            this._activateItem();
        }
    }

    _handleInputKey(e) {
        e.preventDefault();

        if (e.key === 'Escape') {
            this._exitSettingsMode();
            return;
        }

        if (e.key === 'Enter') {
            const raw = this.inputBuffer.trim();
            if (raw) {
                this._commandHistory.push(raw);
                this._historyIdx = -1;
                // Echo command
                this._addLine(`> ${raw}`, '');
            }
            this.inputBuffer = '';
            if (raw) this._executeCommand(raw);
            this._renderInputLine();
            return;
        }

        if (e.key === 'Backspace') {
            this.inputBuffer = this.inputBuffer.slice(0, -1);
            this._renderInputLine();
            return;
        }

        if (e.key === 'ArrowUp') {
            if (this._commandHistory.length > 0) {
                if (this._historyIdx === -1) this._historyIdx = this._commandHistory.length;
                this._historyIdx = Math.max(0, this._historyIdx - 1);
                this.inputBuffer = this._commandHistory[this._historyIdx];
                this._renderInputLine();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            if (this._historyIdx !== -1) {
                this._historyIdx = Math.min(this._commandHistory.length, this._historyIdx + 1);
                this.inputBuffer = this._historyIdx < this._commandHistory.length
                    ? this._commandHistory[this._historyIdx] : '';
                this._renderInputLine();
            }
            return;
        }

        // Printable character
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            this.inputBuffer += e.key;
            this._renderInputLine();
        }
    }

    _executeCommand(raw) {
        if (!raw.startsWith('/')) {
            this._addLine(`  错误: 未知输入 — 命令以 / 开头，输入 /help 查看帮助`, 'red');
            return;
        }

        const parts = raw.slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = parts[1];

        switch (cmd) {
            case 'help':
                this._showHelp();
                break;

            case 'palette': {
                if (arg === undefined) { this._addLine(`  当前: palette = ${this._settings.get('palette')} (${PALETTE_NAMES[this._settings.get('palette')]})`, 'cyan'); break; }
                const r = this._settings.set('palette', arg);
                if (r.ok) {
                    this._addLine(`  ✓ palette → ${PALETTE_NAMES[r.value]} (${r.value})`, 'cyan');
                    this._settings.set('paletteLock', true);
                    this._addLine('  ✓ 调色板已锁定 (输入 /palettelock off 解锁)', 'dim');
                } else {
                    this._addLine(`  ✗ ${r.error}`, 'red');
                }
                break;
            }

            case 'palettelock': {
                if (arg === undefined) { this._addLine(`  当前: paletteLock = ${this._settings.get('paletteLock') ? 'ON' : 'OFF'}`, 'cyan'); break; }
                const r = this._settings.set('paletteLock', arg);
                if (r.ok) this._addLine(`  ✓ paletteLock → ${r.value ? 'ON (锁定)' : 'OFF (自动循环)'}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'mode': {
                if (arg === undefined) { this._addLine(`  当前: paletteMode = ${this._settings.get('paletteMode')}`, 'cyan'); break; }
                const r = this._settings.set('paletteMode', arg);
                if (r.ok) this._addLine(`  ✓ paletteMode → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'fov': {
                if (arg === undefined) { this._addLine(`  当前: fov = ${this._settings.get('fov')}`, 'cyan'); break; }
                const r = this._settings.set('fov', arg);
                if (r.ok) this._addLine(`  ✓ fov → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'cam': {
                // /cam dist height
                if (arg === undefined) {
                    this._addLine(`  当前: distance=${this._settings.get('cameraDistance')} height=${this._settings.get('cameraHeight')}`, 'cyan');
                    break;
                }
                const h = parts[2];
                const r1 = this._settings.set('cameraDistance', arg);
                if (!r1.ok) { this._addLine(`  ✗ distance: ${r1.error}`, 'red'); break; }
                if (h !== undefined) {
                    const r2 = this._settings.set('cameraHeight', h);
                    if (!r2.ok) { this._addLine(`  ✗ height: ${r2.error}`, 'red'); break; }
                }
                this._addLine(`  ✓ cam → distance=${this._settings.get('cameraDistance')} height=${this._settings.get('cameraHeight')}`, 'cyan');
                break;
            }

            case 'bloom': {
                // /bloom strength [threshold]
                if (arg === undefined) {
                    this._addLine(`  当前: strength=${this._settings.get('bloomStrength')} threshold=${this._settings.get('bloomThreshold')}`, 'cyan');
                    break;
                }
                const r1 = this._settings.set('bloomStrength', arg);
                if (!r1.ok) { this._addLine(`  ✗ strength: ${r1.error}`, 'red'); break; }
                if (parts[2] !== undefined) {
                    const r2 = this._settings.set('bloomThreshold', parts[2]);
                    if (!r2.ok) { this._addLine(`  ✗ threshold: ${r2.error}`, 'red'); break; }
                }
                this._addLine(`  ✓ bloom → strength=${this._settings.get('bloomStrength')} threshold=${this._settings.get('bloomThreshold')}`, 'cyan');
                break;
            }

            case 'scanlines': {
                if (arg === undefined) { this._addLine(`  当前: scanlines = ${this._settings.get('scanlines') ? 'ON' : 'OFF'}`, 'cyan'); break; }
                const r = this._settings.set('scanlines', arg);
                if (r.ok) this._addLine(`  ✓ scanlines → ${r.value ? 'ON' : 'OFF'}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'rain': {
                if (arg === undefined) { this._addLine(`  当前: rainIntensity = ${this._settings.get('rainIntensity')}`, 'cyan'); break; }
                const r = this._settings.set('rainIntensity', arg);
                if (r.ok) this._addLine(`  ✓ rainIntensity → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'speed': {
                if (arg === undefined) { this._addLine(`  当前: maxSpeed = ${this._settings.get('maxSpeed')}`, 'cyan'); break; }
                const r = this._settings.set('maxSpeed', arg);
                if (r.ok) this._addLine(`  ✓ maxSpeed → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'drift': {
                if (arg === undefined) { this._addLine(`  当前: driftKick = ${this._settings.get('driftKick')}`, 'cyan'); break; }
                const r = this._settings.set('driftKick', arg);
                if (r.ok) this._addLine(`  ✓ driftKick → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'glow': {
                if (arg === undefined) { this._addLine(`  当前: neonUnderglow = ${this._settings.get('neonUnderglow')}`, 'cyan'); break; }
                const r = this._settings.set('neonUnderglow', arg);
                if (r.ok) this._addLine(`  ✓ neonUnderglow → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'edges': {
                if (arg === undefined) { this._addLine(`  当前: buildingEdges = ${this._settings.get('buildingEdges') ? 'ON' : 'OFF'}`, 'cyan'); break; }
                const r = this._settings.set('buildingEdges', arg);
                if (r.ok) this._addLine(`  ✓ buildingEdges → ${r.value ? 'ON' : 'OFF'}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'emissive': {
                if (arg === undefined) { this._addLine(`  当前: vehicleEmissive = ${this._settings.get('vehicleEmissive')}`, 'cyan'); break; }
                const r = this._settings.set('vehicleEmissive', arg);
                if (r.ok) this._addLine(`  ✓ vehicleEmissive → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'data': {
                // /data [manual|continuous] [interval]
                if (arg === undefined) {
                    this._addLine(`  当前: mode=${this._settings.get('dataMode')} interval=${this._settings.get('dataCaptureInterval')}s`, 'cyan');
                    break;
                }
                if (arg === 'manual' || arg === 'continuous') {
                    const r = this._settings.set('dataMode', arg);
                    if (!r.ok) { this._addLine(`  ✗ ${r.error}`, 'red'); break; }
                    if (parts[2] !== undefined) {
                        const r2 = this._settings.set('dataCaptureInterval', parts[2]);
                        if (!r2.ok) { this._addLine(`  ✗ interval: ${r2.error}`, 'red'); break; }
                    }
                } else {
                    // Assume it's an interval number
                    const r = this._settings.set('dataCaptureInterval', arg);
                    if (!r.ok) { this._addLine(`  ✗ ${r.error}`, 'red'); break; }
                }
                this._addLine(`  ✓ data → mode=${this._settings.get('dataMode')} interval=${this._settings.get('dataCaptureInterval')}s`, 'cyan');
                break;
            }

            case 'volume': {
                if (arg === undefined) { this._addLine(`  当前: radioVolume = ${this._settings.get('radioVolume')}`, 'cyan'); break; }
                const r = this._settings.set('radioVolume', arg);
                if (r.ok) this._addLine(`  ✓ radioVolume → ${r.value}`, 'cyan');
                else this._addLine(`  ✗ ${r.error}`, 'red');
                break;
            }

            case 'reset':
                this._settings.reset();
                this._addLine('  ✓ 所有设置已恢复默认值', 'cyan');
                // Refresh panel
                if (this._inputEl) this._inputEl.remove();
                this.container.innerHTML = '';
                this.lines = [];
                this._showSettingsPanel();
                this._renderInputLine();
                break;

            case 'clear':
                if (this._inputEl) this._inputEl.remove();
                this.container.innerHTML = '';
                this.lines = [];
                this._showSettingsPanel();
                this._renderInputLine();
                break;

            case 'start':
            case 'resume': {
                const wasOverlay = this._overlayMode;
                this._exitSettingsMode();
                if (!wasOverlay && this.onAction) this.onAction('start');
                return;
            }

            case 'export':
                this._addLine('  ' + this._settings.exportJSON(), 'dim');
                break;

            default:
                this._addLine(`  错误: 未知命令 /${cmd} — 输入 /help 查看帮助`, 'red');
        }

        this._scrollToBottom();
    }

    _showHelp() {
        this._addLine('');
        this._addLine('  ╔═══ 命令列表 / COMMANDS ═══╗', 'cyan');
        this._addLine('');
        this._addLine('  /palette <0-7>         调色板 (Classic Cyber → Bebop)', 'dim');
        this._addLine('  /mode <all|dark|light>  调色板模式 (循环范围)', 'dim');
        this._addLine('  /palettelock <on|off>  锁定调色板 (停止自动循环)', 'dim');
        this._addLine('  /fov <50-110>          视场角', 'dim');
        this._addLine('  /cam <dist> [height]   相机距离/高度', 'dim');
        this._addLine('  /bloom <str> [thresh]  泛光强度/阈值', 'dim');
        this._addLine('  /scanlines <on|off>    扫描线开关', 'dim');
        this._addLine('  /edges <on|off>        建筑霓虹边框', 'dim');
        this._addLine('  /rain <0-2>            雨量', 'dim');
        this._addLine('  /speed <20-80>         最大速度', 'dim');
        this._addLine('  /drift <0.1-1.0>       漂移横向力', 'dim');
        this._addLine('  /glow <#RRGGBB>        底盘氖光颜色', 'dim');
        this._addLine('  /emissive <0-0.5>      车身自发光', 'dim');
        this._addLine('  /data [mode] [interval] 数据采集模式', 'dim');
        this._addLine('  /volume <0-1>          电台音量', 'dim');
        this._addLine('  /reset                 恢复默认值', 'dim');
        this._addLine('  /clear                 清屏', 'dim');
        if (this._overlayMode) {
            this._addLine('  /resume                返回模拟 (应用更改)', 'dim');
        } else {
            this._addLine('  /start                 启动模拟', 'dim');
        }
        this._addLine('  /export                导出设置 JSON', 'dim');
        this._addLine('');
        this._addLine(this._overlayMode ? '  ESC                    返回模拟' : '  ESC                    返回主菜单', 'dim');
        this._addLine('');
    }

    _exitSettingsMode() {
        const wasOverlay = this._overlayMode;
        const onClose = this._onClose;

        this.inputMode = false;
        this._settings = null;
        this.inputBuffer = '';
        this._overlayMode = false;
        this._onClose = null;
        if (this._inputEl) { this._inputEl.remove(); this._inputEl = null; }
        this._unbindKeys();

        if (wasOverlay && onClose) {
            // Overlay mode — hand control back to simulation
            onClose();
            return;
        }

        // Re-render main menu (no boot replay)
        this.container.innerHTML = '';
        this.lines = [];

        // Quick banner (no typewriter)
        const bannerDiv = document.createElement('div');
        bannerDiv.className = 'ascii-art glitch';
        bannerDiv.textContent = ASCII_BANNER;
        this.container.appendChild(bannerDiv);

        const subtitle = document.createElement('div');
        subtitle.className = 'term-line cyan';
        subtitle.textContent = '        神 经 驾 驶  —  自 动 驾 驶 数 据 采 集 平 台  v2.077';
        this.container.appendChild(subtitle);
        this._addLine('');

        this._showMainMenu();
    }

    _unbindKeys() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }

    _scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
