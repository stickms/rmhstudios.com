// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM2099: GHOST ROUTE — Story Engine
   Interprets the declarative campaign data over
   the existing systems (CyberpunkScene, Vehicle,
   MissionManager pursuit/weapon, GameHud). It owns
   its own world markers (beacons, gates, zones,
   checkpoints), drives objectives, fires dialogue
   on triggers, and applies rewards to the save.

   Free Roam is untouched: this only runs when the
   player launches a story mission, and it puts the
   MissionManager into "story mode" so it stops
   auto-offering courier fares.
   ═══════════════════════════════════════════ */

import {
    Group, Mesh, CylinderGeometry, RingGeometry, TorusGeometry, CircleGeometry,
    BoxGeometry, MeshBasicMaterial, DoubleSide, AdditiveBlending,
} from 'three';

import { StoryHud } from './StoryHud';
import { SPEAKERS, ENDINGS, getMission } from './StoryData';

const ARRIVE = 9;          // XZ radius that counts as "reached" a beacon
const GATE_PASS = 8;       // radius to count an anomaly gate as driven-through
const HOLD_RADIUS = 13;    // radius for signal-hold objectives
const CAPTURE_RADIUS = 15; // radius to capture an evidence frame

const TARGET_COLORS = {
    pickup: 0x00ffd5, dropoff: 0xff2bd0, safehouse: 0xb98cff,
    dataNode: 0x39ff14, rival: 0xff8a3c, police: 0xff3b5c, cityCore: 0x9ff7ff,
};

export class StoryManager {
    /**
     * @param scene CyberpunkScene
     * @param vehicle Vehicle
     * @param mission MissionManager (pursuit + weapon + credits HUD source)
     * @param save StorySave
     * @param opts { container, gameHud, onExit() }
     */
    constructor(scene, vehicle, mission, save, opts = {}) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.mission = mission;
        this.save = save;
        this.onExit = opts.onExit || (() => {});
        this.gameHud = opts.gameHud || null;

        this.hud = new StoryHud(opts.container || document.body);

        this.missionId = null;
        this.data = null;            // mission data
        this.objectives = [];
        this.objIndex = 0;
        this.current = null;         // runtime objective
        this.state = 'idle';         // 'idle' | 'running' | 'awaitChoice' | 'done' | 'failed'

        this._markers = [];          // THREE objects to dispose on teardown
        this._beaconT = 0;
        this._clock = 0;
        this._dialogueQueue = [];
        this._fired = new Set();

        this.cargoIntegrity = 100;
        this.carrying = false;
        this._cargoCd = 0;
        this._firstClear = true;     // is this the player's first completion of the mission?
        this._creditsThisRun = 0;    // credits actually granted this run (for the summary panel)

        // one-shot pursuit flags set from MissionManager events
        this._escapedFlag = false;
        this._bustedFlag = false;
        this._killTally = 0;

