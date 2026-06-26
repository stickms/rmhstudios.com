// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM 2099 — Multiplayer Lobby Overlay
   Create / join lobbies, ready-up, chat, and
   launch a shared cruise. Cyberpunk CRT styling
   to match the boot terminal.
   ═══════════════════════════════════════════ */

import { VelumMultiplayerClient } from '@/lib/velum2099/multiplayer';
import { playerColor } from './RemotePlayers';

const NEON_CYAN = '#00ffea';
const NEON_MAGENTA = '#ff00aa';

export class LobbyUI {
    /**
     * @param container host element
     * @param opts { onStart(roomId), onExit() }
     */
    constructor(container, opts = {}) {
        this.container = container;
        this.onStart = opts.onStart || (() => {});
        this.onExit = opts.onExit || (() => {});

        this.client = VelumMultiplayerClient.getInstance();
        this.roomId = null;
        this.selfId = null;
        this.state = null;       // latest lobby state
        this.playerName = this._loadName();
        this._started = false;
        this._selfColorIndex = 0;

        this._buildDom();
        this._bindClient();
        this.client.connect();
        this.selfId = this.client.getSocketId();
    }

    /* ── lifecycle ── */

    show() { this.root.style.display = 'flex'; }
    hide() { this.root.style.display = 'none'; }

    dispose() {
        this._unbindClient();
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }

    /* ── DOM ── */

