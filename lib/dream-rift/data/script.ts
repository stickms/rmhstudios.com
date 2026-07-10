/**
 * Narrative script for Dream Rift.
 *
 * Short visual-novel beats bookend each boss (pre-fight and post-fight). In
 * multiplayer the host drives the dialogue cursor and broadcasts the current
 * line so every player reads the same beat in sync; any player may advance.
 *
 * `speaker: 'player'` renders the lobby's lead dreamer portrait on the left;
 * the boss renders on the right.
 */

export interface DialogueLine {
    speaker: 'player' | 'boss';
    /** Override display name (defaults to the character / boss name). */
    name?: string;
    text: string;
}

export interface StoryBeat {
    /** Boss name shown for `speaker: 'boss'` lines. */
    bossName: string;
    lines: DialogueLine[];
}

export interface StageStory {
    pre: StoryBeat;
    post: StoryBeat;
}

export const PROLOGUE: DialogueLine[] = [
    { speaker: 'player', text: 'The waking world frayed at midnight — and the dream poured through the tear.' },
    { speaker: 'player', text: 'Someone has to follow the rift to its heart and seal it before both worlds dissolve.' },
];

export const STORY: StageStory[] = [
    // Stage 1
    {
        pre: {
            bossName: 'Reimei, the Dawnkeeper',
            lines: [
                { speaker: 'boss', text: 'Turn back, little dreamer. The shrine that holds the first seam is mine to guard.' },
                { speaker: 'player', text: 'Then you already know the seam is tearing. Step aside, or I go through you.' },
                { speaker: 'boss', text: 'Bold. Let twilight test that resolve.' },
            ],
        },
        post: {
            bossName: 'Reimei, the Dawnkeeper',
            lines: [
                { speaker: 'boss', text: 'Heh… you really mean to chase it to the source.' },
                { speaker: 'boss', text: 'Beyond the shrine lies the Lucid Sea. Mind the tide — it drowns the certain.' },
                { speaker: 'player', text: 'Thank you. Hold the dawn until I return.' },
            ],
        },
    },
    // Stage 2
    {
        pre: {
            bossName: 'Mizuki of the Glasstide',
            lines: [
                { speaker: 'boss', text: 'A ripple, a wake… ah. A trespasser walking on my mirror sea.' },
                { speaker: 'player', text: 'The rift runs under your waves. I have to reach the deep seam.' },
                { speaker: 'boss', text: 'Then sink, or learn to dance on water. The glasstide shows no mercy.' },
            ],
        },
        post: {
            bossName: 'Mizuki of the Glasstide',
            lines: [
                { speaker: 'boss', text: 'You did not sink… you danced. I will let the tide part for you.' },
                { speaker: 'player', text: 'Who tore the rift open, Mizuki? Do you know?' },
                { speaker: 'boss', text: 'The Sovereign of the Astral Rift. She dreams too loudly. Go — and wake her gently if you can.' },
            ],
        },
    },
    // Stage 3
    {
        pre: {
            bossName: 'Yumesaki, the Rift Sovereign',
            lines: [
                { speaker: 'boss', text: 'So the little spark climbed all the way to the center of the dream.' },
                { speaker: 'player', text: 'You opened the rift. The waking world is unraveling because of you.' },
                { speaker: 'boss', text: 'I only wanted a dream that never ends… but if I must lose it, I will not lose it quietly.' },
                { speaker: 'player', text: 'Then let us end it together — one last curtain of light.' },
            ],
        },
        post: {
            bossName: 'Yumesaki, the Rift Sovereign',
            lines: [
                { speaker: 'boss', text: 'Ah… so this is what waking feels like. Warm. Brief. Real.' },
                { speaker: 'boss', text: 'The seam is closing. Thank you for chasing me to the very end.' },
                { speaker: 'player', text: 'Dream again someday — gentler, next time. The rift is sealed.' },
            ],
        },
    },
];

export const EPILOGUE: DialogueLine[] = [
    { speaker: 'player', text: 'Dawn returned to both worlds, stitched along a silver seam only dreamers can see.' },
    { speaker: 'player', text: 'And somewhere beyond sleep, a quieter dream began again.' },
];
