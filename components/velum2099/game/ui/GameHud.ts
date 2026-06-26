// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Gameplay HUD
   DOM overlay showing the active objective,
   directional pointer, credits, wanted level,
   speed, pursuit bar and event toasts.
   ═══════════════════════════════════════════ */

const STYLE_ID = 'neurodrive-hud-style';
const CSS = `
@keyframes nd-toast-in { from { opacity:0; transform:translateY(-8px) scale(0.96);} to { opacity:1; transform:none;} }
.nd-hud { position:fixed; inset:0; z-index:300; pointer-events:none;
  font-family:'VT323','Noto Sans SC',monospace; color:#cfe9ff; }
.nd-hud .nd-panel { position:absolute; background:rgba(4,8,18,0.55);
  border:1px solid rgba(0,255,213,0.35); border-radius:6px; padding:6px 12px;
  text-shadow:0 0 6px rgba(0,255,213,0.35); backdrop-filter:blur(2px); }
.nd-credits { top:46px; right:12px; text-align:right; min-width:150px; }
.nd-credits .amt { font-size:30px; color:#7dffe6; letter-spacing:1px; line-height:1; }
.nd-credits .best { font-size:14px; color:#6f86a6; }
.nd-credits .wanted { font-size:20px; letter-spacing:3px; margin-top:2px; }
.nd-obj { top:14px; left:50%; transform:translateX(-50%); text-align:center; min-width:240px; }
.nd-obj .lbl { font-size:18px; color:#9fb6d6; letter-spacing:2px; }
.nd-obj .row { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:2px; }
.nd-obj .arrow { font-size:26px; color:#00ffd5; line-height:1; transition:transform 0.08s linear; }
.nd-obj .dist { font-size:26px; color:#eafcff; }
.nd-timebar { height:6px; margin-top:6px; background:rgba(255,255,255,0.12); border-radius:3px; overflow:hidden; }
.nd-timebar > i { display:block; height:100%; width:100%; background:linear-gradient(90deg,#00ffd5,#ffd23f); transition:width 0.1s linear; }
.nd-timebar.warn > i { background:linear-gradient(90deg,#ff6b3f,#ff1133); }
.nd-speed { bottom:14px; right:14px; text-align:right; }
.nd-speed .v { font-size:34px; color:#eafcff; line-height:0.9; }
.nd-speed .u { font-size:13px; color:#6f86a6; letter-spacing:2px; }
.nd-weapon { bottom:62px; right:14px; width:128px; text-align:right; padding:4px 8px; }
.nd-weapon .lbl { font-size:13px; color:#9fb6d6; letter-spacing:1px; }
.nd-weapon.over .lbl { color:#ff5a72; }
.nd-wbar { height:6px; margin-top:3px; background:rgba(255,255,255,0.12); border-radius:3px; overflow:hidden; }
.nd-wbar > i { display:block; height:100%; width:0; background:linear-gradient(90deg,#39ff14,#ffd23f,#ff3b5c); transition:width 0.08s linear; }
.nd-wbar.over > i { background:#ff3b5c; }
.nd-pursuit { bottom:64px; left:50%; transform:translateX(-50%); text-align:center; min-width:260px;
  border-color:rgba(255,40,60,0.6); }
.nd-pursuit .ttl { font-size:18px; color:#ff5a72; letter-spacing:2px; }
.nd-pbar { height:8px; margin-top:5px; background:rgba(255,255,255,0.12); border-radius:4px; overflow:hidden; }
.nd-pbar > i { display:block; height:100%; width:0; transition:width 0.1s linear; }
.nd-pbar.bust > i { background:linear-gradient(90deg,#ff1133,#ff6b3f); }
.nd-pbar.esc > i { background:linear-gradient(90deg,#00ffd5,#39ff14); }
.nd-toasts { position:absolute; top:120px; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; gap:6px; align-items:center; width:min(92vw,560px); }
.nd-toast { padding:7px 16px; border-radius:6px; font-size:20px; letter-spacing:1px;
  background:rgba(4,8,18,0.78); border:1px solid rgba(0,255,213,0.4);
  animation:nd-toast-in 0.18s ease-out; text-align:center; }
.nd-toast.good { color:#7dffae; border-color:rgba(57,255,20,0.5); text-shadow:0 0 8px rgba(57,255,20,0.4); }
.nd-toast.bad  { color:#ff8095; border-color:rgba(255,40,60,0.55); text-shadow:0 0 8px rgba(255,40,60,0.4); }
.nd-toast.info { color:#7dd6ff; }

@media (max-width:600px) {
  .nd-obj { min-width:0; max-width:58vw; }
  .nd-obj .lbl { font-size:14px; }
  .nd-obj .row { gap:6px; }
  .nd-obj .arrow, .nd-obj .dist { font-size:20px; }
  .nd-credits { min-width:0; padding:4px 8px; }
  .nd-credits .amt { font-size:22px; }
  .nd-credits .best { font-size:12px; }
  .nd-credits .wanted { font-size:16px; }
  .nd-speed .v { font-size:26px; }
  .nd-weapon { width:104px; bottom:54px; }
  .nd-toasts { top:96px; width:94vw; }
  .nd-toast { font-size:15px; padding:5px 10px; }
  .nd-pursuit { min-width:0; max-width:80vw; bottom:118px; }
  .nd-pursuit .ttl { font-size:14px; }
}
`;