        // C key = capture an evidence frame (scanArea objectives)
        this._capturePressed = false;
        this._keyHandler = (e) => {
            if (e.code === 'KeyC') this._capturePressed = true;
        };
        window.addEventListener('keydown', this._keyHandler);
    }

    /* ═══ lifecycle ═══ */

    startMission(missionId) {
        const m = getMission(missionId);
        if (!m) { this.onExit(); return; }

        this._teardownMarkers();
        this.hud.closeModal();
        this.hud.clearDialogue();

        this.missionId = missionId;
        this.data = m;
        // Rewards, stat deltas and progression only apply on the FIRST completion;
        // Chapter-Select replays are practice runs that never mutate the save.
        this._firstClear = !this.save.isCompleted(missionId);
        this._creditsThisRun = 0;
        this.objectives = m.objectives || [];
        this.objIndex = 0;
        this.current = null;
        this.cargoIntegrity = 100;
        this.carrying = false;
        this._clock = 0;
        this._dialogueQueue = [];
        this._fired = new Set();
        this._escapedFlag = false;
        this._bustedFlag = false;
        this._killTally = 0;

        // Put the pursuit system under story control.
        this.mission.setStoryMode(true);
        this.mission.clearPursuit();
        this.mission.target = null;
        this.mission.onEvent = (type, payload) => this._onMissionEvent(type, payload);

        this.hud.show();
        this.hud.showTracker();
        this.save.setCurrentMission(missionId, m.act);

        this._fireTrigger('missionStart', null);
        this.state = 'running';
        this._beginObjective(0);
        this._refreshTracker();
    }

    /** Restart the current mission in place (from the fail panel). */
    _retry() {
        if (this.missionId) this.startMission(this.missionId);
    }

    dispose() {
        if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
        this._teardownMarkers();
        if (this.mission) { this.mission.onEvent = null; this.mission.target = null; }
        if (this.hud) { this.hud.dispose(); this.hud = null; }
    }

    /* ═══ per-frame ═══ */

    update(dt) {
        this._clock += dt;
        this._drainDialogue();
        if (this.hud) this.hud.tick(dt);
        this._animateMarkers(dt);

        if (this.state !== 'running') { this._refreshTracker(); return; }

        const status = this._updateObjective(dt);
        if (status === 'complete') {
            this._fireTrigger('objectiveComplete', this.current ? this.current.id : null);
            this._teardownCurrentMarkers();
            this.mission.target = null;
            this._beginObjective(this.objIndex + 1);
        } else if (status === 'failed') {
            this._failMission();
        }
        // Consume any unhandled capture press so it can't bank across objectives.
        this._capturePressed = false;
        this._refreshTracker();
    }

    /** Called from the main loop with the vehicle's collisions this frame. */
    reportCollisions(collisions) {
        if (!this.carrying || !collisions || !collisions.length) return;
        if (this._cargoCd > 0) return;
        for (const c of collisions) {
            if (c.type === 'traffic' || c.type === 'police') {
                this.cargoIntegrity = Math.max(0, this.cargoIntegrity - 9);
                this._cargoCd = 0.8;
                break;
            }
        }
    }

    /** HUD payload: reuse the MissionManager state, override objective/timer. */
    getHudState() {
        const s = this.mission.getState();
        s.objective = this._objectiveLabel();
        if (this.current && this.current.timer != null) {
            s.timeLeft = this.current.timer;
            s.timeMax = this.current.timerMax;
        } else {
            s.timeLeft = null;
            s.timeMax = null;
        }
        return s;
    }

    /* ═══ objectives ═══ */

    _beginObjective(i) {
        if (i >= this.objectives.length) { this._completeMission(); return; }
        this.objIndex = i;
        // Reset one-shot pursuit flags so each objective only reacts to escapes/
        // busts that happen DURING it (otherwise a latched flag from a prior
        // objective makes the next escape complete — or failOnBust fail — instantly).
        this._escapedFlag = false;
        this._bustedFlag = false;
        const o = this.objectives[i];
        this.current = this._setupObjective(o);
        this._fireTrigger('objectiveStart', o.id);
    }

    _setupObjective(o) {
        const c = {
            id: o.id, type: o.type, label: o.label,
            need: o.requiredCount || 1, got: 0,
            holdSec: o.holdSec || 6, held: 0,
            timer: null, timerMax: null, timerLowFired: false,
            failOnBust: o.failOnBust === true,
            failOnTimeout: o.failOnTimeout === true,
            beacons: [], zones: [], target: null, raceIdx: 0, ghost: null,
            color: this._colorFor(o.target),
            colorKey: o.target,
            _zoneSpawnT: 0, _ghostT: 0,
        };
        const type = o.type;

        if (type === 'choice' || type === 'ending') {
            this.state = 'awaitChoice';
            this.mission.target = null;
            if (type === 'ending') this._openEndingChoice();
            else this._openChoice(o);
            return c;
        }

        if (type === 'escapePolice') {
            this.mission.commandWanted(o.wantedLevel || 3, '通缉升级 · WANTED UP');
            this.mission.target = null;
            return c;
        }

        if (type === 'surviveTimer') {
            if (o.wantedLevel) this.mission.commandWanted(o.wantedLevel, '通缉升级 · WANTED UP');
            c.timer = o.timeLimitSec || 60;
            c.timerMax = c.timer;
            this.mission.target = null;
            return c;
        }

        if (type === 'destroyTargets') {
            this._killTally = 0;
            this.mission.commandWanted(o.wantedLevel || 2, '通缉升级 · WANTED UP');
            this.mission.target = null;
            return c;
        }

        if (type === 'pickupCargo' || type === 'driveToPoint' || type === 'deliverCargo') {
            const t = this._placeTargetNear(o.distanceMin, o.distanceMax);
            c.target = t;
            c.beacons = [this._spawnBeacon(t, c.color)];
            if (type === 'deliverCargo') {
                c.timer = o.timeLimitSec || this._timeBudget(t);
                c.timerMax = c.timer;
            }
            this._setMissionTarget(t, c.color);
            return c;
        }

        if (type === 'holdSignal' || type === 'collectFragments' || type === 'scanArea') {
            for (let k = 0; k < c.need; k++) {
                const t = this._placeTargetNear(o.distanceMin, o.distanceMax);
                c.beacons.push({ pos: t, mesh: this._spawnBeacon(t, c.color), done: false });
            }
            this._aimAtNearestBeacon(c);
            return c;
        }

        if (type === 'anomalyGates') {
            const g = this._spawnGateAhead(c.color);
            c.beacons = [g];
            this._setMissionTarget(g.pos, c.color);
            return c;
        }

        if (type === 'raceRival') {
            // Lay checkpoints out ahead in a rough chain.
            let from = { x: this.vehicle.position.x, z: this.vehicle.position.z };
            for (let k = 0; k < c.need; k++) {
                const t = this.scene.findRoadTarget(from.x, from.z, o.distanceMin || 60, o.distanceMax || 150)
                    || this._placeTargetNear(o.distanceMin, o.distanceMax);
                c.beacons.push({ pos: t, mesh: this._spawnCheckpoint(t, c.color), done: false });
                from = t;
            }
            c.timer = o.timeLimitSec || 80;
            c.timerMax = c.timer;
            c.ghost = this._spawnGhost(c.color);
            if (c.beacons[0]) this._setMissionTarget(c.beacons[0].pos, c.color);
            return c;
        }

        if (type === 'avoidPrediction') {
            c.timer = o.timeLimitSec || 40;
            c.timerMax = c.timer;
            this.mission.target = null;
            return c;
        }

        // Unknown type — fall back to a simple drive-to-point so it never soft-locks.
        const t = this._placeTargetNear(o.distanceMin, o.distanceMax);
        c.target = t;
        c.beacons = [this._spawnBeacon(t, c.color)];
        this._setMissionTarget(t, c.color);
        return c;
    }

    _updateObjective(dt) {
        const c = this.current;
        if (!c) return 'active';
        if (this._cargoCd > 0) this._cargoCd -= dt;

        // shared timer countdown
        if (c.timer != null) {
            c.timer -= dt;
            if (!c.timerLowFired && c.timer <= 8 && c.timer > 0) {
                c.timerLowFired = true;
                this._fireTrigger('timerLow', c.id);
            }
        }

        switch (c.type) {
            case 'escapePolice':
                if (this._bustedFlag && c.failOnBust) return 'failed';
                if (this._escapedFlag) return 'complete';
                return 'active';

            case 'surviveTimer':
                if (this._bustedFlag && c.failOnBust) return 'failed';
                if (c.timer <= 0) { this.mission.clearPursuit(); return 'complete'; }
                return 'active';

            case 'destroyTargets':
                if (this._killTally >= c.need) { this.mission.clearPursuit(); return 'complete'; }
                return 'active';

            case 'pickupCargo':
            case 'driveToPoint':
            case 'deliverCargo': {
                if (c.timer != null && c.timer <= 0 && c.failOnTimeout) return 'failed';
                if (this._withinXZ(c.target, ARRIVE)) {
                    if (c.type === 'pickupCargo') { this.carrying = true; this.cargoIntegrity = 100; }
                    if (c.type === 'deliverCargo') this.carrying = false;
                    return 'complete';
                }
                return 'active';
            }

            case 'collectFragments':
            case 'holdSignal':
            case 'scanArea': {
                const active = this._activeBeacon(c);
                if (!active) return 'complete';
                this._setMissionTarget(active.pos, c.color);
                const near = this._withinXZ(active.pos, c.type === 'scanArea' ? CAPTURE_RADIUS : (c.type === 'holdSignal' ? HOLD_RADIUS : ARRIVE));

                if (c.type === 'collectFragments') {
                    if (near) { this._consumeBeacon(c, active); }
                } else if (c.type === 'holdSignal') {
                    if (near) {
                        c.held += dt;
                        if (c.held >= c.holdSec) { c.held = 0; this._consumeBeacon(c, active); this._toast('信号稳定 · SIGNAL LOCKED', 'good'); }
                    } else if (c.held > 0) {
                        c.held = Math.max(0, c.held - dt * 0.5);
                    }
                } else if (c.type === 'scanArea') {
                    if (near) {
                        // Capture instantly on C (desktop) or after a short dwell so
                        // touch players with no keyboard can still complete the scan.
                        c.held += dt;
                        if (this._capturePressed || c.held >= 1.6) {
                            c.held = 0;
                            this._consumeBeacon(c, active);
                            this._toast(`证据帧已捕获 · EVIDENCE FRAME ${c.got}/${c.need}`, 'good');
                        }
                    } else {
                        c.held = 0;
                    }
                }
                this._capturePressed = false;
                if (c.got >= c.need) return 'complete';
                return 'active';
            }

            case 'anomalyGates': {
                const gate = c.beacons[0];
                if (gate && this._withinXZ(gate.pos, GATE_PASS)) {
                    c.got++;
                    this._removeMarker(gate.mesh);
                    c.beacons = [];
                    if (c.got >= c.need) { this.mission.target = null; return 'complete'; }
                    const g = this._spawnGateAhead(c.color);
                    c.beacons = [g];
                    this._setMissionTarget(g.pos, c.color);
                }
                return 'active';
            }

            case 'raceRival': {
                this._updateGhost(c, dt);
                const cp = c.beacons[c.raceIdx];
                if (cp) {
                    this._setMissionTarget(cp.pos, c.color);
                    if (this._withinXZ(cp.pos, ARRIVE + 2)) {
                        cp.done = true;
                        this._removeMarker(cp.mesh);
                        c.raceIdx++;
                    }
                }
                if (c.raceIdx >= c.need) { this._toast('胜出 · RACE WON', 'good'); return 'complete'; }
                if (c.timer <= 0) { this._toast('时间到 — 但你活下来了 · TIME UP', 'info'); return 'complete'; }
                return 'active';
            }

            case 'avoidPrediction':
                this._updatePredictionZones(c, dt);
                if (c.timer <= 0) return 'complete';
                return 'active';

            default:
                // fallback drive-to-point
                if (c.target && this._withinXZ(c.target, ARRIVE)) return 'complete';
                return 'active';
        }
    }

    _objectiveLabel() {
        const c = this.current;
        if (!c) return this.state === 'done' ? '完成 · COMPLETE' : '...';
        let label = c.label || '...';
        if (c.type === 'collectFragments' || c.type === 'scanArea') label += `  (${c.got}/${c.need})`;
        else if (c.type === 'anomalyGates') label += `  (${c.got}/${c.need})`;
        else if (c.type === 'holdSignal' && c.need > 1) label += `  (${c.got}/${c.need})`;
        else if (c.type === 'destroyTargets') label += `  (${this._killTally}/${c.need})`;
        else if (c.type === 'raceRival') label += `  (${c.raceIdx}/${c.need})`;
        return label;
    }

    /* ═══ choices ═══ */

    _openChoice(o) {
        const options = (o.choices || []).map(ch => ({ id: ch.id, label: ch.label, desc: ch.desc }));
        this.hud.showChoice(o.label || 'Choose', options, (id) => {
            const choice = (o.choices || []).find(ch => ch.id === id);
            if (choice) this._applyChoiceResult(choice.result);
            this.state = 'running';
            this._teardownCurrentMarkers();
            this.mission.target = null;
            this._fireTrigger('objectiveComplete', o.id);
            this._beginObjective(this.objIndex + 1);
        });
    }

    _applyChoiceResult(r) {
        if (!r) return;
        // Persist choice effects only on first clear — replays don't farm stats or
        // rewrite recorded choices. The toast still shows for run feedback.
        if (this._firstClear) {
            if (r.key !== undefined) this.save.setChoice(r.key, r.value);
            if (r.credits) {
                this.mission.credits = Math.max(0, this.mission.credits + r.credits);
                this.save.addCredits(Math.max(0, r.credits));
                if (r.credits > 0) this._creditsThisRun += r.credits;
            }
            if (r.velaIntegrityDelta) this.save.adjustVela(r.velaIntegrityDelta);
            if (r.neurodriveAlertDelta) this.save.adjustAlert(r.neurodriveAlertDelta);
            if (r.factionRepDelta) for (const f in r.factionRepDelta) this.save.adjustRep(f, r.factionRepDelta[f]);
            if (Array.isArray(r.evidence)) for (const e of r.evidence) this.save.addEvidence(e);
            this.save.flush();
        }
        if (r.toast) this._toast(r.toast, r.toastKind || 'info');
    }

    _openEndingChoice() {
        const avail = ENDINGS.filter(e => { try { return e.available(this.save.data); } catch { return false; } });
        const list = avail.length ? avail : [ENDINGS[ENDINGS.length - 1]];
        const options = list.map(e => ({ id: e.id, label: e.title, desc: e.tone }));
        this.hud.showChoice('Choose the fate of Velum', options, (id) => {
            const ending = ENDINGS.find(e => e.id === id) || list[0];
            this._resolveEnding(ending);
        });
    }

    _resolveEnding(ending) {
        if (ending.id === 'C_sell') this.save.setChoice('finalSell', true);
        this.save.unlockEnding(ending.id);
        if (ending.palette) this.save.unlockPalette(ending.palette);
        if (ending.skin) this.save.unlockSkin(ending.skin);
        this.save.flush();
        this.mission.clearPursuit();
        this.state = 'done';
        this.hud.showEnding(ending, () => {
            // Mark the finale mission complete and return to the menu.
            this.save.completeMission(this.missionId, []);
            this.onExit();
        });
    }

    /* ═══ mission resolution ═══ */

    _completeMission() {
        this.state = 'done';
        this.mission.clearPursuit();
        this.mission.target = null;

        const r = this.data.rewards || {};
        const nextIds = this.data.unlocks || r.unlocks || [];
        // Grant rewards + advance progression only on first clear; replays are practice.
        if (this._firstClear) {
            if (r.credits) {
                this.mission.credits = Math.max(0, this.mission.credits + r.credits);
                this.save.addCredits(r.credits);
                if (r.credits > 0) this._creditsThisRun += r.credits;
            }
            if (Array.isArray(r.evidence)) for (const e of r.evidence) this.save.addEvidence(e);
            if (r.velaIntegrityDelta) this.save.adjustVela(r.velaIntegrityDelta);
            if (r.neurodriveAlertDelta) this.save.adjustAlert(r.neurodriveAlertDelta);
            if (r.factionRepDelta) for (const f in r.factionRepDelta) this.save.adjustRep(f, r.factionRepDelta[f]);
            if (r.palette) this.save.unlockPalette(r.palette);
            if (r.skin) this.save.unlockSkin(r.skin);
            this.save.completeMission(this.missionId, nextIds);
        }

        this._fireTrigger('missionComplete', null);

        const evidenceCount = this.save.data.evidenceFragments.length;
        this.hud.showMissionComplete({
            title: this.data.title,
            credits: this._creditsThisRun,
            evidenceCount,
            vela: this.save.data.velaIntegrity,
            alert: this.save.data.neurodriveAlert,
            lastMission: !nextIds || !nextIds.length,
        }, () => this.onExit());
    }

    _failMission() {
        this.state = 'failed';
        this.mission.clearPursuit();
        this.mission.target = null;
        const f = this.data.failure || {};
        if (f.penaltyCredits) this.mission.credits = Math.max(0, this.mission.credits - f.penaltyCredits);
        this._fireTrigger('playerBusted', null);
        this._fireTrigger('missionFail', null);
        this.hud.showMissionFail({
            failText: f.failText || 'The route collapsed.',
            retryAllowed: f.retryAllowed !== false,
        }, () => this._retry(), () => this.onExit());
    }

    _onMissionEvent(type) {
        if (type === 'escaped') { this._escapedFlag = true; this._fireTrigger('policeEscaped', null); }
        else if (type === 'busted') { this._bustedFlag = true; this._fireTrigger('playerBusted', null); }
        else if (type === 'copDestroyed') { this._killTally++; }
        else if (type === 'heatRaised') { this._fireTrigger('wantedRaised', null); }
    }

    /* ═══ dialogue ═══ */

    _fireTrigger(trigger, objectiveId) {
        const dlg = this.data && this.data.dialogue;
        if (!dlg) return;
        for (let i = 0; i < dlg.length; i++) {
            if (this._fired.has(i)) continue;
            const l = dlg[i];
            if (l.trigger !== trigger) continue;
            if (trigger === 'objectiveStart' || trigger === 'objectiveComplete') {
                if (l.objectiveId !== objectiveId) continue;
            } else if (l.objectiveId) {
                continue;
            }
            this._fired.add(i);
            this._dialogueQueue.push({ at: this._clock + (l.delayMs || 0) / 1000, line: l });
        }
    }

    _drainDialogue() {
        if (!this._dialogueQueue.length) return;
        for (let i = this._dialogueQueue.length - 1; i >= 0; i--) {
            const q = this._dialogueQueue[i];
            if (q.at <= this._clock) {
                this._dialogueQueue.splice(i, 1);
                const sp = SPEAKERS[q.line.speaker] || { name: q.line.speaker, tag: '', color: '#00ffd5', glitch: !!q.line.glitch };
                const speaker = q.line.glitch ? { ...sp, glitch: true } : sp;
                this.hud.showDialogue(speaker, q.line.text);
            }
        }
    }

    /* ═══ tracker ═══ */

    _refreshTracker() {
        if (!this.hud) return;
        this.hud.updateTracker({
            act: this.data ? this.data.act : 1,
            missionTitle: this.data ? this.data.title : '--',
            objectiveLabel: this._objectiveLabel(),
            velaIntegrity: this.save.data.velaIntegrity,
            neurodriveAlert: this.save.data.neurodriveAlert,
            cargoIntegrity: this.carrying ? this.cargoIntegrity : null,
        });
    }

    /* ═══ world markers ═══ */

    _colorFor(target) { return TARGET_COLORS[target] || 0x00ffd5; }

    _setMissionTarget(t, color) {
        this.mission.target = t ? { x: t.x, z: t.z } : null;
        if (t) this.mission.targetColor = color;
    }

    _placeTargetNear(distMin, distMax) {
        const p = this.vehicle.position;
        const lo = distMin || 80, hi = distMax || 220;
        let t = this.scene.findRoadTarget(p.x, p.z, lo, hi);
        if (!t) t = this.scene.findRoadTarget(p.x, p.z, 40, hi + 160);
        if (!t) t = { x: p.x + lo, z: p.z };
        return t;
    }

    _timeBudget(t) {
        const dx = t.x - this.vehicle.position.x;
        const dz = t.z - this.vehicle.position.z;
        return Math.hypot(dx, dz) / 16 + 24;
    }

    _pointAhead(dist, lateral) {
        const ry = this.vehicle.rotation.y;
        const fx = -Math.sin(ry), fz = -Math.cos(ry);
        const rx = fz, rz = -fx; // perpendicular (right of travel)
        return {
            x: this.vehicle.position.x + fx * dist + rx * lateral,
            z: this.vehicle.position.z + fz * dist + rz * lateral,
        };
    }

    _spawnBeacon(t, color) {
        const g = new Group();
        const pillar = new Mesh(
            new CylinderGeometry(1.4, 1.4, 50, 12, 1, true),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }),
        );
        pillar.position.y = 25;
        const core = new Mesh(
            new CylinderGeometry(0.3, 0.3, 50, 8),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending }),
        );
        core.position.y = 25;
        const ring = new Mesh(
            new RingGeometry(3.0, 4.0, 32),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;
        g.add(pillar); g.add(core); g.add(ring);
        g._ring = ring; g._pillar = pillar;
        g.position.set(t.x, this.scene.getGroundHeight(t.x, t.z), t.z);
        this.scene.scene.add(g);
        this._markers.push(g);
        return g;
    }

    _spawnGateAhead(color) {
        const lateral = (Math.random() - 0.5) * 12;
        const dist = 50 + Math.random() * 40;
        const pos = this._pointAhead(dist, lateral);
        const g = new Group();
        const torus = new Mesh(
            new TorusGeometry(4.2, 0.32, 8, 28),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
        );
        const glow = new Mesh(
            new TorusGeometry(4.2, 0.9, 8, 28),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }),
        );
        g.add(torus); g.add(glow);
        g._ring = torus;
        const gy = this.scene.getGroundHeight(pos.x, pos.z) + 4.4;
        g.position.set(pos.x, gy, pos.z);
        this.scene.scene.add(g);
        this._markers.push(g);
        return { pos, mesh: g, done: false };
    }

    _spawnCheckpoint(t, color) {
        const ring = new Mesh(
            new RingGeometry(4.5, 6.0, 36),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(t.x, this.scene.getGroundHeight(t.x, t.z) + 0.2, t.z);
        ring._ring = ring;
        this.scene.scene.add(ring);
        this._markers.push(ring);
        return ring;
    }

    _spawnGhost(color) {
        const box = new Mesh(
            new BoxGeometry(1.8, 1.0, 3.6),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }),
        );
        box.position.copy(this.vehicle.position);
        this.scene.scene.add(box);
        this._markers.push(box);
        return box;
    }

    _spawnZone(pos, radius, color) {
        const disc = new Mesh(
            new CircleGeometry(radius, 28),
            new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(pos.x, this.scene.getGroundHeight(pos.x, pos.z) + 0.12, pos.z);
        this.scene.scene.add(disc);
        this._markers.push(disc);
        return disc;
    }

    _aimAtNearestBeacon(c) {
        const b = this._activeBeacon(c);
        if (b) this._setMissionTarget(b.pos, c.color);
    }

    _activeBeacon(c) {
        // nearest not-done beacon
        let best = null, bestD = Infinity;
        for (const b of c.beacons) {
            if (b.done) continue;
            const dx = b.pos.x - this.vehicle.position.x;
            const dz = b.pos.z - this.vehicle.position.z;
            const d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = b; }
        }
        return best;
    }

    _consumeBeacon(c, b) {
        b.done = true;
        c.got++;
        if (b.mesh) this._removeMarker(b.mesh);
        const next = this._activeBeacon(c);
        if (next) this._setMissionTarget(next.pos, c.color);
        else this.mission.target = null;
    }

    _updateGhost(c, dt) {
        if (!c.ghost) return;
        // March the ghost through the checkpoint chain over the time budget.
        c._ghostT += dt;
        const frac = Math.min(1, c._ghostT / (c.timerMax || 80));
        const seg = frac * c.need;
        const idx = Math.min(c.need - 1, Math.floor(seg));
        const tcp = c.beacons[idx];
        if (tcp) {
            const localT = seg - idx;
            const prev = idx > 0 ? c.beacons[idx - 1].pos : { x: this.vehicle.position.x, z: this.vehicle.position.z };
            c.ghost.position.x += ((prev.x + (tcp.pos.x - prev.x) * localT) - c.ghost.position.x) * Math.min(1, 3 * dt);
            c.ghost.position.z += ((prev.z + (tcp.pos.z - prev.z) * localT) - c.ghost.position.z) * Math.min(1, 3 * dt);
            c.ghost.position.y = this.scene.getGroundHeight(c.ghost.position.x, c.ghost.position.z) + 0.6;
        }
    }

    _updatePredictionZones(c, dt) {
        c._zoneSpawnT -= dt;
        if (c._zoneSpawnT <= 0) {
            c._zoneSpawnT = 2.2 + Math.random() * 1.6;
            const lateral = (Math.random() - 0.5) * 18;
            const pos = this._pointAhead(20 + Math.random() * 26, lateral);
            const radius = 9 + Math.random() * 6;
            c.zones.push({ mesh: this._spawnZone(pos, radius, 0xff2b45), pos, radius, life: 5, hit: false });
        }
        for (let i = c.zones.length - 1; i >= 0; i--) {
            const z = c.zones[i];
            z.life -= dt;
            const dx = this.vehicle.position.x - z.pos.x;
            const dz = this.vehicle.position.z - z.pos.z;
            if (!z.hit && dx * dx + dz * dz < z.radius * z.radius) {
                z.hit = true;
                this.save.adjustAlert(2);
                this._toast('落入预测区 — 改变路线 · PREDICTED', 'bad');
            }
            if (z.life <= 0) {
                this._removeMarker(z.mesh);
                c.zones.splice(i, 1);
            }
        }
    }

    _animateMarkers(dt) {
        this._beaconT += dt;
        const pulse = 0.5 + 0.5 * Math.sin(this._beaconT * 3);
        for (const m of this._markers) {
            if (m._ring) {
                m._ring.rotation.z += dt * 1.2;
                if (m._ring.material) m._ring.material.opacity = 0.4 + 0.35 * pulse;
            }
            if (m._pillar && m._pillar.material) m._pillar.material.opacity = 0.1 + 0.12 * pulse;
        }
    }

    /* ═══ teardown ═══ */

    _removeMarker(obj) {
        if (!obj) return;
        const idx = this._markers.indexOf(obj);
        if (idx >= 0) this._markers.splice(idx, 1);
        if (this.scene && this.scene.scene) this.scene.scene.remove(obj);
        this._disposeObject(obj);
    }

    _teardownCurrentMarkers() {
        const c = this.current;
        if (!c) return;
        if (c.ghost) { this._removeMarker(c.ghost); c.ghost = null; }
        if (c.beacons) for (const b of c.beacons) { if (b && b.mesh) this._removeMarker(b.mesh); else if (b && b.isObject3D) this._removeMarker(b); }
        if (c.zones) for (const z of c.zones) { if (z && z.mesh) this._removeMarker(z.mesh); }
        c.beacons = []; c.zones = [];
    }

    _teardownMarkers() {
        for (const m of this._markers.slice()) {
            if (this.scene && this.scene.scene) this.scene.scene.remove(m);
            this._disposeObject(m);
        }
        this._markers = [];
        if (this.current) { this.current.beacons = []; this.current.zones = []; this.current.ghost = null; }
    }

    _disposeObject(obj) {
        if (obj.traverse) obj.traverse(o => this._disposeNode(o));
        else this._disposeNode(obj);
    }

    _disposeNode(o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
            else o.material.dispose();
        }
    }

    /* ═══ helpers ═══ */

    _withinXZ(t, radius) {
        if (!t) return false;
        const dx = this.vehicle.position.x - t.x;
        const dz = this.vehicle.position.z - t.z;
        return (dx * dx + dz * dz) <= radius * radius;
    }

    _toast(text, kind) {
        if (this.gameHud) this.gameHud.toast(text, kind || 'info');
    }
}
