// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM2099: GHOST ROUTE — Story HUD
   In-game DOM overlays for Story Mode:
     • compact story tracker (act / mission /
       objective / Vela integrity / alert)
     • glitchy dialogue call-cards
     • a choice modal
     • mission complete / fail panels
   Styled to match the rest of the cyberpunk CRT
   UI; positioned to avoid the minimap, gameplay
   HUD and joystick.
   ═══════════════════════════════════════════ */

const STYLE_ID = 'velum-story-style';
const CSS = `
@keyframes vs-card-in { from { opacity:0; transform:translateX(-14px);} to { opacity:1; transform:none;} }
@keyframes vs-flicker { 0%,100%{opacity:1;} 92%{opacity:1;} 94%{opacity:0.55;} 96%{opacity:1;} 97%{opacity:0.7;} }
@keyframes vs-modal-in { from { opacity:0;} to { opacity:1; } }
.vs-root { position:fixed; inset:0; z-index:320; pointer-events:none;
  font-family:'VT323','Noto Sans SC',monospace; color:#cfe9ff; }
.vs-track { position:absolute; right:12px; top:150px; width:214px; text-align:right;
  background:rgba(4,8,18,0.55); border:1px solid rgba(0,255,213,0.32); border-radius:6px;
  padding:7px 11px; backdrop-filter:blur(2px); text-shadow:0 0 6px rgba(0,255,213,0.3); }
.vs-track .ttl { font-size:13px; letter-spacing:2px; color:#8fb3d6; }
.vs-track .mis { font-size:17px; color:#7dffe6; line-height:1.05; margin-top:1px; }
.vs-track .obj { font-size:14px; color:#eafcff; margin-top:4px; line-height:1.1; }
.vs-meter { margin-top:6px; }
.vs-meter .lbl { display:flex; justify-content:space-between; font-size:11px; color:#9fb6d6; letter-spacing:1px; }
.vs-bar { height:5px; margin-top:2px; background:rgba(255,255,255,0.12); border-radius:3px; overflow:hidden; }
.vs-bar > i { display:block; height:100%; width:0; transition:width 0.3s ease; }
.vs-bar.vela > i { background:linear-gradient(90deg,#00ffd5,#9ff7ff); }
.vs-bar.alert > i { background:linear-gradient(90deg,#ffb13f,#ff3b5c); }
.vs-bar.cargo > i { background:linear-gradient(90deg,#39ff14,#ffd23f); }

.vs-cards { position:absolute; left:12px; top:50%; transform:translateY(-50%);
  display:flex; flex-direction:column; gap:8px; width:min(360px,72vw); }
.vs-card { background:linear-gradient(135deg,rgba(6,10,22,0.92),rgba(6,10,22,0.78));
  border-left:3px solid #00ffd5; border-radius:4px; padding:7px 12px;
  animation:vs-card-in 0.2s ease-out; box-shadow:0 0 16px rgba(0,0,0,0.5); }
.vs-card .who { font-size:13px; letter-spacing:2px; display:flex; justify-content:space-between; gap:8px; }
.vs-card .who .tag { opacity:0.6; font-size:11px; }
.vs-card .msg { font-size:19px; color:#eafcff; line-height:1.12; margin-top:2px; }
.vs-card.glitch .msg { text-shadow:1.5px 0 0 rgba(255,40,80,0.55), -1.5px 0 0 rgba(40,120,255,0.5); animation:vs-flicker 2.2s infinite steps(1); }
.vs-card.glitch .who { text-shadow:1px 0 0 rgba(255,40,80,0.5), -1px 0 0 rgba(40,120,255,0.45); }

.vs-modal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(560px,92vw); max-height:88vh; overflow:auto; pointer-events:auto;
  background:rgba(4,6,16,0.94); border:2px solid rgba(0,255,213,0.5); border-radius:8px;
  box-shadow:0 0 30px rgba(0,255,213,0.28), inset 0 0 40px rgba(0,255,213,0.05);
  padding:22px 24px; animation:vs-modal-in 0.18s ease-out; }
.vs-modal h2 { font-size:26px; letter-spacing:3px; color:#ff5cc8; text-align:center;
  text-shadow:0 0 10px rgba(255,92,200,0.5); margin:0 0 4px; }
.vs-modal .sub { text-align:center; color:#9fb6d6; font-size:16px; margin-bottom:14px; }
.vs-modal .body { font-size:17px; color:#dcefff; line-height:1.35; white-space:pre-wrap; margin-bottom:14px; }
.vs-opt { display:block; width:100%; text-align:left; cursor:pointer;
  background:rgba(0,255,213,0.06); border:1px solid rgba(0,255,213,0.4); border-radius:6px;
  color:#eafcff; font-family:inherit; font-size:18px; letter-spacing:1px;
  padding:10px 14px; margin-bottom:9px; transition:background 0.12s, border-color 0.12s; }
.vs-opt:hover, .vs-opt:focus { background:rgba(0,255,213,0.18); border-color:#00ffd5; outline:none; }
.vs-opt .od { display:block; font-size:14px; color:#9fb6d6; margin-top:2px; letter-spacing:0; }
.vs-stats { display:flex; flex-wrap:wrap; gap:10px 22px; justify-content:center; margin-bottom:16px;
  font-size:17px; color:#7dffe6; }
.vs-stats b { color:#eafcff; }
.vs-row { display:flex; gap:10px; }
.vs-row .vs-opt { margin-bottom:0; text-align:center; }
@media (max-width:600px) {
  .vs-track { width:150px; top:120px; padding:5px 8px; }
  .vs-track .mis { font-size:14px; }
  .vs-track .obj { font-size:12px; }
  .vs-card .msg { font-size:16px; }
  .vs-modal h2 { font-size:20px; }
}
`;

