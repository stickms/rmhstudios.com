// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Mobile Touch Controls
   A floating left-thumb joystick (steer + gas/
   brake) plus right-side DRIFT and EXIT buttons.
   Writes analog values into vehicle.mobileInput.
   Only mounts on touch-capable devices.
   ═══════════════════════════════════════════ */

const STYLE_ID = 'neurodrive-mc-style';
const CSS = `
.nd-mc { position:fixed; inset:0; z-index:320; pointer-events:none;
  font-family:'VT323',monospace; touch-action:none; }
.nd-mc .zone { position:absolute; bottom:0; left:0; width:55%; height:65%; pointer-events:auto; }
.nd-mc .base { position:absolute; width:140px; height:140px; margin:-70px 0 0 -70px;
  border-radius:50%; border:2px solid rgba(0,255,213,0.4);
  background:radial-gradient(circle, rgba(0,255,213,0.08), rgba(4,8,18,0.35));
  display:none; }
.nd-mc .knob { position:absolute; width:64px; height:64px; margin:-32px 0 0 -32px;
  border-radius:50%; border:2px solid rgba(0,255,213,0.8);
  background:radial-gradient(circle, rgba(0,255,213,0.5), rgba(0,255,213,0.12));
  box-shadow:0 0 14px rgba(0,255,213,0.5); }
.nd-mc .btn { position:absolute; pointer-events:auto; border-radius:50%;
  display:flex; align-items:center; justify-content:center; text-align:center;
  color:#cfe9ff; font-size:18px; letter-spacing:1px; user-select:none;
  background:rgba(4,8,18,0.5); border:2px solid rgba(0,255,213,0.4);
  text-shadow:0 0 6px rgba(0,255,213,0.4); }
.nd-mc .btn:active, .nd-mc .btn.on { background:rgba(0,255,213,0.25); border-color:rgba(0,255,213,0.9); }
.nd-mc .drift { right:24px; bottom:32px; width:104px; height:104px; font-size:22px;
  border-color:rgba(255,210,63,0.6); color:#ffd23f; }
.nd-mc .drift:active, .nd-mc .drift.on { background:rgba(255,210,63,0.22); }
.nd-mc .gas { right:40px; bottom:150px; width:80px; height:80px;
  border-color:rgba(57,255,20,0.55); color:#7dffae; }
.nd-mc .exit { top:12px; right:12px; width:54px; height:54px; font-size:15px;
  border-color:rgba(255,90,114,0.6); color:#ff8095; }
.nd-mc .hint { position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
  font-size:14px; color:rgba(150,180,210,0.6); pointer-events:none; white-space:nowrap; }
`;

