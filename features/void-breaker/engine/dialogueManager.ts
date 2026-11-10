/**
 * dialogueManager.ts — Expanded narrative system.
 * Full story arc to wave 40: The Collapse → The Entities → The Friend → The Truth.
 */

export interface DialogueLine {
    speaker: string;
    text: string;
    duration: number;
}

export interface DialogueTrigger {
    wave: number;
    /** 0.0 = wave start, 0.5 = mid-wave, 1.0 = end */
    waveProgressFraction: number;
    lines: DialogueLine[];
    fired: boolean;
}

export interface ActiveDialogue {
    line: DialogueLine;
    timer: number;
    typewriterProgress: number;
    typewriterSpeed: number;
}

/** All narrative triggers across 40 waves */
const RAW_TRIGGERS: Omit<DialogueTrigger, 'fired'>[] = [
    // ── Wave 1 — Opening ────────────────────────────────────────────────────────
    {
        wave: 1, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'Void breach detected. Kowloon Sector 7. Third this week.', duration: 4 },
            { speaker: 'KAI', text: 'Yeah. I know.', duration: 2.5 },
        ],
    },

    // ── Wave 3 — Early lore hint ─────────────────────────────────────────────────
    {
        wave: 3, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'WARNING: Entity count increasing per breach. Pattern suggests acceleration.', duration: 4.5 },
            { speaker: 'KAI', text: 'They\'re getting faster. Something changed.', duration: 3 },
        ],
    },

    // ── Wave 5 Boss — The Collapse origin ───────────────────────────────────────
    {
        wave: 5, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'BOSS ENTITY INBOUND. Classification: Void Construct I.', duration: 4 },
            { speaker: 'KAI', text: 'They keep sending bigger ones. Why?', duration: 3 },
            { speaker: 'SYSTEM', text: 'Unknown. Entity behavior suggests... purpose.', duration: 3.5 },
        ],
    },

    // ── Wave 5 mid ──────────────────────────────────────────────────────────────
    {
        wave: 5, waveProgressFraction: 0.5,
        lines: [
            { speaker: 'KAI', text: 'I found old research files in the sealed zones. 2039. Project LIMINEX.', duration: 4.5 },
            { speaker: 'KAI', text: 'Humanity tried to tap the void as an energy source.', duration: 4 },
            { speaker: 'KAI', text: 'Three years before the Collapse.', duration: 3 },
        ],
    },

    // ── Wave 6 — Post-boss lore ───────────────────────────────────────────────
    {
        wave: 6, waveProgressFraction: 0,
        lines: [
            { speaker: 'KAI', text: 'They were people once. Whatever world they came from... died screaming.', duration: 5 },
            { speaker: 'SYSTEM', text: 'Correction: they were never people. They are dimensional immune responses.', duration: 5 },
            { speaker: 'KAI', text: '...Immune responses. To us.', duration: 3 },
        ],
    },

    // ── Wave 8 — Ability unlock context ─────────────────────────────────────────
    {
        wave: 8, waveProgressFraction: 0,
        lines: [
            { speaker: 'KAI', text: 'The shards are rewriting me. I can feel new patterns forming.', duration: 4 },
            { speaker: 'KAI', text: 'A pulse. Wide. It clears everything nearby. [Q KEY UNLOCKED]', duration: 4 },
        ],
    },

    // ── Wave 10 Boss — Fallen Angel ──────────────────────────────────────────────
    {
        wave: 10, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'CRITICAL BREACH. Category Ω entity incoming. Fallen Angel class.', duration: 4 },
            { speaker: 'KAI', text: 'These ones are aware. You can see it in the way they move.', duration: 4 },
            { speaker: 'SYSTEM', text: 'LIMINEX data: entities of this class existed before the experiment.', duration: 4.5 },
            { speaker: 'KAI', text: 'So they were always here. We just opened a door and told them to come in.', duration: 5 },
        ],
    },

    // ── Wave 10 mid ──────────────────────────────────────────────────────────────
    {
        wave: 10, waveProgressFraction: 0.5,
        lines: [
            { speaker: 'SYSTEM', text: 'LIMINEX LOG 44-C: "The void does not produce energy. It produces equilibrium."', duration: 5 },
            { speaker: 'SYSTEM', text: '"Any extraction disturbs the balance. Balance must be restored."', duration: 5 },
            { speaker: 'KAI', text: 'We\'re the imbalance. We\'re what they\'re fixing.', duration: 3.5 },
        ],
    },

    // ── Wave 11 post boss ────────────────────────────────────────────────────────
    {
        wave: 11, waveProgressFraction: 0,
        lines: [
            { speaker: 'KAI', text: 'Still standing. Barely.', duration: 2.5 },
            { speaker: 'SYSTEM', text: 'Dimensional bleed accelerating. Void zones expanding by 3% per hour.', duration: 4.5 },
        ],
    },

    // ── Wave 15 — Friend introduction ─────────────────────────────────────────
    {
        wave: 15, waveProgressFraction: 0,
        lines: [
            { speaker: 'FRIEND', text: '...凱? Is that you? I saw you from the overpass.', duration: 4.5 },
            { speaker: 'KAI', text: 'Lin. You should NOT be here.', duration: 3 },
            { speaker: 'FRIEND', text: 'I worked on LIMINEX. I\'m the reason this is happening.', duration: 4.5 },
            { speaker: 'KAI', text: 'What?', duration: 2 },
            { speaker: 'FRIEND', text: 'I was the lead engineer. I signed off on the final extraction protocol.', duration: 4.5 },
        ],
    },

    // ── Wave 15 mid — BOSS ────────────────────────────────────────────────────
    {
        wave: 15, waveProgressFraction: 0.5,
        lines: [
            { speaker: 'SYSTEM', text: 'BOSS ENTITY: Pattern Engine. Classification: Adaptive Construct.', duration: 4.5 },
            { speaker: 'FRIEND', text: 'It\'s a higher-tier construct. They\'re evolving their responses.', duration: 4 },
            { speaker: 'KAI', text: 'Stay behind me. And keep talking.', duration: 3 },
        ],
    },

    // ── Wave 16 — Post-transition ─────────────────────────────────────────────
    {
        wave: 16, waveProgressFraction: 0,
        lines: [
            { speaker: 'FRIEND', text: 'The signal leads to the old industrial plant. That\'s where LIMINEX ran the core experiments.', duration: 5 },
            { speaker: 'KAI', text: 'How many people knew what you were building?', duration: 3.5 },
            { speaker: 'FRIEND', text: 'A hundred. A thousand. Everyone who wanted free energy without asking what it cost.', duration: 5 },
        ],
    },

    // ── Wave 20 Boss — Domain Collapser ──────────────────────────────────────
    {
        wave: 20, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'DOMAIN COLLAPSER detected. This entity can restructure local space.', duration: 5 },
            { speaker: 'FRIEND', text: 'The arena... it\'s shrinking. It\'s compressing our reality.', duration: 4 },
            { speaker: 'KAI', text: 'Then we end this fast.', duration: 2.5 },
        ],
    },

    // ── Wave 22 — Ability unlock ──────────────────────────────────────────────
    {
        wave: 22, waveProgressFraction: 0,
        lines: [
            { speaker: 'FRIEND', text: 'The shards are quantum-bonded to you now. I calculated — they can amplify your detonation.', duration: 5 },
            { speaker: 'KAI', text: 'Area Burst. Show me.', duration: 2.5 },
        ],
    },

    // ── Wave 25 Boss ─────────────────────────────────────────────────────────
    {
        wave: 25, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'RESONANCE ENTITY. This construct synchronizes with void frequencies.', duration: 4.5 },
            { speaker: 'FRIEND', text: 'Halfway to the core. If we can clear this floor...', duration: 3.5 },
            { speaker: 'KAI', text: 'Halfway means there\'s a second half.', duration: 3 },
            { speaker: 'FRIEND', text: 'Yes. And it gets worse.', duration: 2.5 },
        ],
    },

    // ── Wave 28 — Pre-boss tension ────────────────────────────────────────────
    {
        wave: 28, waveProgressFraction: 0,
        lines: [
            { speaker: 'FRIEND', text: 'Kai. I need to tell you something. About the experiment.', duration: 4 },
            { speaker: 'FRIEND', text: 'We didn\'t accidentally breach the void. We were told to.', duration: 4.5 },
            { speaker: 'KAI', text: '...Who told you?', duration: 2.5 },
            { speaker: 'FRIEND', text: 'An organization. They called themselves The Balance. They wanted this to happen.', duration: 5.5 },
        ],
    },

    // ── Wave 30 Boss — Reality Breacher ──────────────────────────────────────
    {
        wave: 30, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'REALITY BREACHER. Warning: local physics may become unreliable.', duration: 4.5 },
            { speaker: 'FRIEND', text: 'Kai — trust your instincts. Don\'t rely on your senses right now.', duration: 4.5 },
            { speaker: 'KAI', text: 'How do you fight something that breaks the rules?', duration: 3.5 },
            { speaker: 'FRIEND', text: 'You write new ones.', duration: 2.5 },
        ],
    },

    // ── Wave 31 post-30 boss ─────────────────────────────────────────────────
    {
        wave: 31, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'Entering Void Core approach. External reality coherence: 41%.', duration: 4.5 },
            { speaker: 'FRIEND', text: 'This is the last zone. The LIMINEX core is somewhere in there.', duration: 4 },
            { speaker: 'KAI', text: 'And The Balance? Are they here too?', duration: 3 },
            { speaker: 'FRIEND', text: 'I think they always were. They\'re not fighting the void. They\'re guiding it.', duration: 5 },
        ],
    },

    // ── Wave 35 Boss ─────────────────────────────────────────────────────────
    {
        wave: 35, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'THE ARCHITECT. Ancient. Pre-Collapse. This is what opened the first breach.', duration: 5 },
            { speaker: 'FRIEND', text: 'If The Architect falls... the void loses its planner.', duration: 4 },
            { speaker: 'KAI', text: 'Then let\'s make it lose its mind.', duration: 3 },
        ],
    },

    // ── Wave 38 — Pre-final ───────────────────────────────────────────────────
    {
        wave: 38, waveProgressFraction: 0,
        lines: [
            { speaker: 'FRIEND', text: 'Kai. I want you to know — whatever happens in there —', duration: 4 },
            { speaker: 'KAI', text: 'Don\'t.', duration: 1.5 },
            { speaker: 'FRIEND', text: 'You saved more than you know.', duration: 3.5 },
            { speaker: 'KAI', text: 'The void still needs stopping. Stay focused.', duration: 3.5 },
        ],
    },

    // ── Wave 40 Boss — The Equilibrium ───────────────────────────────────────
    {
        wave: 40, waveProgressFraction: 0,
        lines: [
            { speaker: 'SYSTEM', text: 'EQUILIBRIUM ENTITY DETECTED. The source of the Collapse.', duration: 5 },
            { speaker: 'SYSTEM', text: 'This construct IS the balance. Destroying it may not be possible.', duration: 5 },
            { speaker: 'KAI', text: 'Then I don\'t destroy it. I make it choose to stop.', duration: 4 },
            { speaker: 'FRIEND', text: '...The shards. They\'re all from the Void. You\'ve been carrying pieces of it all along.', duration: 5.5 },
            { speaker: 'KAI', text: 'Good. Then it knows me.', duration: 3 },
        ],
    },
];

