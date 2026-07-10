// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM2099: GHOST ROUTE — Campaign Save
   localStorage-backed progress for Story Mode.
   Kept completely separate from the free-roam
   best-score so a story wipe never touches the
   sandbox high score.
   ═══════════════════════════════════════════ */

const STORY_SAVE_KEY = 'velum2099_story_save_v1';

const FACTIONS = ['staticSaints', 'morrowSyn', 'redlineChoir', 'policeGrid'];

function _freshSave() {
    const factionRep = {};
    for (const f of FACTIONS) factionRep[f] = 0;
    return {
        version: 1,
        startedAt: 0,
        updatedAt: 0,
        currentAct: 1,
        currentMissionId: null,
        completedMissionIds: [],
        unlockedMissionIds: [],
        creditsEarnedStory: 0,
        evidenceFragments: [],
        velaIntegrity: 30,        // 0-100 — Vela starts fragmented
        neurodriveAlert: 10,      // 0-100
        factionRep,               // -100 .. 100 per faction
        choices: {},
        endingsUnlocked: [],
        unlockedPalettes: [],
        unlockedSkins: [],
    };
}

export class StorySave {
    constructor() {
        this.data = _freshSave();
        this._loaded = this._load();
    }

    /** True if a real save exists in localStorage (campaign already begun). */
    exists() {
        return !!this._loaded;
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORY_SAVE_KEY);
            if (!raw) return false;
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') return false;
            // Merge onto a fresh template so older/partial saves stay valid.
            const base = _freshSave();
            for (const k in base) {
                if (saved[k] !== undefined) base[k] = saved[k];
            }
            // Repair faction rep if a faction was added since the save was written.
            for (const f of FACTIONS) {
                if (typeof base.factionRep[f] !== 'number') base.factionRep[f] = 0;
            }
            this.data = base;
            return true;
        } catch (e) {
            console.warn('[Story] 存档读取失败:', e);
            return false;
        }
    }

    _save() {
        this.data.updatedAt = Date.now();
        try {
            localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('[Story] 存档写入失败:', e);
        }
    }

    /** Begin a brand-new campaign, unlocking the first mission. */
    startNew(firstMissionId) {
        this.data = _freshSave();
        this.data.startedAt = Date.now();
        this.data.currentMissionId = firstMissionId;
        if (firstMissionId && !this.data.unlockedMissionIds.includes(firstMissionId)) {
            this.data.unlockedMissionIds.push(firstMissionId);
        }
        this._loaded = true;
        this._save();
    }

    /** Hard reset — removes the campaign save entirely. */
    reset() {
        this.data = _freshSave();
        this._loaded = false;
        try { localStorage.removeItem(STORY_SAVE_KEY); } catch { /* ignore */ }
    }

    /* ── queries ── */

    isCompleted(missionId) { return this.data.completedMissionIds.includes(missionId); }
    isUnlocked(missionId) { return this.data.unlockedMissionIds.includes(missionId); }
    hasEvidence(id) { return this.data.evidenceFragments.includes(id); }
    getChoice(key) { return this.data.choices[key]; }
    getRep(faction) { return this.data.factionRep[faction] || 0; }

    /* ── mutations ── */

    unlockMission(missionId) {
        if (missionId && !this.data.unlockedMissionIds.includes(missionId)) {
            this.data.unlockedMissionIds.push(missionId);
            this._save();
        }
    }

    setCurrentMission(missionId, act) {
        // Replaying an already-finished mission must not rewind the CONTINUE pointer.
        if (this.isCompleted(missionId)) return;
        this.data.currentMissionId = missionId;
        if (typeof act === 'number') this.data.currentAct = act;
        this._save();
    }

    addEvidence(id) {
        if (id && !this.data.evidenceFragments.includes(id)) {
            this.data.evidenceFragments.push(id);
        }
    }

    addCredits(n) {
        this.data.creditsEarnedStory = Math.max(0, this.data.creditsEarnedStory + (n || 0));
    }

    setChoice(key, value) {
        this.data.choices[key] = value;
    }

    adjustVela(delta) {
        this.data.velaIntegrity = Math.max(0, Math.min(100, this.data.velaIntegrity + (delta || 0)));
    }

    adjustAlert(delta) {
        this.data.neurodriveAlert = Math.max(0, Math.min(100, this.data.neurodriveAlert + (delta || 0)));
    }

    adjustRep(faction, delta) {
        if (!faction || !(faction in this.data.factionRep)) return;
        this.data.factionRep[faction] = Math.max(-100, Math.min(100, this.data.factionRep[faction] + (delta || 0)));
    }

    unlockPalette(name) {
        if (name && !this.data.unlockedPalettes.includes(name)) this.data.unlockedPalettes.push(name);
    }

    unlockSkin(name) {
        if (name && !this.data.unlockedSkins.includes(name)) this.data.unlockedSkins.push(name);
    }

    unlockEnding(id) {
        if (id && !this.data.endingsUnlocked.includes(id)) this.data.endingsUnlocked.push(id);
    }

    /** Record a mission as completed and persist. `nextIds` are unlocked. */
    completeMission(missionId, nextIds) {
        if (missionId && !this.data.completedMissionIds.includes(missionId)) {
            this.data.completedMissionIds.push(missionId);
        }
        if (Array.isArray(nextIds)) {
            for (const n of nextIds) this.unlockMission(n);
            // Only advance the CONTINUE pointer forward, never onto a finished mission.
            if (nextIds.length && !this.isCompleted(nextIds[0])) this.data.currentMissionId = nextIds[0];
        }
        this._save();
    }

    /** Persist any pending in-memory mutations. */
    flush() { this._save(); }
}