export class GameHud {
    constructor(container) {
        this._container = container;
        this._injectStyle();

        const root = document.createElement('div');
        root.className = 'nd-hud';
        root.innerHTML = `
          <div class="nd-panel nd-obj">
            <div class="lbl">OBJECTIVE</div>
            <div class="row"><span class="arrow">▲</span><span class="dist">--</span></div>
            <div class="nd-timebar" style="display:none"><i></i></div>
          </div>
          <div class="nd-panel nd-credits">
            <div class="amt">¥0</div>
            <div class="best">BEST ¥0</div>
            <div class="wanted"></div>
          </div>
          <div class="nd-panel nd-speed">
            <span class="v">0</span><span class="u"> KM/H</span>
          </div>
          <div class="nd-panel nd-weapon" style="display:none">
            <div class="lbl">LASER</div>
            <div class="nd-wbar"><i></i></div>
          </div>
          <div class="nd-panel nd-pursuit" style="display:none">
            <div class="ttl">⚠ POLICE PURSUIT</div>
            <div class="nd-pbar"><i></i></div>
          </div>
          <div class="nd-toasts"></div>
        `;
        this._container.appendChild(root);
        this._root = root;

        this._el = {
            objLbl: root.querySelector('.nd-obj .lbl'),
            arrow: root.querySelector('.nd-obj .arrow'),
            dist: root.querySelector('.nd-obj .dist'),
            timebar: root.querySelector('.nd-obj .nd-timebar'),
            timebarFill: root.querySelector('.nd-obj .nd-timebar > i'),
            credits: root.querySelector('.nd-credits .amt'),
            best: root.querySelector('.nd-credits .best'),
            wanted: root.querySelector('.nd-credits .wanted'),
            speed: root.querySelector('.nd-speed .v'),
            weapon: root.querySelector('.nd-weapon'),
            weaponBar: root.querySelector('.nd-weapon .nd-wbar'),
            weaponFill: root.querySelector('.nd-weapon .nd-wbar > i'),
            weaponLbl: root.querySelector('.nd-weapon .lbl'),
            pursuit: root.querySelector('.nd-pursuit'),
            pursuitTtl: root.querySelector('.nd-pursuit .ttl'),
            pbar: root.querySelector('.nd-pursuit .nd-pbar'),
            pbarFill: root.querySelector('.nd-pursuit .nd-pbar > i'),
            toasts: root.querySelector('.nd-toasts'),
        };
        this._toasts = [];
    }