export class DialogueManager {
    private triggers: DialogueTrigger[];
    active: ActiveDialogue | null = null;
    private queue: DialogueLine[] = [];

    constructor() {
        this.triggers = RAW_TRIGGERS.map(t => ({ ...t, lines: [...t.lines], fired: false }));
    }

    reset(): void {
        this.triggers = RAW_TRIGGERS.map(t => ({ ...t, lines: [...t.lines], fired: false }));
        this.active = null;
        this.queue = [];
    }

    checkTriggers(wave: number, killedThisWave: number, totalThisWave: number): void {
        const fraction = totalThisWave > 0 ? killedThisWave / totalThisWave : 0;
        for (const t of this.triggers) {
            if (t.fired || t.wave !== wave) continue;
            if (fraction >= t.waveProgressFraction) {
                t.fired = true;
                this.queue.push(...t.lines);
            }
        }
    }

    update(dt: number): void {
        if (this.active) {
            this.active.timer -= dt;
            this.active.typewriterProgress = Math.min(
                1,
                this.active.typewriterProgress + (dt * this.active.typewriterSpeed) / this.active.line.text.length,
            );
            if (this.active.timer <= 0) this.active = null;
        }
        if (!this.active && this.queue.length > 0) {
            const next = this.queue.shift()!;
            this.active = {
                line: next, timer: next.duration,
                typewriterProgress: 0, typewriterSpeed: 26,
            };
        }
    }

    getDisplayText(): string {
        if (!this.active) return '';
        const len = Math.ceil(this.active.typewriterProgress * this.active.line.text.length);
        return this.active.line.text.slice(0, len);
    }

    dismiss(): void { this.active = null; }
}
