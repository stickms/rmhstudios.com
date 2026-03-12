/**
 * Alibi — Daily Puzzle
 * A short crime scenario. Four suspects. One contradiction. Find the liar.
 */

import { createSeededRng, getDateSeed, seededShuffle } from './seed';

export interface AlibiSuspect {
    name: string;
    emoji: string;
    alibi: string;
    isGuilty: boolean;
}

export interface AlibiContradiction {
    explanation: string;
    highlights: { text: string; source: 'scenario' | 'suspect'; suspectName?: string }[];
}

export interface AlibiPuzzle {
    scenario: string;
    suspects: Omit<AlibiSuspect, 'isGuilty'>[];
    difficulty: 'simple' | 'tricky' | 'devious';
    /** Only available after solving */
    _solution?: {
        guiltyName: string;
        contradiction: AlibiContradiction;
    };
}

interface AlibiTemplate {
    scenario: string;
    suspects: AlibiSuspect[];
    contradiction: AlibiContradiction;
    difficulty: 'simple' | 'tricky' | 'devious';
}

const ALIBI_POOL: AlibiTemplate[] = [
    {
        scenario: 'A priceless painting was stolen from the Northside Gallery at 9 PM on a rainy Tuesday night. The security cameras were disabled exactly 10 minutes before the theft. The gallery was locked from the inside.',
        suspects: [
            { name: 'Marcus Cole', emoji: '👨‍💼', alibi: 'I was at a dinner party across town. We didn\'t finish until 11 PM.', isGuilty: false },
            { name: 'Elena Voss', emoji: '👩‍🎨', alibi: 'I was in my studio painting all evening. My neighbor heard music from my apartment until midnight.', isGuilty: false },
            { name: 'Derek Huang', emoji: '🧑‍🔧', alibi: 'I was fixing the gallery\'s backup generator outside. I saw the stars were beautiful that clear night.', isGuilty: true },
            { name: 'Sofia Reyes', emoji: '👩‍⚕️', alibi: 'I was on a night shift at the hospital. The ER was packed and I didn\'t leave until 2 AM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Derek claims he saw beautiful stars on a "clear night," but the scenario states it was a rainy Tuesday night.',
            highlights: [
                { text: 'rainy Tuesday night', source: 'scenario' },
                { text: 'stars were beautiful that clear night', source: 'suspect', suspectName: 'Derek Huang' },
            ],
        },
        difficulty: 'simple',
    },
    {
        scenario: 'A diamond necklace vanished from a hotel safe during a charity gala on Saturday evening. The safe required two keys — one held by the manager, one by the guest. Power went out at 8:30 PM for exactly 5 minutes.',
        suspects: [
            { name: 'Victor Lane', emoji: '🤵', alibi: 'I was giving my keynote speech on stage when the power went out. Hundreds of people saw me.', isGuilty: false },
            { name: 'Nina Ashford', emoji: '👸', alibi: 'I was in the powder room with two other guests. We used our phone flashlights during the blackout.', isGuilty: false },
            { name: 'Raymond Kirk', emoji: '👨‍🍳', alibi: 'I was in the kitchen preparing the main course. The gas stoves kept working so we barely noticed the outage.', isGuilty: false },
            { name: 'Claudia Stern', emoji: '👩‍💻', alibi: 'I was at the front desk. I used my master key to check the backup systems during the blackout. Nobody else was near the safe area on the third floor.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Claudia claims nobody was near the safe area, yet she admits she was there with a master key — and the safe requires two keys to open.',
            highlights: [
                { text: 'required two keys', source: 'scenario' },
                { text: 'used my master key', source: 'suspect', suspectName: 'Claudia Stern' },
                { text: 'Nobody else was near the safe area', source: 'suspect', suspectName: 'Claudia Stern' },
            ],
        },
        difficulty: 'tricky',
    },
    {
        scenario: 'A research lab\'s prototype was stolen overnight between Monday and Tuesday. The lab has keycard access — only four researchers have cards. Entry logs show the lab was accessed at 3:17 AM.',
        suspects: [
            { name: 'Dr. Priya Nair', emoji: '👩‍🔬', alibi: 'I was at home asleep. My smart home system shows I didn\'t leave. I swiped into the lab at 7 AM as usual.', isGuilty: false },
            { name: 'Dr. James Whitfield', emoji: '👨‍🔬', alibi: 'I was on a red-eye flight to Boston. My boarding pass shows I left at 11 PM and landed at 5 AM Tuesday.', isGuilty: false },
            { name: 'Dr. Hana Okoro', emoji: '🧑‍🏫', alibi: 'I was finishing a paper at home. My co-author can confirm we were on a video call until 2 AM, then I went straight to bed.', isGuilty: false },
            { name: 'Dr. Leo Brandt', emoji: '🧑‍⚕️', alibi: 'I lent my keycard to maintenance last Friday and haven\'t gotten it back. I had to be buzzed into the lab yesterday morning by Priya.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Leo claims he lent his keycard to maintenance and doesn\'t have it. But the entry logs show a keycard access at 3:17 AM — if his card was with maintenance, someone used it, and Leo would be the one who knows where it was.',
            highlights: [
                { text: 'Entry logs show the lab was accessed at 3:17 AM', source: 'scenario' },
                { text: 'lent my keycard to maintenance', source: 'suspect', suspectName: 'Dr. Leo Brandt' },
            ],
        },
        difficulty: 'tricky',
    },
    {
        scenario: 'The mayor\'s speech notes were leaked to the press before her 2 PM address on Thursday. Only her inner circle had access to the final draft, which was completed at 10 AM that morning.',
        suspects: [
            { name: 'Tom Bradley', emoji: '👨‍💼', alibi: 'I printed the draft at 10:15 AM and brought it straight to the mayor. Then I was in back-to-back meetings until noon.', isGuilty: false },
            { name: 'Karen Wu', emoji: '👩‍💼', alibi: 'I was proofreading the draft from 10:30 to 11 AM, then left for a dental appointment. I didn\'t email it to anyone.', isGuilty: false },
            { name: 'David Osei', emoji: '🧑‍💼', alibi: 'I didn\'t even see the draft. I was at the venue all morning doing AV setup for the speech. I only read the notes when everyone else did — in the press.', isGuilty: true },
            { name: 'Lisa Chen', emoji: '👩‍⚖️', alibi: 'I reviewed the legal portions of the draft and sent my edits to the mayor by 11:30 AM. Then I was in court all afternoon.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'David says he only read the notes "in the press," implying he saw the leaked version. But the press leak happened before the 2 PM speech — if he was at the venue doing AV setup all morning, how did he know the leaked version matched the final draft unless he had access to it?',
            highlights: [
                { text: 'completed at 10 AM that morning', source: 'scenario' },
                { text: 'didn\'t even see the draft', source: 'suspect', suspectName: 'David Osei' },
                { text: 'only read the notes when everyone else did — in the press', source: 'suspect', suspectName: 'David Osei' },
            ],
        },
        difficulty: 'devious',
    },
    {
        scenario: 'A vintage wine bottle worth $50,000 was swapped with a forgery at a private tasting event on Sunday afternoon. The swap had to happen between 1 PM when it was authenticated and 4 PM when it was discovered. The cellar was locked and only the sommelier had the key.',
        suspects: [
            { name: 'Henri Dubois', emoji: '🧑‍🍳', alibi: 'I, the sommelier, was leading the tasting from 1 to 3:30 PM. Thirty guests watched me the entire time. I locked the cellar at 1 PM and didn\'t reopen it until 4.', isGuilty: false },
            { name: 'Margaret Hale', emoji: '👩‍🦳', alibi: 'I was attending the tasting as a guest. I never left the main hall. Several people can vouch for me.', isGuilty: false },
            { name: 'Oscar Rinaldi', emoji: '🤵', alibi: 'I was working the bar upstairs. I came down to the cellar at 3:45 PM to grab more champagne and noticed the bottle looked different.', isGuilty: true },
            { name: 'Sylvia Tran', emoji: '👩‍🎤', alibi: 'I was performing live music in the garden from noon until 5 PM. I never went inside the building.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Oscar claims he came down to the cellar at 3:45 PM, but the scenario states only the sommelier had the key and it was locked. How did Oscar access the cellar without the key?',
            highlights: [
                { text: 'only the sommelier had the key', source: 'scenario' },
                { text: 'cellar was locked', source: 'scenario' },
                { text: 'came down to the cellar at 3:45 PM', source: 'suspect', suspectName: 'Oscar Rinaldi' },
            ],
        },
        difficulty: 'simple',
    },
    {
        scenario: 'A confidential client list was copied from a law firm\'s server at 11:42 PM on Wednesday. The office building requires badge access after 6 PM, and the server room has a separate PIN code known only to partners.',
        suspects: [
            { name: 'Rachel Adler', emoji: '👩‍⚖️', alibi: 'I left the office at 5:30 PM. My badge out-swipe confirms it. I was at a bar trivia night with friends until midnight.', isGuilty: false },
            { name: 'Jonathan Marks', emoji: '👨‍⚖️', alibi: 'I was in the office late working on a brief. I badged in at 6 AM and never left. I was on the 4th floor, not near the server room on the 2nd floor.', isGuilty: false },
            { name: 'Patricia Lowe', emoji: '👩‍💼', alibi: 'I was at home. I remotely accessed the document management system around 10 PM to download some case files, but I never touched the client database.', isGuilty: true },
            { name: 'Gregory Nash', emoji: '🧑‍💼', alibi: 'I was flying back from a deposition in Chicago. My flight landed at 1 AM Thursday. I wasn\'t even in the city.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Patricia claims she was at home but admits to remotely accessing firm systems. The server room requires a PIN known only to partners — but data can also be accessed remotely. She had remote access and admitted to being online near the time of the breach.',
            highlights: [
                { text: 'copied from a law firm\'s server at 11:42 PM', source: 'scenario' },
                { text: 'remotely accessed the document management system around 10 PM', source: 'suspect', suspectName: 'Patricia Lowe' },
                { text: 'never touched the client database', source: 'suspect', suspectName: 'Patricia Lowe' },
            ],
        },
        difficulty: 'devious',
    },
    {
        scenario: 'A museum\'s ancient coin collection was stolen during a power outage at 7:15 PM on Friday. The display case uses an electronic lock that fails open when power is lost. The museum was open late for a special event.',
        suspects: [
            { name: 'Arthur Kingsley', emoji: '🧓', alibi: 'I was giving a guided tour to a school group. We were in the Egyptian wing when the lights went out — the kids were screaming.', isGuilty: false },
            { name: 'Mei-Lin Chang', emoji: '👩‍🏫', alibi: 'I was in the gift shop stocking shelves. The emergency lights came on so I kept working. My coworker was right beside me.', isGuilty: false },
            { name: 'Roberto Vega', emoji: '🧑‍🎨', alibi: 'I was sketching in the sculpture garden outside. When the lights went out inside, I packed up because it was getting dark. I left through the east gate around 7:30.', isGuilty: true },
            { name: 'Diane Foster', emoji: '👩‍🔧', alibi: 'I was checking the HVAC system in the basement. When the power went out, I immediately went to the electrical panel to investigate.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Roberto says he was in the outdoor sculpture garden and "it was getting dark" at 7:15 PM on Friday. But he claims he was outside sketching — in late evening darkness, he wouldn\'t be able to sketch. More importantly, he says the lights went out "inside" but he should have had no way to know about the interior power outage from the garden unless he was inside.',
            highlights: [
                { text: 'power outage at 7:15 PM on Friday', source: 'scenario' },
                { text: 'the lights went out inside', source: 'suspect', suspectName: 'Roberto Vega' },
                { text: 'sketching in the sculpture garden outside', source: 'suspect', suspectName: 'Roberto Vega' },
            ],
        },
        difficulty: 'tricky',
    },
    {
        scenario: 'A signed first edition of "The Great Gatsby" disappeared from a locked display at a book fair on Saturday. The display was opened at noon for a photo session and relocked at 12:30 PM. It was discovered missing at 3 PM.',
        suspects: [
            { name: 'Catherine Wells', emoji: '👩‍🏫', alibi: 'I was manning my publisher\'s booth from 10 AM to 4 PM. I never left my station — the booth was on the opposite side of the hall.', isGuilty: false },
            { name: 'Frank Morrison', emoji: '📸', alibi: 'I was the photographer for the noon session. I shot photos of all the rare books including the Gatsby. I packed up my gear at 12:25 and headed to my next job across town.', isGuilty: false },
            { name: 'Isabella Russo', emoji: '👩‍🎓', alibi: 'I arrived at the fair at 2 PM. I was browsing the stalls and didn\'t even know about the Gatsby display until someone mentioned the theft.', isGuilty: true },
            { name: 'Howard Beck', emoji: '🧔', alibi: 'I was running a panel discussion on rare book collecting from 1 to 2:30 PM in the conference room. Fifty attendees can confirm.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Isabella claims she arrived at 2 PM and didn\'t know about the display, but the book was stolen between 12:30 PM and 3 PM. If she arrived at 2 PM, she had a 1-hour window. However, the key contradiction is she says she "didn\'t even know about the Gatsby display" — yet the display was prominently featured and the book fair\'s main attraction was widely advertised.',
            highlights: [
                { text: 'opened at noon for a photo session and relocked at 12:30 PM', source: 'scenario' },
                { text: 'arrived at the fair at 2 PM', source: 'suspect', suspectName: 'Isabella Russo' },
                { text: 'didn\'t even know about the Gatsby display', source: 'suspect', suspectName: 'Isabella Russo' },
            ],
        },
        difficulty: 'simple',
    },
    {
        scenario: 'A tech startup\'s unreleased product designs were leaked to a competitor on Monday. The files were accessed from the company VPN at 2:33 AM. Only five employees have VPN access, and the connection came from a residential IP address.',
        suspects: [
            { name: 'Aisha Patel', emoji: '👩‍💻', alibi: 'I was asleep at home. I don\'t even have my work laptop — it\'s been in the office for repairs since Friday.', isGuilty: false },
            { name: 'Chris Donovan', emoji: '🧑‍💻', alibi: 'I was gaming online until about 3 AM. My Steam activity log shows I was in a match from 1 AM to 3:15 AM.', isGuilty: true },
            { name: 'Yuki Tanaka', emoji: '👨‍💻', alibi: 'I was in Tokyo visiting family — that\'s a 14-hour time difference. It would have been 4:33 PM my time. I was at dinner with my parents.', isGuilty: false },
            { name: 'Sarah O\'Brien', emoji: '👩‍🔬', alibi: 'I was on a camping trip in a dead zone — no cell service, no WiFi. I left Friday and didn\'t get back until Tuesday morning.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Chris claims he was gaming online from 1 AM to 3:15 AM, which covers the 2:33 AM breach window. He was awake, online from a residential IP, and had VPN access. His "alibi" actually places him at a computer during the exact time of the breach.',
            highlights: [
                { text: 'accessed from the company VPN at 2:33 AM', source: 'scenario' },
                { text: 'residential IP address', source: 'scenario' },
                { text: 'gaming online until about 3 AM', source: 'suspect', suspectName: 'Chris Donovan' },
            ],
        },
        difficulty: 'tricky',
    },
    {
        scenario: 'A celebrity chef\'s secret recipe was stolen from a restaurant safe on New Year\'s Eve. The safe was opened between 10 PM and midnight while the restaurant was packed with 200 guests. The safe combination was changed that morning — only the chef and the manager knew the new code.',
        suspects: [
            { name: 'Chef Antonin', emoji: '👨‍🍳', alibi: 'I was in the kitchen all night. New Year\'s Eve is our busiest service — I didn\'t leave the line once between 6 PM and 1 AM. My entire brigade can confirm.', isGuilty: false },
            { name: 'Maya Torres', emoji: '👩‍💼', alibi: 'I was managing the front of house. I greeted guests, handled reservations, and gave the midnight toast on the microphone. Everyone saw me.', isGuilty: false },
            { name: 'Luca Fontaine', emoji: '🧑‍🍳', alibi: 'I\'m the sous chef. I stepped out for a smoke break around 11 PM for about 10 minutes. Other than that, I was on the line with Chef all night.', isGuilty: false },
            { name: 'Reginald Park', emoji: '🤵', alibi: 'I\'m a regular patron. I was at my usual table from 9 PM. I went to use the restroom near the office around 11:15 and noticed the office door was ajar, which I thought was odd. I mentioned it to Maya at midnight.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Reginald claims to be just a regular patron, but he knew the office door being ajar was unusual — and he happened to be near the office area (not near the restrooms typically) during the theft window. He waited almost an hour to mention the open door, and only he places himself near the safe during the window.',
            highlights: [
                { text: 'opened between 10 PM and midnight', source: 'scenario' },
                { text: 'went to use the restroom near the office around 11:15', source: 'suspect', suspectName: 'Reginald Park' },
                { text: 'noticed the office door was ajar', source: 'suspect', suspectName: 'Reginald Park' },
            ],
        },
        difficulty: 'devious',
    },
];

export function generateAlibiPuzzle(date: Date): AlibiPuzzle & { _solution: { guiltyName: string; contradiction: AlibiContradiction } } {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 31 + 7);

    // Pick a puzzle from the pool deterministically
    const idx = Math.floor(rng() * ALIBI_POOL.length);
    const template = ALIBI_POOL[idx];

    // Shuffle suspect order
    const shuffledSuspects = seededShuffle(template.suspects, rng);

    return {
        scenario: template.scenario,
        suspects: shuffledSuspects.map(({ isGuilty: _, ...rest }) => rest),
        difficulty: template.difficulty,
        _solution: {
            guiltyName: template.suspects.find(s => s.isGuilty)!.name,
            contradiction: template.contradiction,
        },
    };
}

export function checkAlibiGuess(puzzle: ReturnType<typeof generateAlibiPuzzle>, guessName: string): boolean {
    return puzzle._solution.guiltyName === guessName;
}

export function computeAlibiScore(
    solved: boolean,
    guessNumber: number,
    timeSeconds: number,
): number {
    if (!solved) return 0;
    const basePts = guessNumber === 1 ? 100 : 50;
    const bonusCap = guessNumber === 1 ? 50 : 25;
    const timeBonus = Math.max(0, bonusCap - Math.floor(timeSeconds / 3));
    return basePts + timeBonus;
}