    show() { this._root.style.display = 'block'; }
    hide() { this._root.style.display = 'none'; }

    update(state, weapon) {
        const e = this._el;

        // Weapon heat gauge
        if (weapon) {
            e.weapon.style.display = 'block';
            const over = !!weapon.overheated;
            e.weapon.classList.toggle('over', over);
            e.weaponBar.classList.toggle('over', over);
            e.weaponLbl.textContent = over ? 'OVERHEAT' : 'LASER';
            e.weaponFill.style.width = `${Math.min(1, weapon.heat) * 100}%`;
        } else {
            e.weapon.style.display = 'none';
        }

        // Objective + pointer
        e.objLbl.textContent = state.objective;
        if (state.distance != null) {
            e.dist.textContent = `${Math.round(state.distance)}m`;
            e.arrow.style.transform = `rotate(${state.bearing}rad)`;
            e.arrow.style.visibility = 'visible';
        } else {
            e.dist.textContent = '...';
            e.arrow.style.visibility = 'hidden';
        }

        // Delivery timer
        if (state.timeLeft != null && state.timeMax) {
            const frac = Math.max(0, Math.min(1, state.timeLeft / state.timeMax));
            e.timebar.style.display = 'block';
            e.timebarFill.style.width = `${frac * 100}%`;
            e.timebar.classList.toggle('warn', state.timeLeft < 8);
            e.dist.textContent = `${Math.round(state.distance)}m · ${Math.ceil(state.timeLeft)}s`;
        } else {
            e.timebar.style.display = 'none';
        }

        // Credits / wanted
        e.credits.textContent = `¥${state.credits.toLocaleString()}`;
        e.best.textContent = `BEST ¥${state.best.toLocaleString()}`;
        if (state.heat > 0) {
            e.wanted.style.color = '#ff5a72';
            e.wanted.textContent = '★'.repeat(state.heat) + '☆'.repeat(Math.max(0, 5 - state.heat));
        } else {
            e.wanted.textContent = '';
        }

        // Speed
        e.speed.textContent = Math.round(state.speedKmh);

        // Pursuit bar
        if (state.police > 0) {
            e.pursuit.style.display = 'block';
            if (state.escapeProgress > state.bustProgress && state.escapeProgress > 0) {
                e.pursuitTtl.textContent = '↑ LOSING THEM — KEEP GOING';
                e.pbar.className = 'nd-pbar esc';
                e.pbarFill.style.width = `${state.escapeProgress * 100}%`;
            } else {
                e.pursuitTtl.textContent = `⚠ POLICE PURSUIT — ${state.police} UNIT${state.police > 1 ? 'S' : ''}`;
                e.pbar.className = 'nd-pbar bust';
                e.pbarFill.style.width = `${state.bustProgress * 100}%`;
            }
        } else {
            e.pursuit.style.display = 'none';
        }
    }

    toast(text, kind = 'info') {
        const el = document.createElement('div');
        el.className = `nd-toast ${kind}`;
        el.textContent = text;
        this._el.toasts.appendChild(el);
        const entry = { el, life: 3.4 };
        this._toasts.push(entry);
        // Cap visible toasts
        while (this._toasts.length > 4) {
            const old = this._toasts.shift();
            old.el.remove();
        }
    }

    tickToasts(dt) {
        for (let i = this._toasts.length - 1; i >= 0; i--) {
            const t = this._toasts[i];
            t.life -= dt;
            if (t.life <= 0) {
                t.el.style.transition = 'opacity 0.4s';
                t.el.style.opacity = '0';
                if (t.life < -0.4) { t.el.remove(); this._toasts.splice(i, 1); }
            }
        }
    }

    _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    dispose() {
        if (this._root) this._root.remove();
        this._root = null;
        this._toasts = [];
    }
}
