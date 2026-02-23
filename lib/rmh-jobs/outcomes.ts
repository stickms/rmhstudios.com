export type ApplicationOutcome = 'instant_reject' | 'delayed_reject' | 'oa_invite';

interface OutcomeConfig {
    outcome: ApplicationOutcome;
    weight: number;
    getProcessDelay: () => number; // milliseconds from now
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const outcomeConfigs: OutcomeConfig[] = [
    {
        outcome: 'instant_reject',
        weight: 40,
        getProcessDelay: () => 0,
    },
    {
        outcome: 'delayed_reject',
        weight: 35,
        getProcessDelay: () => randomBetween(2 * DAY, 4 * DAY),
    },
    {
        outcome: 'oa_invite',
        weight: 25,
        getProcessDelay: () => randomBetween(1 * HOUR, 6 * HOUR),
    },
];

export function rollOutcome(): { outcome: ApplicationOutcome; processAt: Date } {
    if (process.env.FORCE_OA === 'true') {
        return { outcome: 'oa_invite', processAt: new Date() };
    }

    const totalWeight = outcomeConfigs.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const config of outcomeConfigs) {
        roll -= config.weight;
        if (roll <= 0) {
            const delay = config.getProcessDelay();
            return {
                outcome: config.outcome,
                processAt: new Date(Date.now() + delay),
            };
        }
    }

    // Fallback (should never reach)
    return {
        outcome: 'instant_reject',
        processAt: new Date(),
    };
}