export class MobileControls {
    static isTouch() {
        return typeof window !== 'undefined' &&
            (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
    }

    constructor(container, vehicle, opts = {}) {
        this._container = container;
        this.vehicle = vehicle;
        this.onExit = opts.onExit || (() => {});
        this._radius = 60;            // px deflection for full input
        this._deadzone = 0.12;
        this._joyId = null;
        this._gasHeld = false;
        this._injectStyle();

        const root = document.createElement('div');
        root.className = 'nd-mc';
        root.innerHTML = `
          <div class="zone"></div>
          <div class="base"><div class="knob"></div></div>
          <button class="btn drift" type="button">DRIFT</button>
          <button class="btn gas" type="button">GAS</button>
          <button class="btn exit" type="button">EXIT</button>
          <div class="hint">左摇杆转向/油门 · DRIFT 漂移 · GAS 自动加速</div>
        `;
        container.appendChild(root);
        this._root = root;
        this._zone = root.querySelector('.zone');
        this._base = root.querySelector('.base');
        this._knob = root.querySelector('.knob');
        this._driftBtn = root.querySelector('.drift');
        this._gasBtn = root.querySelector('.gas');
        this._exitBtn = root.querySelector('.exit');

        this._bind();
        this.vehicle.mobileInput.active = true;
    }

    _bind() {
        // ── Joystick (floating within the left zone) ──
        this._onZoneDown = (e) => {
            if (this._joyId !== null) return;
            e.preventDefault();
            this._joyId = e.pointerId;
            this._origin = { x: e.clientX, y: e.clientY };
            this._base.style.left = `${e.clientX}px`;
            this._base.style.top = `${e.clientY}px`;
            this._base.style.display = 'block';
            this._knob.style.left = '50%';
            this._knob.style.top = '50%';
            try { this._zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        };
        this._onZoneMove = (e) => {
            if (e.pointerId !== this._joyId) return;
            e.preventDefault();
            let dx = e.clientX - this._origin.x;
            let dy = e.clientY - this._origin.y;
            const len = Math.hypot(dx, dy);
            const max = this._radius;
            if (len > max) { dx = dx / len * max; dy = dy / len * max; }
            this._knob.style.left = `${70 + dx}px`;
            this._knob.style.top = `${70 + dy}px`;

            const nx = dx / max;
            const ny = dy / max;
            // steer: finger right (nx>0) → steer right → negative (matches keys)
            const steer = Math.abs(nx) > this._deadzone ? -nx : 0;
            // throttle up / brake down
            let throttle = 0, brake = 0;
            if (-ny > this._deadzone) throttle = Math.min(1, -ny);
            else if (ny > this._deadzone) brake = Math.min(1, ny);

            const mi = this.vehicle.mobileInput;
            mi.steer = steer;
            // GAS button forces full throttle if held and joystick isn't braking
            if (this._gasHeld && brake === 0) throttle = 1;
            mi.throttle = throttle;
            mi.brake = brake;
        };
        this._onZoneUp = (e) => {
            if (e.pointerId !== this._joyId) return;
            this._joyId = null;
            this._base.style.display = 'none';
            const mi = this.vehicle.mobileInput;
            mi.steer = 0;
            mi.throttle = this._gasHeld ? 1 : 0;
            mi.brake = 0;
            try { this._zone.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        };
        this._zone.addEventListener('pointerdown', this._onZoneDown);
        this._zone.addEventListener('pointermove', this._onZoneMove);
        this._zone.addEventListener('pointerup', this._onZoneUp);
        this._zone.addEventListener('pointercancel', this._onZoneUp);

        // ── DRIFT button (hold = handbrake) ──
        this._onDriftDown = (e) => { e.preventDefault(); this.vehicle.mobileInput.handbrake = true; this._driftBtn.classList.add('on'); };
        this._onDriftUp = (e) => { e.preventDefault(); this.vehicle.mobileInput.handbrake = false; this._driftBtn.classList.remove('on'); };
        this._driftBtn.addEventListener('pointerdown', this._onDriftDown);
        this._driftBtn.addEventListener('pointerup', this._onDriftUp);
        this._driftBtn.addEventListener('pointercancel', this._onDriftUp);
        this._driftBtn.addEventListener('pointerleave', this._onDriftUp);

        // ── GAS button (hold = auto throttle, frees the thumb for steering) ──
        this._onGasDown = (e) => { e.preventDefault(); this._gasHeld = true; this.vehicle.mobileInput.throttle = 1; this._gasBtn.classList.add('on'); };
        this._onGasUp = (e) => { e.preventDefault(); this._gasHeld = false; if (this._joyId === null) this.vehicle.mobileInput.throttle = 0; this._gasBtn.classList.remove('on'); };
        this._gasBtn.addEventListener('pointerdown', this._onGasDown);
        this._gasBtn.addEventListener('pointerup', this._onGasUp);
        this._gasBtn.addEventListener('pointercancel', this._onGasUp);
        this._gasBtn.addEventListener('pointerleave', this._onGasUp);

        // ── EXIT button ──
        this._onExit = (e) => { e.preventDefault(); this.onExit(); };
        this._exitBtn.addEventListener('pointerup', this._onExit);
    }

    show() { if (this._root) this._root.style.display = 'block'; }
    hide() {
        if (this._root) this._root.style.display = 'none';
        this._resetInput();
    }

    _resetInput() {
        const mi = this.vehicle.mobileInput;
        mi.steer = 0; mi.throttle = 0; mi.brake = 0; mi.handbrake = false;
        this._gasHeld = false;
        this._joyId = null;
        if (this._base) this._base.style.display = 'none';
    }

    _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    dispose() {
        this._resetInput();
        if (this.vehicle && this.vehicle.mobileInput) this.vehicle.mobileInput.active = false;
        if (this._root) this._root.remove();
        this._root = null;
    }
}