    _buildDom() {
        const root = document.createElement('div');
        root.className = 'velum-lobby';
        root.style.cssText = `
            position:fixed; inset:0; z-index:400; display:flex;
            align-items:center; justify-content:center;
            background:radial-gradient(ellipse at center, rgba(8,4,20,0.96), rgba(2,1,8,0.99));
            font-family:'VT323', monospace; color:${NEON_CYAN};
            user-select:none;`;

        const panel = document.createElement('div');
        panel.style.cssText = `
            width:min(680px, 94vw); max-height:92vh; overflow:auto;
            border:2px solid ${NEON_CYAN}; border-radius:6px;
            box-shadow:0 0 24px rgba(0,255,234,0.35), inset 0 0 40px rgba(0,255,234,0.06);
            background:rgba(4,6,16,0.85); padding:22px 26px;`;
        root.appendChild(panel);

        // Title
        const title = document.createElement('div');
        title.textContent = '◆ VELUM 2099 — 多人巡航 / MULTIPLAYER ◆';
        title.style.cssText = `font-size:30px; letter-spacing:3px; color:${NEON_MAGENTA};
            text-shadow:0 0 10px ${NEON_MAGENTA}; text-align:center; margin-bottom:14px;`;
        panel.appendChild(title);

        // ── Name row ──
        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex; gap:10px; align-items:center; margin-bottom:14px;';
        const nameLabel = document.createElement('span');
        nameLabel.textContent = '驾驶员 / CALLSIGN';
        nameLabel.style.cssText = 'font-size:18px; opacity:0.85; white-space:nowrap;';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.maxLength = 16;
        nameInput.value = this.playerName;
        nameInput.placeholder = 'Driver';
        nameInput.style.cssText = this._inputCss();
        nameInput.addEventListener('input', () => {
            this.playerName = nameInput.value.trim() || 'Driver';
            this._saveName(this.playerName);
        });
        nameRow.appendChild(nameLabel);
        nameRow.appendChild(nameInput);
        panel.appendChild(nameRow);
        this._nameInput = nameInput;

        // ── Connect view (create / join) ──
        this._connectView = document.createElement('div');
        this._connectView.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const createBtn = this._button('▶  创建房间 / CREATE LOBBY', NEON_CYAN);
        createBtn.addEventListener('click', () => {
            this.client.createLobby(this.playerName);
        });
        this._connectView.appendChild(createBtn);

        const joinRow = document.createElement('div');
        joinRow.style.cssText = 'display:flex; gap:10px;';
        const codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.maxLength = 6;
        codeInput.placeholder = 'ROOM CODE';
        codeInput.style.cssText = this._inputCss() + 'text-transform:uppercase; letter-spacing:4px; flex:1;';
        const joinBtn = this._button('加入 / JOIN', NEON_MAGENTA);
        joinBtn.style.flex = '0 0 auto';
        joinBtn.addEventListener('click', () => {
            const code = codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (code.length >= 4) this.client.joinLobby(code, this.playerName);
        });
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinBtn.click();
            e.stopPropagation();
        });
        joinRow.appendChild(codeInput);
        joinRow.appendChild(joinBtn);
        this._connectView.appendChild(joinRow);

        const backBtn = this._button('✕  返回菜单 / BACK', '#888');
        backBtn.addEventListener('click', () => this.onExit());
        this._connectView.appendChild(backBtn);

        panel.appendChild(this._connectView);

        // ── Room view (player list + chat) ──
        this._roomView = document.createElement('div');
        this._roomView.style.cssText = 'display:none; flex-direction:column; gap:12px;';

        this._codeBadge = document.createElement('div');
        this._codeBadge.style.cssText = `font-size:24px; text-align:center; letter-spacing:6px;
            color:${NEON_MAGENTA}; text-shadow:0 0 10px ${NEON_MAGENTA};
            border:1px dashed ${NEON_MAGENTA}; border-radius:4px; padding:6px;`;
        this._roomView.appendChild(this._codeBadge);

        const listTitle = document.createElement('div');
        listTitle.textContent = '在线驾驶员 / DRIVERS';
        listTitle.style.cssText = 'font-size:18px; opacity:0.8; margin-top:4px;';
        this._roomView.appendChild(listTitle);

        this._playerList = document.createElement('div');
        this._playerList.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
        this._roomView.appendChild(this._playerList);

        // Chat
        this._chatLog = document.createElement('div');
        this._chatLog.style.cssText = `height:140px; overflow:auto; border:1px solid rgba(0,255,234,0.3);
            border-radius:4px; padding:8px; font-size:17px; line-height:1.25;
            background:rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:2px;`;
        this._roomView.appendChild(this._chatLog);

        const chatRow = document.createElement('div');
        chatRow.style.cssText = 'display:flex; gap:8px;';
        const chatInput = document.createElement('input');
        chatInput.type = 'text';
        chatInput.maxLength = 200;
        chatInput.placeholder = '输入消息… / message';
        chatInput.style.cssText = this._inputCss() + 'flex:1;';
        chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const t = chatInput.value.trim();
                if (t) { this.client.sendChat(this.roomId, t); chatInput.value = ''; }
            }
        });
        chatRow.appendChild(chatInput);
        this._roomView.appendChild(chatRow);
        this._chatInput = chatInput;

        // Action buttons
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:10px; margin-top:4px;';
        this._readyBtn = this._button('准备 / READY', NEON_CYAN);
        this._readyBtn.style.flex = '1';
        this._readyBtn.addEventListener('click', () => this.client.toggleReady(this.roomId));
        this._startBtn = this._button('🏁 开始 / START', NEON_MAGENTA);
        this._startBtn.style.flex = '1';
        this._startBtn.style.display = 'none';
        this._startBtn.addEventListener('click', () => this.client.startGame(this.roomId));
        actions.appendChild(this._readyBtn);
        actions.appendChild(this._startBtn);
        this._roomView.appendChild(actions);

        const leaveBtn = this._button('✕  离开房间 / LEAVE', '#888');
        leaveBtn.addEventListener('click', () => {
            if (this.roomId) this.client.leaveLobby(this.roomId);
            this.roomId = null;
            this._showConnectView();
        });
        this._roomView.appendChild(leaveBtn);

        panel.appendChild(this._roomView);

        // Status / error line
        this._statusLine = document.createElement('div');
        this._statusLine.style.cssText = 'font-size:16px; min-height:20px; margin-top:10px; text-align:center; color:#ff6677;';
        panel.appendChild(this._statusLine);

        this.container.appendChild(root);
        this.root = root;
    }

    _inputCss() {
        return `background:rgba(0,0,0,0.5); border:1px solid ${NEON_CYAN}; color:${NEON_CYAN};
            font-family:'VT323', monospace; font-size:20px; padding:6px 10px; border-radius:4px;
            outline:none; flex:1;`;
    }

    _button(label, color) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `background:rgba(0,0,0,0.4); border:1px solid ${color}; color:${color};
            font-family:'VT323', monospace; font-size:21px; letter-spacing:2px; padding:10px 14px;
            border-radius:4px; cursor:pointer; transition:all 0.12s; text-shadow:0 0 6px ${color};`;
        b.addEventListener('mouseenter', () => { b.style.background = color; b.style.color = '#04060f'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'rgba(0,0,0,0.4)'; b.style.color = color; });
        return b;
    }

    /* ── client wiring ── */

    _bindClient() {
        this._h = {
            created: (d) => { this.roomId = d.roomId; },
            joined: (d) => { this.roomId = d.roomId; this.selfId = this.client.getSocketId(); this._showRoomView(); this._applyState(d); },
            lobby: (d) => { this._applyState(d); },
            started: () => { if (!this._started) { this._started = true; this.onStart(this.roomId, { colorIndex: this._selfColorIndex }); } },
            left: () => {},
            chat: (m) => this._appendChat(m),
            error: (e) => { this._statusLine.textContent = (e && e.message) || 'Connection error'; },
        };
        this.client.on('velum:lobbyCreated', this._h.created);
        this.client.on('velum:joined', this._h.joined);
        this.client.on('velum:lobbyState', this._h.lobby);
        this.client.on('velum:gameStarted', this._h.started);
        this.client.on('velum:playerLeft', this._h.left);
        this.client.on('velum:chat', this._h.chat);
        this.client.on('velum:error', this._h.error);
    }

    _unbindClient() {
        if (!this._h) return;
        this.client.off('velum:lobbyCreated', this._h.created);
        this.client.off('velum:joined', this._h.joined);
        this.client.off('velum:lobbyState', this._h.lobby);
        this.client.off('velum:gameStarted', this._h.started);
        this.client.off('velum:playerLeft', this._h.left);
        this.client.off('velum:chat', this._h.chat);
        this.client.off('velum:error', this._h.error);
        this._h = null;
    }

    /* ── views ── */

    _showConnectView() {
        this._connectView.style.display = 'flex';
        this._roomView.style.display = 'none';
        this._statusLine.textContent = '';
    }

    _showRoomView() {
        this._connectView.style.display = 'none';
        this._roomView.style.display = 'flex';
        this._statusLine.textContent = '';
    }

    _applyState(state) {
        this.state = state;
        this.roomId = state.roomId;
        this.selfId = this.client.getSocketId();
        this._codeBadge.textContent = `房间码 / CODE:  ${state.roomId}`;
        this._showRoomView();

        // Render player list
        this._playerList.innerHTML = '';
        let isHost = false;
        let selfReady = false;
        for (const pl of state.players) {
            if (pl.id === this.selfId) { isHost = pl.isHost; selfReady = pl.ready; this._selfColorIndex = pl.colorIndex; }
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; gap:10px; font-size:19px;
                padding:4px 8px; border-radius:3px; background:rgba(255,255,255,0.03);`;
            const dot = document.createElement('span');
            const col = '#' + playerColor(pl.colorIndex).toString(16).padStart(6, '0');
            dot.style.cssText = `width:14px; height:14px; border-radius:50%; background:${col};
                box-shadow:0 0 8px ${col}; flex:0 0 auto;`;
            const nm = document.createElement('span');
            nm.textContent = pl.name + (pl.id === this.selfId ? '  (你/you)' : '');
            nm.style.cssText = 'flex:1; color:#cfefff;';
            const tag = document.createElement('span');
            if (pl.isHost) { tag.textContent = '主机/HOST'; tag.style.color = NEON_MAGENTA; }
            else { tag.textContent = pl.ready ? '✓ READY' : '…WAIT'; tag.style.color = pl.ready ? '#66ff88' : '#888'; }
            tag.style.fontSize = '16px';
            row.appendChild(dot); row.appendChild(nm); row.appendChild(tag);
            this._playerList.appendChild(row);
        }

        // Ready / start affordances
        this._readyBtn.textContent = selfReady ? '✓ 已准备 / READY' : '准备 / READY';
        this._readyBtn.style.opacity = selfReady ? '1' : '0.85';

        const everyoneReady = state.players.length > 0 &&
            state.players.every((p) => p.isHost || p.ready);
        this._startBtn.style.display = isHost ? 'block' : 'none';
        if (isHost) {
            this._startBtn.disabled = !everyoneReady;
            this._startBtn.style.opacity = everyoneReady ? '1' : '0.4';
            this._startBtn.style.cursor = everyoneReady ? 'pointer' : 'not-allowed';
        }

        // If the cruise is already running (drop-in), enter immediately.
        if (state.status === 'PLAYING' && !this._started) {
            this._started = true;
            this.onStart(this.roomId, { colorIndex: this._selfColorIndex });
        }
    }

    _appendChat(m) {
        const line = document.createElement('div');
        const col = '#' + playerColor(m.colorIndex).toString(16).padStart(6, '0');
        const who = document.createElement('span');
        who.textContent = m.name + ': ';
        who.style.cssText = `color:${col}; text-shadow:0 0 6px ${col};`;
        const txt = document.createElement('span');
        txt.textContent = m.text;
        txt.style.color = '#dfefff';
        line.appendChild(who); line.appendChild(txt);
        this._chatLog.appendChild(line);
        this._chatLog.scrollTop = this._chatLog.scrollHeight;
        while (this._chatLog.children.length > 80) this._chatLog.removeChild(this._chatLog.firstChild);
    }

    /* ── name persistence ── */

    _loadName() {
        try { return localStorage.getItem('velum.playerName') || 'Driver'; }
        catch { return 'Driver'; }
    }
    _saveName(n) {
        try { localStorage.setItem('velum.playerName', n); } catch { /* ignore */ }
    }
}