export class StoryHud {
    constructor(container) {
        this._container = container;
        this._injectStyle();

        const root = document.createElement('div');
        root.className = 'vs-root';
        root.innerHTML = `
          <div class="vs-track" style="display:none">
            <div class="ttl">GHOST ROUTE</div>
            <div class="mis">--</div>
            <div class="obj">--</div>
            <div class="vs-meter">
              <div class="lbl"><span>VELA</span><span class="vela-v">--</span></div>
              <div class="vs-bar vela"><i></i></div>
            </div>
            <div class="vs-meter">
              <div class="lbl"><span>ALERT</span><span class="alert-v">--</span></div>
              <div class="vs-bar alert"><i></i></div>
            </div>
            <div class="vs-meter cargo-meter" style="display:none">
              <div class="lbl"><span>CARGO</span><span class="cargo-v">--</span></div>
              <div class="vs-bar cargo"><i></i></div>
            </div>
          </div>
          <div class="vs-cards"></div>
        `;
        this._container.appendChild(root);
        this._root = root;

        this._track = root.querySelector('.vs-track');
        this._el = {
            mis: root.querySelector('.vs-track .mis'),
            obj: root.querySelector('.vs-track .obj'),
            velaFill: root.querySelector('.vs-bar.vela > i'),
            velaV: root.querySelector('.vela-v'),
            alertFill: root.querySelector('.vs-bar.alert > i'),
            alertV: root.querySelector('.alert-v'),
            cargoMeter: root.querySelector('.cargo-meter'),
            cargoFill: root.querySelector('.vs-bar.cargo > i'),
            cargoV: root.querySelector('.cargo-v'),
            cards: root.querySelector('.vs-cards'),
        };
        this._cards = [];
        this._modal = null;
    }

    /* ── tracker ── */

    showTracker() { this._track.style.display = 'block'; }
    hideTracker() { this._track.style.display = 'none'; }

    updateTracker(s) {
        if (!s) return;
        if (s.missionTitle != null) this._el.mis.textContent = `ACT ${s.act} · ${s.missionTitle}`;
        if (s.objectiveLabel != null) this._el.obj.textContent = s.objectiveLabel;
        const vela = Math.round(s.velaIntegrity || 0);
        const alert = Math.round(s.neurodriveAlert || 0);
        this._el.velaFill.style.width = `${vela}%`;
        this._el.velaV.textContent = `${vela}%`;
        this._el.alertFill.style.width = `${alert}%`;
        this._el.alertV.textContent = `${alert}%`;
        if (s.cargoIntegrity != null) {
            this._el.cargoMeter.style.display = 'block';
            const c = Math.round(s.cargoIntegrity);
            this._el.cargoFill.style.width = `${c}%`;
            this._el.cargoV.textContent = `${c}%`;
        } else {
            this._el.cargoMeter.style.display = 'none';
        }
    }

    /* ── dialogue call-cards ── */

    /** speaker: { name, tag, color, glitch }  text: string  durationMs?: number */
    showDialogue(speaker, text, durationMs = 4200) {
        const card = document.createElement('div');
        card.className = 'vs-card' + (speaker.glitch ? ' glitch' : '');
        card.style.borderLeftColor = speaker.color || '#00ffd5';
        const who = document.createElement('div');
        who.className = 'who';
        who.style.color = speaker.color || '#00ffd5';
        who.innerHTML = `<span>${_esc(speaker.name)}</span><span class="tag">${_esc(speaker.tag || '')}</span>`;
        const msg = document.createElement('div');
        msg.className = 'msg';
        msg.textContent = text;
        card.appendChild(who);
        card.appendChild(msg);
        this._el.cards.appendChild(card);

        const entry = { el: card, life: durationMs / 1000 };
        this._cards.push(entry);
        // Cap the visible stack so fast back-to-back lines don't pile up.
        while (this._cards.length > 3) {
            const old = this._cards.shift();
            if (old.el.parentNode) old.el.remove();
        }
    }

    tick(dt) {
        for (let i = this._cards.length - 1; i >= 0; i--) {
            const c = this._cards[i];
            c.life -= dt;
            if (c.life <= 0) {
                c.el.style.transition = 'opacity 0.5s';
                c.el.style.opacity = '0';
                if (c.life < -0.5) { c.el.remove(); this._cards.splice(i, 1); }
            }
        }
    }

