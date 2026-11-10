/**
 * abilityProgression.ts — Wave-based ability unlock system.
 * New abilities unlock at milestone waves, changing player playstyle.
 */

export type AbilityId =
    | 'dash' | 'focus'           // base
    | 'void_pulse'               // wave 8
    | 'phase_shift'              // wave 15
    | 'reflect_shield'           // wave 30
    | 'ally_synergy';            // wave 35

export interface AbilityUnlockConfig {
    id: AbilityId;
    wave: number;
    name: string;
    description: string;
    /** Keyboard hint shown on unlock popup */
    keybind: string;
}

export const ABILITY_UNLOCK_CONFIGS: AbilityUnlockConfig[] = [
    { id: 'dash', wave: 1, name: 'Void Dash', description: 'Dash toward cursor. Invincible briefly.', keybind: 'Shift' },
    { id: 'focus', wave: 1, name: 'Focus', description: 'Slow time. Bonus shards on kills.', keybind: 'F' },
    { id: 'void_pulse', wave: 8, name: 'Void Pulse', description: 'Emit an energy burst. Clears nearby projectiles.', keybind: 'Q' },
    { id: 'phase_shift', wave: 15, name: 'Phase Shift', description: 'Brief full invincibility. The shards protect you.', keybind: 'E' },
    { id: 'reflect_shield', wave: 30, name: 'Reflect Shield', description: 'Reflect projectiles for 1.5 seconds.', keybind: 'R' },
    { id: 'ally_synergy', wave: 35, name: 'Ally Synergy', description: "Friend's shots deal double damage for 8 seconds.", keybind: 'T' },
];

/** Cooldown durations in seconds for each ability */
export const ABILITY_COOLDOWNS: Record<AbilityId, number> = {
    dash: 2,
    focus: 12,
    void_pulse: 8,
    phase_shift: 18,
    reflect_shield: 25,
    ally_synergy: 30,
};

/** Active durations in seconds */
export const ABILITY_DURATIONS: Record<AbilityId, number> = {
    dash: 0.2,
    focus: 2.5,
    void_pulse: 0,   // instant
    phase_shift: 1.8,
    reflect_shield: 1.5,
    ally_synergy: 8,
};

export interface PlayerAbilities {
    unlockedIds: Set<AbilityId>;
    // Per-ability cooldown timers (seconds remaining)
    voidPulseCooldown: number;
    phaseShiftCooldown: number;
    phaseShiftActive: boolean;
    phaseShiftTimer: number;
    reflectShieldCooldown: number;
    reflectShieldActive: boolean;
    reflectShieldTimer: number;
    allySynergyCooldown: number;
    allySynergyActive: boolean;
    allySynergyTimer: number;
}

export function makePlayerAbilities(): PlayerAbilities {
    return {
        unlockedIds: new Set(['dash', 'focus']),
        voidPulseCooldown: 0,
        phaseShiftCooldown: 0,
        phaseShiftActive: false, phaseShiftTimer: 0,
        reflectShieldCooldown: 0,
        reflectShieldActive: false, reflectShieldTimer: 0,
        allySynergyCooldown: 0,
        allySynergyActive: false, allySynergyTimer: 0,
    };
}

export class AbilityProgressionManager {
    abilities: PlayerAbilities = makePlayerAbilities();
    private checkedWaves = new Set<number>();
    /** Queue of unlock configs to show as toast notifications */
    pendingNotifications: AbilityUnlockConfig[] = [];

    reset(): void {
        this.abilities = makePlayerAbilities();
        this.checkedWaves.clear();
        this.pendingNotifications = [];
    }

    /** Call at wave start. Returns any newly unlocked configs. */
    checkUnlocks(wave: number): AbilityUnlockConfig[] {
        if (this.checkedWaves.has(wave)) return [];
        this.checkedWaves.add(wave);
        const newly: AbilityUnlockConfig[] = [];
        for (const cfg of ABILITY_UNLOCK_CONFIGS) {
            if (cfg.wave === wave && !this.abilities.unlockedIds.has(cfg.id)) {
                this.abilities.unlockedIds.add(cfg.id);
                newly.push(cfg);
            }
        }
        if (newly.length) this.pendingNotifications.push(...newly);
        return newly;
    }

    isUnlocked(id: AbilityId): boolean {
        return this.abilities.unlockedIds.has(id);
    }

    /** Attempt to activate void pulse. Returns true if triggered. */
    tryVoidPulse(): boolean {
        const a = this.abilities;
        if (!this.isUnlocked('void_pulse') || a.voidPulseCooldown > 0) return false;
        a.voidPulseCooldown = ABILITY_COOLDOWNS.void_pulse;
        return true;
    }

    /** Attempt to activate phase shift. Returns true if triggered. */
    tryPhaseShift(): boolean {
        const a = this.abilities;
        if (!this.isUnlocked('phase_shift') || a.phaseShiftCooldown > 0 || a.phaseShiftActive) return false;
        a.phaseShiftActive = true;
        a.phaseShiftTimer = ABILITY_DURATIONS.phase_shift;
        return true;
    }

    /** Attempt to activate reflect shield. Returns true if triggered. */
    tryReflectShield(): boolean {
        const a = this.abilities;
        if (!this.isUnlocked('reflect_shield') || a.reflectShieldCooldown > 0 || a.reflectShieldActive) return false;
        a.reflectShieldActive = true;
        a.reflectShieldTimer = ABILITY_DURATIONS.reflect_shield;
        return true;
    }

    /** Attempt to activate ally synergy. Returns true if triggered. */
    tryAllySynergy(): boolean {
        const a = this.abilities;
        if (!this.isUnlocked('ally_synergy') || a.allySynergyCooldown > 0 || a.allySynergyActive) return false;
        a.allySynergyActive = true;
        a.allySynergyTimer = ABILITY_DURATIONS.ally_synergy;
        return true;
    }

    /** Update all cooldowns and active timers each frame. */
    update(dt: number): void {
        const a = this.abilities;
        if (a.voidPulseCooldown > 0) a.voidPulseCooldown -= dt;
        if (a.phaseShiftCooldown > 0) a.phaseShiftCooldown -= dt;
        if (a.phaseShiftActive) {
            a.phaseShiftTimer -= dt;
            if (a.phaseShiftTimer <= 0) {
                a.phaseShiftActive = false;
                a.phaseShiftCooldown = ABILITY_COOLDOWNS.phase_shift;
            }
        }
        if (a.reflectShieldCooldown > 0) a.reflectShieldCooldown -= dt;
        if (a.reflectShieldActive) {
            a.reflectShieldTimer -= dt;
            if (a.reflectShieldTimer <= 0) {
                a.reflectShieldActive = false;
                a.reflectShieldCooldown = ABILITY_COOLDOWNS.reflect_shield;
            }
        }
        if (a.allySynergyCooldown > 0) a.allySynergyCooldown -= dt;
        if (a.allySynergyActive) {
            a.allySynergyTimer -= dt;
            if (a.allySynergyTimer <= 0) {
                a.allySynergyActive = false;
                a.allySynergyCooldown = ABILITY_COOLDOWNS.ally_synergy;
            }
        }
    }
}