    clearDialogue() {
        for (const c of this._cards) { if (c.el.parentNode) c.el.remove(); }
        this._cards = [];
    }

    /* ── modals ── */

    _openModal(node) {
        this.closeModal();
        this._modal = node;
        this._root.appendChild(node);
    }

    closeModal() {
        if (this._modal && this._modal.parentNode) this._modal.remove();
        this._modal = null;
    }

    hasModal() { return !!this._modal; }

    /**
     * Present a branching choice. options: [{ id, label, desc }].
     * onSelect(id) is called once when the player picks.
     */
    showChoice(title, options, onSelect) {
        const m = document.createElement('div');
        m.className = 'vs-modal';
        const h = document.createElement('h2');
        h.textContent = '决策 · DECISION';
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = title || '';
        m.appendChild(h);
        m.appendChild(sub);
        for (const opt of options) {
            const b = document.createElement('button');
            b.className = 'vs-opt';
            b.innerHTML = `${_esc(opt.label)}${opt.desc ? `<span class="od">${_esc(opt.desc)}</span>` : ''}`;
            b.addEventListener('click', () => {
                this.closeModal();
                onSelect(opt.id);
            });
            m.appendChild(b);
        }
        this._openModal(m);
    }

    /** Mission-complete summary. info: {title, credits, evidenceCount, vela, alert}. */
    showMissionComplete(info, onContinue) {
        const m = document.createElement('div');
        m.className = 'vs-modal';
        m.innerHTML = `
          <h2>路线完成 · ROUTE COMPLETE</h2>
          <div class="sub">${_esc(info.title || '')}</div>
          <div class="vs-stats">
            <span>Credits <b>+¥${(info.credits || 0).toLocaleString()}</b></span>
            <span>Evidence <b>${info.evidenceCount || 0}</b></span>
            <span>Vela <b>${Math.round(info.vela || 0)}%</b></span>
            <span>Alert <b>${Math.round(info.alert || 0)}%</b></span>
          </div>
        `;
        const btn = document.createElement('button');
        btn.className = 'vs-opt';
        btn.style.textAlign = 'center';
        btn.textContent = info.lastMission ? '完成战役 · FINISH CAMPAIGN ▸' : '继续 · CONTINUE ▸';
        btn.addEventListener('click', () => { this.closeModal(); onContinue(); });
        m.appendChild(btn);
        this._openModal(m);
    }

    /** Mission-fail panel. */
    showMissionFail(info, onRetry, onMenu) {
        const m = document.createElement('div');
        m.className = 'vs-modal';
        m.style.borderColor = 'rgba(255,60,80,0.55)';
        const h = document.createElement('h2');
        h.style.color = '#ff5a72';
        h.textContent = '路线失败 · ROUTE FAILED';
        m.appendChild(h);
        const body = document.createElement('div');
        body.className = 'body';
        body.style.textAlign = 'center';
        body.textContent = info.failText || 'The route collapsed.';
        m.appendChild(body);
        const row = document.createElement('div');
        row.className = 'vs-row';
        if (info.retryAllowed !== false) {
            const r = document.createElement('button');
            r.className = 'vs-opt';
            r.style.flex = '1';
            r.textContent = '重试 · RETRY';
            r.addEventListener('click', () => { this.closeModal(); onRetry(); });
            row.appendChild(r);
        }
        const mn = document.createElement('button');
        mn.className = 'vs-opt';
        mn.style.flex = '1';
        mn.textContent = '菜单 · STORY MENU';
        mn.addEventListener('click', () => { this.closeModal(); onMenu(); });
        row.appendChild(mn);
        m.appendChild(row);
        this._openModal(m);
    }

    /** Ending reveal: text lines + a single dismiss. lines: [{speaker, text}]. */
    showEnding(ending, onDone) {
        const m = document.createElement('div');
        m.className = 'vs-modal';
        const h = document.createElement('h2');
        h.textContent = ending.title;
        m.appendChild(h);
        const tone = document.createElement('div');
        tone.className = 'sub';
        tone.textContent = ending.tone || '';
        m.appendChild(tone);
        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = ending.outcome || '';
        m.appendChild(body);
        if (Array.isArray(ending.finalText)) {
            for (const ln of ending.finalText) {
                const p = document.createElement('div');
                p.className = 'body';
                p.style.color = '#9ff7ff';
                p.textContent = `${ln.speaker}: ${ln.text}`;
                m.appendChild(p);
            }
        }
        const btn = document.createElement('button');
        btn.className = 'vs-opt';
        btn.style.textAlign = 'center';
        btn.textContent = '结束 · END ▸';
        btn.addEventListener('click', () => { this.closeModal(); onDone(); });
        m.appendChild(btn);
        this._openModal(m);
    }

    /* ── lifecycle ── */

    show() { this._root.style.display = 'block'; }
    hide() {
        this._root.style.display = 'none';
        this.clearDialogue();
        this.closeModal();
    }

    _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    dispose() {
        this.clearDialogue();
        this.closeModal();
        if (this._root) this._root.remove();
        this._root = null;
    }
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
