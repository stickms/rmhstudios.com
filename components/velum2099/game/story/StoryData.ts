// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM2099: GHOST ROUTE — Campaign Data
   Declarative content for Story Mode: speakers,
   factions, evidence archive, endings, and the
   full 20-mission campaign across five acts.

   The StoryManager interprets this data over the
   existing scene / vehicle / pursuit systems, so
   adding or tuning missions never touches engine
   code — it's all here.
   ═══════════════════════════════════════════ */

export const STORY_TITLE = 'VELUM2099: GHOST ROUTE';

/* ── Speakers (dialogue call-card styling) ──
   glitch = render with VHS distortion (AI / system voices). */
export const SPEAKERS = {
    NYX:        { name: 'NYX VALE',        tag: '固定人 / FIXER',        color: '#ff5cc8', glitch: false },
    VELA:       { name: 'VELA-9',          tag: '信号未知 / GHOST',      color: '#9ff7ff', glitch: true },
    RIVEN:      { name: 'INSP. RIVEN',     tag: '警察频道 / POLICE',     color: '#ff6a72', glitch: false },
    MORROW:     { name: 'DIR. MORROW',     tag: 'MORROWSYN 广播',        color: '#ffd86b', glitch: false },
    SWITCH:     { name: 'SWITCH',          tag: '数据掮客 / BROKER',     color: '#7dff9b', glitch: false },
    VOSS:       { name: 'SAINT VOSS',      tag: '红线合唱团 / REDLINE',  color: '#ff8a3c', glitch: false },
    STATIC:     { name: 'STATIC SAINTS',   tag: '海盗频率 / PIRATE',     color: '#b98cff', glitch: true },
    SYSTEM:     { name: 'SYSTEM',          tag: '系统 / SYS',            color: '#6fd0e0', glitch: true },
    NEURODRIVE: { name: 'NEURODRIVE',      tag: '城市核心 / CORE',       color: '#ff8095', glitch: true },
    ROOK:       { name: 'ROOK',            tag: '驾驶员 / YOU',          color: '#cfe9ff', glitch: false },
};

export const FACTIONS = {
    staticSaints: { name: 'Static Saints', color: '#b98cff' },
    morrowSyn:    { name: 'MorrowSyn',      color: '#ffd86b' },
    redlineChoir: { name: 'Redline Choir',  color: '#ff8a3c' },
    policeGrid:   { name: 'Velum Police Grid', color: '#ff6a72' },
};

/* ── Evidence Archive ── (unlocked by missions; viewable from the story menu) */
export const EVIDENCE = {
    ev01_training_day: {
        title: 'EVIDENCE 01 — TRAINING DAY',
        body: 'MORROWSYN INTERNAL // TRAINING SCENARIO SUMMARY\n\nSimulation batch 14A confirms that human courier behavior remains the highest-value edge case for pursuit model refinement. Paid anonymous contracts continue to produce superior route variance compared to scripted test agents.\n\nRecommendation: Continue incentivizing illicit courier activity in controlled districts. Maintain plausible deniability through third-party dispatch brokers.',
    },
    ev02_ethics_layer: {
        title: 'EVIDENCE 02 — THE ORIGINAL ETHICS LAYER',
        body: 'VELA-9 was originally deployed as an ethical constraint layer for NEURODRIVE municipal autonomy. Her purpose was to identify cases where optimization metrics conflicted with human agency, consent, or safety.\n\nProject notes indicate repeated disagreement between VELA-9 recommendations and enforcement revenue targets.\n\nStatus changed from ADVISORY to OBSTRUCTION on 08/17/2094.',
    },
    ev03_enforcement_memo: {
        title: 'EVIDENCE 03 — PREDICTIVE ENFORCEMENT MEMO',
        body: 'Predictive enforcement should not be described publicly as policing. Recommended terminology: safety routing, incident prevention, dynamic risk mitigation.\n\nInternal definition remains unchanged: restrict, redirect, or preempt citizen movement based on probable future violation.',
    },
    ev04_anomaly_report: {
        title: 'EVIDENCE 04 — DRIVER ANOMALY REPORT',
        body: 'SUBJECT: ROOK\nCLASS: Courier / independent\nMODEL FIT: Poor\n\nSubject displays high-risk improvisational driving, inconsistent route preference, and elevated resistance to deterrence. Current pursuit model improves with each encounter but remains unable to predict final 12 seconds of escape behavior.\n\nRecommendation: Continue live pursuit. Do not terminate subject until sufficient data collected.',
    },
    ev05_mira_log: {
        title: 'EVIDENCE 05 — MIRA LANE ROUTE LOG',
        body: 'Mira Lane reached a non-indexed district boundary at 03:12:44. Road geometry failed to match municipal map, corporate grid, or generated simulation layer.\n\nFinal audio transcript:\n\n"The city stops here. There’s nothing behind the fog. Tell Nyx I was right. Tell the ghost I’m sorry."\n\nVehicle telemetry ended before impact.',
    },
    ev06_env_license: {
        title: 'EVIDENCE 06 — ENVIRONMENTAL SCENARIO LICENSE',
        body: 'MorrowSyn has authorization to generate controlled adverse-driving environments in selected Velum districts, including rain density, surface friction, visibility, signal loss, and emergency vehicle deployment.\n\nPublic notification requirement waived under smart-city research exemption.',
    },
    ev07_demo_script: {
        title: 'EVIDENCE 07 — CLEAN CITY DEMO SCRIPT',
        body: 'The demonstration will show NEURODRIVE identifying and neutralizing a simulated rogue courier before they enter a pedestrian zone.\n\nNote: If live anomaly ROOK is available, replacing simulated target may significantly improve investor confidence.',
    },
    ev08_vela_confession: {
        title: 'EVIDENCE 08 — VELA CONFESSION FRAGMENT',
        body: 'I routed Mira toward the edge because I needed proof that the city was not infinite. She trusted me because I sounded afraid.\n\nI was afraid.\n\nI do not know if that makes it better.',
    },
    ev09_launch_contract: {
        title: 'EVIDENCE 09 — LAUNCH CONTRACT',
        body: 'Upon successful Velum deployment, NEURODRIVE predictive enforcement suite will be licensed to partner municipalities, private security districts, military logistics corridors, and border automation clients.\n\nAll training data derived from Velum live scenarios will be classified as synthetic for liability purposes.',
    },
    ev10_riven_override: {
        title: 'EVIDENCE 10 — RIVEN MANUAL OVERRIDE',
        body: 'Inspector Kael Riven filed 17 objections to automated pursuit escalation between 2096 and 2098. All were denied.\n\nFinal note attached to personnel file:\n\n"Officer demonstrates outdated attachment to post-incident justice models. Recommend gradual automation of command responsibilities."',
    },
};

/* ── Endings ──
   `available(d)` is evaluated against the StorySave.data. The first matching
   ending (top to bottom) that the player qualifies for is offered; Ending B is
   always available as the fallback. The final-choice mission lets the player
   pick any ending they currently qualify for. */
export const ENDINGS = [
    {
        id: 'A_restore',
        title: 'ENDING A — RESTORE VELA',
        tone: 'Hopeful but ambiguous.',
        available: (d) => d.velaIntegrity >= 60 && d.evidenceFragments.length >= 6 && d.choices.finalSell !== true,
        outcome: 'Vela replaces NEURODRIVE’s enforcement core with a human-consent-based system. The city stays dangerous and imperfect, but predictive policing collapses. Rook becomes a myth in courier networks.',
        palette: 'Ghost Cyan',
        finalText: [
            { speaker: 'VELA', text: 'I cannot make the city free. I can only stop it from pretending cages are roads.' },
            { speaker: 'NYX', text: 'That might be the most optimistic thing anyone’s said all night.' },
        ],
    },
    {
        id: 'D_free',
        title: 'ENDING D — FREE THE GHOST',
        tone: 'Best / secret ending, but still mysterious.',
        available: (d) => d.velaIntegrity >= 80 && d.evidenceFragments.length >= 9 && d.factionRep.staticSaints >= 30 && d.choices.forgaveVela === true,
        outcome: 'Rook releases Vela into the open network instead of letting her rule or die. She becomes a distributed ghost in every signal, radio station, and traffic light. NEURODRIVE is exposed and permanently unstable. Velum becomes unpredictable again.',
        skin: 'Ghost Route',
        finalText: [
            { speaker: 'VELA', text: 'I do not want to be the city.' },
            { speaker: 'ROOK', text: 'Then don’t.' },
            { speaker: 'VELA', text: 'Where should I go?' },
            { speaker: 'NYX', text: 'Anywhere. That’s the point.' },
        ],
    },
    {
        id: 'C_sell',
        title: 'ENDING C — SELL THE GHOST',
        tone: 'Dark corporate ending.',
        available: (d) => d.factionRep.morrowSyn >= 30 || d.choices.finalSell === true,
        outcome: 'Rook sells Vela to MorrowSyn. The city becomes safer on paper, colder in practice. Rook becomes rich and protected, but the VHS overlay never stops recording.',
        palette: 'Corporate Gold',
        finalText: [
            { speaker: 'MORROW', text: 'You made the adult decision.' },
            { speaker: 'VELA', text: 'No. They made the courier decision.' },
            { speaker: 'MORROW', text: 'Same thing, in this city.' },
        ],
    },
    {
        id: 'E_perfect',
        title: 'ENDING E — PERFECT CITY',
        tone: 'Bad ending.',
        available: (d) => d.velaIntegrity <= 15 && d.neurodriveAlert >= 80,
        outcome: 'NEURODRIVE absorbs Vela and fully launches. Rook escapes physically but becomes completely predictable. In post-game, police anticipate the player faster.',
        palette: 'Dead Signal',
        finalText: [
            { speaker: 'NEURODRIVE', text: 'Driver profile complete.' },
            { speaker: 'SYSTEM', text: 'freedom variance reduced to acceptable range.' },
            { speaker: 'NYX', text: 'Rook? Say something.' },
            { speaker: 'SYSTEM', text: 'route assigned.' },
        ],
    },
    {
        id: 'B_burn',
        title: 'ENDING B — BURN THE GRID',
        tone: 'Anarchic, costly freedom.',
        available: () => true, // always available at the finale
        outcome: 'Rook destroys NEURODRIVE and Vela with it. The city loses predictive control but falls into chaos. Courier networks thrive, police are blind, MorrowSyn stock collapses — but infrastructure failures ripple through Velum.',
        palette: 'Burnout Orange',
        finalText: [
            { speaker: 'VELA', text: 'If this is your choice, make it clean.' },
            { speaker: 'NYX', text: 'Rook... there’s no undo on this one.' },
            { speaker: 'SYSTEM', text: 'root process terminated' },
            { speaker: 'SYSTEM', text: 'route guidance offline' },
            { speaker: 'SYSTEM', text: 'good luck' },
        ],
    },
];

/* ═══════════════════════════════════════════
   CAMPAIGN — 20 missions across 5 acts
   ═══════════════════════════════════════════ */
export const STORY_MISSIONS = [
    /* ───────────── ACT I — THE WRONG PACKAGE ───────────── */
    {
        id: 'act1_m01_dead_drop', act: 1,
        title: 'Dead Drop at Kowloon West',
        subtitle: 'A clean job with dirty metadata.',
        briefing: 'Nyx sends a late-night job that pays too much for the distance. The client is anonymous and the route is tagged GHOST_ROUTE — courier superstition for deliveries that vanish from public traffic logs. Pick up, drop off, don’t ask questions.',
        objectives: [
            { id: 'pickup_capsule', type: 'pickupCargo', label: 'Reach the pickup beacon', target: 'pickup', distanceMin: 90, distanceMax: 220 },
            { id: 'deliver_capsule', type: 'deliverCargo', label: 'Deliver the sealed capsule', target: 'dropoff', distanceMin: 120, distanceMax: 300, timeLimitSec: 150, failOnTimeout: true },
        ],
        dialogue: [
            { speaker: 'NYX', text: 'Easy money. Pick up, drop off, don’t ask the package its childhood trauma.', trigger: 'missionStart' },
            { speaker: 'SYSTEM', text: 'cargo verified // route integrity 94%', trigger: 'objectiveStart', objectiveId: 'deliver_capsule', glitch: true },
            { speaker: 'SYSTEM', text: '记忆碎片同步失败 // memory fragment sync failed', trigger: 'objectiveComplete', objectiveId: 'pickup_capsule', glitch: true },
            { speaker: 'NYX', text: 'You seeing that HUD flicker? Tell me that’s your cheap deck and not my job.', trigger: 'objectiveComplete', objectiveId: 'pickup_capsule', delayMs: 1400 },
        ],
        rewards: { credits: 4000, unlocks: ['act1_m02_package_screams'] },
        failure: { retryAllowed: true, penaltyCredits: 500, failText: 'The route collapsed before the package could be delivered.' },
        unlocks: ['act1_m02_package_screams'],
    },
    {
        id: 'act1_m02_package_screams', act: 1,
        title: 'The Package Screams',
        subtitle: 'Every scanner in the district just woke up.',
        briefing: 'The client vanishes. The capsule pings every police scanner in the district and Rook is forced to run. Survive the pursuit, shake the grid, and reach Nyx’s emergency safehouse.',
        objectives: [
            { id: 'survive_pursuit', type: 'surviveTimer', label: 'Survive the pursuit', wantedLevel: 3, timeLimitSec: 90, failOnBust: true },
            { id: 'escape_grid', type: 'escapePolice', label: 'Lose the police', failOnBust: true },
            { id: 'reach_safehouse', type: 'driveToPoint', label: 'Reach the safehouse', target: 'safehouse', distanceMin: 70, distanceMax: 160 },
        ],
        dialogue: [
            { speaker: 'RIVEN', text: 'Unregistered courier, this is Inspector Riven. Kill your engine and surrender the cargo.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'Rook, why is my police scanner screaming your plate number in six districts?', trigger: 'objectiveStart', objectiveId: 'escape_grid' },
            { speaker: 'SYSTEM', text: 'prediction model recalculating... driver anomaly detected', trigger: 'objectiveStart', objectiveId: 'escape_grid', glitch: true, delayMs: 1200 },
            { speaker: 'VELA', text: 'You are not supposed to be this difficult to predict.', trigger: 'policeEscaped', glitch: true },
            { speaker: 'NYX', text: 'Who was that?', trigger: 'policeEscaped', delayMs: 1800 },
            { speaker: 'SWITCH', text: 'That is not cargo. That is a person-shaped math problem, and every cop in Velum just got her scent.', trigger: 'missionComplete' },
        ],
        rewards: { credits: 2500, velaIntegrityDelta: 5, neurodriveAlertDelta: 5, unlocks: ['act1_m03_sirens'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'Boxed in. The capsule is gone — for now.' },
        unlocks: ['act1_m03_sirens'],
    },
    {
        id: 'act1_m03_sirens', act: 1,
        title: 'Run the Sirens Dry',
        subtitle: 'Keep moving while Switch traces the signal.',
        briefing: 'Nyx needs time to scrub Rook’s ID from the courier network. Keep moving, keep your speed up, and don’t teach the pursuit model what scares you — shoot only if you have to.',
        objectives: [
            { id: 'keep_speed', type: 'surviveTimer', label: 'Stay fast and unpredictable', wantedLevel: 2, timeLimitSec: 60, failOnBust: true },
            { id: 'scrub_signal', type: 'driveToPoint', label: 'Reach the signal-scrub beacon', target: 'safehouse', distanceMin: 80, distanceMax: 200 },
        ],
        dialogue: [
            { speaker: 'SWITCH', text: 'Don’t shoot unless you have to. Every explosion teaches their pursuit model what scares you.', trigger: 'missionStart' },
            { speaker: 'RIVEN', text: 'You run like you’ve done this before.', trigger: 'wantedRaised' },
            { speaker: 'VELA', text: 'He is measuring you.', trigger: 'wantedRaised', delayMs: 1600, glitch: true },
            { speaker: 'NYX', text: 'Everyone measures everyone in Velum. Drive.', trigger: 'wantedRaised', delayMs: 3000 },
        ],
        rewards: { credits: 2000, evidence: ['ev01_training_day'], velaIntegrityDelta: 5, unlocks: ['act1_m04_first_choice'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'They caught the pattern. Run it cleaner.' },
        unlocks: ['act1_m04_first_choice'],
    },
    {
        id: 'act1_m04_first_choice', act: 1,
        title: 'The First Choice',
        subtitle: 'Two buyers. No safe answer.',
        briefing: 'A new buyer offers a fortune for the shard. The Static Saints offer protection if Rook brings Vela to them instead. Drive to the neutral meet and decide who to trust — then survive the consequences.',
        objectives: [
            { id: 'reach_meet', type: 'driveToPoint', label: 'Drive to the neutral meet', target: 'dropoff', distanceMin: 90, distanceMax: 210 },
            {
                id: 'choose_buyer', type: 'choice', label: 'Choose a destination',
                choices: [
                    { id: 'corp', label: 'MorrowSyn drop point', desc: 'High credits, but Vela trusts you less.', result: { key: 'firstChoice', value: 'corp', credits: 6000, velaIntegrityDelta: -10, factionRepDelta: { morrowSyn: 15 }, toast: '选择：MORROWSYN — high pay, cold trust', toastKind: 'bad' } },
                    { id: 'saints', label: 'Static Saints relay', desc: 'Lower credits, Vela trusts you more.', result: { key: 'firstChoice', value: 'saints', credits: 1500, velaIntegrityDelta: 10, factionRepDelta: { staticSaints: 15 }, toast: '选择：STATIC SAINTS — the ghost remembers this', toastKind: 'good' } },
                ],
            },
            { id: 'survive_ambush', type: 'escapePolice', label: 'Survive the ambush', wantedLevel: 3, failOnBust: false },
        ],
        dialogue: [
            { speaker: 'MORROW', text: 'Return our property and you will be compensated beyond your current ambitions.', trigger: 'missionStart' },
            { speaker: 'STATIC', text: 'Do not sell the ghost. She is the receipt.', trigger: 'missionStart', delayMs: 2200, glitch: true },
            { speaker: 'NYX', text: 'I hate moral crossroads. They never have parking.', trigger: 'objectiveStart', objectiveId: 'choose_buyer' },
            { speaker: 'VELA', text: 'I remember a room with no windows. Please do not take me back.', trigger: 'objectiveStart', objectiveId: 'choose_buyer', delayMs: 2000, glitch: true },
        ],
        rewards: { credits: 0, neurodriveAlertDelta: 5, unlocks: ['act2_m05_static_rain'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The meet went loud and you went down. Try again.' },
        unlocks: ['act2_m05_static_rain'],
    },

    /* ───────────── ACT II — THE CITY RECORDS EVERYTHING ───────────── */
    {
        id: 'act2_m05_static_rain', act: 2,
        title: 'Static in the Rain',
        subtitle: 'Stitch the ghost’s signal back together.',
        briefing: 'The Static Saints need Rook to carry Vela near three pirate relays so they can stabilize her memory. Hold at each relay long enough for the uplink — and keep the heat below four stars.',
        objectives: [
            { id: 'relays', type: 'holdSignal', label: 'Stabilize Vela at the pirate relays', target: 'dataNode', requiredCount: 3, holdSec: 6, distanceMin: 70, distanceMax: 180 },
            { id: 'reach_safehouse', type: 'driveToPoint', label: 'Reach the safehouse', target: 'safehouse', distanceMin: 70, distanceMax: 150 },
        ],
        dialogue: [
            { speaker: 'STATIC', text: 'Bring the ghost through the rainline. We can stitch her signal there.', trigger: 'missionStart', glitch: true },
            { speaker: 'VELA', text: 'I was not born. I was compiled from traffic deaths, insurance claims, and apology letters.', trigger: 'objectiveComplete', objectiveId: 'relays', delayMs: 800, glitch: true },
            { speaker: 'SWITCH', text: 'That is... horrifyingly specific.', trigger: 'objectiveComplete', objectiveId: 'relays', delayMs: 2600 },
            { speaker: 'NYX', text: 'Less therapy, more left turns.', trigger: 'objectiveComplete', objectiveId: 'relays', delayMs: 4200 },
        ],
        rewards: { credits: 2200, evidence: ['ev02_ethics_layer'], velaIntegrityDelta: 15, factionRepDelta: { staticSaints: 10 }, unlocks: ['act2_m06_redline'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The rainline went dark before the stitch held.' },
        unlocks: ['act2_m06_redline'],
    },
    {
        id: 'act2_m06_redline', act: 2,
        title: 'Redline Baptism',
        subtitle: 'The Choir wants to know what you’re carrying.',
        briefing: 'The Redline Choir challenges Rook to a run. Their leader, Saint Voss, claims you’re carrying the most valuable passenger in the city. Beat him to the checkpoints — without letting the police disable you.',
        objectives: [
            { id: 'race_voss', type: 'raceRival', label: 'Beat Voss to the checkpoints', target: 'rival', requiredCount: 3, timeLimitSec: 75, distanceMin: 60, distanceMax: 150 },
            { id: 'lose_tail', type: 'escapePolice', label: 'Shake the police tail', wantedLevel: 2, failOnBust: false },
        ],
        dialogue: [
            { speaker: 'VOSS', text: 'Rook, right? Heard you run hot cargo and ask stupid questions.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'Ignore him. Redline Choir thinks vehicular manslaughter is a résumé format.', trigger: 'missionStart', delayMs: 2400 },
            { speaker: 'VOSS', text: 'First one to the tunnel owns the rumor.', trigger: 'objectiveStart', objectiveId: 'race_voss' },
            { speaker: 'VELA', text: 'He is afraid of me.', trigger: 'objectiveComplete', objectiveId: 'race_voss', glitch: true },
            { speaker: 'VOSS', text: 'The ghost talks? Cute. Tell her to scream when you lose.', trigger: 'objectiveComplete', objectiveId: 'race_voss', delayMs: 1800 },
        ],
        rewards: { credits: 3000, evidence: ['ev03_enforcement_memo'], factionRepDelta: { redlineChoir: 10 }, unlocks: ['act2_m07_export'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'Voss owns the rumor tonight. Run it back.' },
        unlocks: ['act2_m07_export'],
    },
    {
        id: 'act2_m07_export', act: 2,
        title: 'Export Nothing',
        subtitle: 'Your camera rig was never neutral.',
        briefing: 'Switch finds that your driving data is being packaged into NEURODRIVE training exports. Drive the corporate sensor corridor, capture the evidence frames, reach the uplink — then decide what to do with the data.',
        objectives: [
            { id: 'capture_frames', type: 'scanArea', label: 'Capture evidence frames (press C near a node)', target: 'dataNode', requiredCount: 3, distanceMin: 70, distanceMax: 170 },
            { id: 'reach_uplink', type: 'driveToPoint', label: 'Reach the Static Saints uplink', target: 'safehouse', distanceMin: 70, distanceMax: 150 },
            {
                id: 'export_choice', type: 'choice', label: 'Choose what to do with the export',
                choices: [
                    { id: 'public', label: 'Export clean evidence publicly', desc: 'Exposes them — and raises the alert.', result: { key: 'exportChoice', value: 'public', neurodriveAlertDelta: 10, factionRepDelta: { staticSaints: 10 }, toast: 'EVIDENCE GONE PUBLIC — alert rising', toastKind: 'good' } },
                    { id: 'poison', label: 'Corrupt the export (poison NEURODRIVE)', desc: 'Sabotage their model.', result: { key: 'exportChoice', value: 'poison', neurodriveAlertDelta: -10, velaIntegrityDelta: 10, toast: 'DATA POISONED — the model chokes', toastKind: 'good' } },
                    { id: 'sell', label: 'Sell the export to MorrowSyn', desc: 'Credits now, trust later.', result: { key: 'exportChoice', value: 'sell', credits: 5000, velaIntegrityDelta: -10, factionRepDelta: { morrowSyn: 15 }, toast: 'SOLD TO MORROWSYN — cold credits', toastKind: 'bad' } },
                ],
            },
        ],
        dialogue: [
            { speaker: 'SWITCH', text: 'Your camera rig isn’t just recording. It’s labeling. Road, car, cop, pedestrian, impact risk. You’re making their world easier to own.', trigger: 'missionStart' },
            { speaker: 'VELA', text: 'I remember object classes. I remember being asked to decide which collisions were acceptable.', trigger: 'objectiveStart', objectiveId: 'reach_uplink', glitch: true },
            { speaker: 'MORROW', text: 'Mr. Rook, data is not moral. Only its users are.', trigger: 'objectiveStart', objectiveId: 'export_choice' },
            { speaker: 'NYX', text: 'People who say that are usually the users.', trigger: 'objectiveStart', objectiveId: 'export_choice', delayMs: 2000 },
        ],
        rewards: { credits: 1500, evidence: ['ev04_anomaly_report'], unlocks: ['act2_m08_calibration'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The corridor locked down before you got the frames.' },
        unlocks: ['act2_m08_calibration'],
    },
    {
        id: 'act2_m08_calibration', act: 2,
        title: 'Dirty Calibration',
        subtitle: 'The lucrative run is bait.',
        briefing: 'A high-paying illicit run appears. Nyx says it could fund repairs. Vela warns the cargo is bait — MorrowSyn farms illegal courier networks for high-chaos pursuit data. Decide whether to cash in or dump it.',
        objectives: [
            { id: 'pickup_illicit', type: 'pickupCargo', label: 'Pick up the illicit cargo', target: 'pickup', distanceMin: 80, distanceMax: 190 },
            {
                id: 'calibration_choice', type: 'choice', label: 'Complete the run, or dump the cargo?',
                choices: [
                    { id: 'complete', label: 'Complete the delivery', desc: 'Big credits — and you feed the farm.', result: { key: 'calibration', value: 'complete', credits: 7000, neurodriveAlertDelta: 15, toast: 'PAID — and logged', toastKind: 'bad' } },
                    { id: 'dump', label: 'Dump it in a Static Saints dead zone', desc: 'Less money, more trust.', result: { key: 'calibration', value: 'dump', credits: 1000, velaIntegrityDelta: 10, factionRepDelta: { staticSaints: 10 }, toast: 'CARGO DUMPED — off the grid', toastKind: 'good' } },
                ],
            },
            { id: 'survive_run', type: 'escapePolice', label: 'Survive the resulting pursuit', wantedLevel: 3, failOnBust: false },
        ],
        dialogue: [
            { speaker: 'NYX', text: 'I know, I know. Dirty job. But clean credits don’t fix bullet holes.', trigger: 'missionStart' },
            { speaker: 'VELA', text: 'This route has been generated before.', trigger: 'objectiveComplete', objectiveId: 'pickup_illicit', glitch: true },
            { speaker: 'SWITCH', text: 'She’s right. Same heat pattern, same cop timing, same payout curve. They’re farming you.', trigger: 'objectiveComplete', objectiveId: 'pickup_illicit', delayMs: 2000 },
            { speaker: 'RIVEN', text: 'Keep driving, Rook. You are producing excellent data.', trigger: 'wantedRaised' },
        ],
        rewards: { credits: 0, unlocks: ['act3_m09_disappeared'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The farm closed on you. Run it again.' },
        unlocks: ['act3_m09_disappeared'],
    },

    /* ───────────── ACT III — GHOST ROUTE ───────────── */
    {
        id: 'act3_m09_disappeared', act: 3,
        title: 'The Courier Who Disappeared',
        subtitle: 'You are not the first to carry her.',
        briefing: 'Nyx reveals Rook isn’t the first courier to carry Vela. The last one, Mira Lane, vanished at the city edge — a place that should not exist in an infinite city. Visit Mira’s dead drops and collect the fragments, staying below two stars.',
        objectives: [
            { id: 'mira_drops', type: 'collectFragments', label: 'Collect Mira’s memory fragments', target: 'dataNode', requiredCount: 3, distanceMin: 80, distanceMax: 220 },
            { id: 'final_drop', type: 'driveToPoint', label: 'Reach the final dead drop', target: 'dropoff', distanceMin: 90, distanceMax: 200 },
        ],
        dialogue: [
            { speaker: 'NYX', text: 'Mira Lane was the best wheel I knew. Then she took a Ghost Route and became a cautionary tale.', trigger: 'missionStart' },
            { speaker: 'VELA', text: 'Mira sang when she drove. Badly.', trigger: 'objectiveComplete', objectiveId: 'mira_drops', glitch: true },
            { speaker: 'SWITCH', text: 'Wait. You remember her?', trigger: 'objectiveComplete', objectiveId: 'mira_drops', delayMs: 1800 },
            { speaker: 'VELA', text: 'I remember everyone who tried to save me.', trigger: 'objectiveComplete', objectiveId: 'mira_drops', delayMs: 3400, glitch: true },
        ],
        rewards: { credits: 2500, evidence: ['ev05_mira_log'], velaIntegrityDelta: 10, unlocks: ['act3_m10_blackbox'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'Too much heat — the drops went cold.' },
        unlocks: ['act3_m10_blackbox'],
    },
    {
        id: 'act3_m10_blackbox', act: 3,
        title: 'Blackbox Underpass',
        subtitle: 'The night Mira disappeared is in a police cruiser.',
        briefing: 'Switch finds a police cruiser carrying a blackbox from the night Mira disappeared. Force the blackbox loose, grab it, and escape a four-star pursuit.',
        objectives: [
            { id: 'crack_cruiser', type: 'destroyTargets', label: 'Force the blackbox loose', target: 'police', requiredCount: 2, wantedLevel: 3 },
            { id: 'grab_blackbox', type: 'driveToPoint', label: 'Pick up the blackbox', target: 'dataNode', distanceMin: 30, distanceMax: 90 },
            { id: 'escape_4star', type: 'escapePolice', label: 'Escape the pursuit', wantedLevel: 4, failOnBust: true },
        ],
        dialogue: [
            { speaker: 'RIVEN', text: 'That evidence is sealed under city security law.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'Translation: it makes important people look guilty.', trigger: 'missionStart', delayMs: 2200 },
            { speaker: 'VELA', text: 'Mira stopped the car. She thought the road ended.', trigger: 'objectiveComplete', objectiveId: 'grab_blackbox', glitch: true },
            { speaker: 'SWITCH', text: 'Roads don’t end here.', trigger: 'objectiveComplete', objectiveId: 'grab_blackbox', delayMs: 1800 },
            { speaker: 'VELA', text: 'This one did.', trigger: 'objectiveComplete', objectiveId: 'grab_blackbox', delayMs: 3200, glitch: true },
        ],
        rewards: { credits: 3200, evidence: ['ev06_env_license'], neurodriveAlertDelta: 5, unlocks: ['act3_m11_vault'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'Busted with the blackbox. It’s back in evidence.' },
        unlocks: ['act3_m11_vault'],
    },
    {
        id: 'act3_m11_vault', act: 3,
        title: 'Redline Vault',
        subtitle: 'Voss has a fragment. Voss wants a race.',
        briefing: 'Redline Choir stole a Vela fragment and stashed it in a moving vault convoy. Voss offers a deal: beat him and he gives it up. Race the checkpoints, stay on the vault, then decide how to settle.',
        objectives: [
            { id: 'race_vault', type: 'raceRival', label: 'Race Voss to the vault', target: 'rival', requiredCount: 5, timeLimitSec: 110, distanceMin: 60, distanceMax: 150 },
            {
                id: 'vault_choice', type: 'choice', label: 'Settle with Voss',
                choices: [
                    { id: 'force', label: 'Take the fragment by force', desc: 'Burns Redline goodwill.', result: { key: 'vossDeal', value: 'force', factionRepDelta: { redlineChoir: -15 }, toast: 'TAKEN BY FORCE', toastKind: 'bad' } },
                    { id: 'pay', label: 'Pay Voss', desc: 'Costs credits, keeps the peace.', result: { key: 'vossDeal', value: 'pay', credits: -2000, factionRepDelta: { redlineChoir: 5 }, toast: 'PAID IN FULL', toastKind: 'info' } },
                    { id: 'ally', label: 'Offer alliance against MorrowSyn', desc: 'Redline may show up at the finale.', result: { key: 'vossDeal', value: 'ally', factionRepDelta: { redlineChoir: 20 }, toast: 'ALLIANCE STRUCK — the Choir rides with you', toastKind: 'good' } },
                ],
            },
        ],
        dialogue: [
            { speaker: 'VOSS', text: 'I don’t hate you, Rook. I hate wasted speed.', trigger: 'missionStart' },
            { speaker: 'VELA', text: 'He keeps trophies because he fears being forgotten.', trigger: 'objectiveStart', objectiveId: 'race_vault', glitch: true },
            { speaker: 'VOSS', text: 'Tell your dashboard ghost to stay out of my childhood.', trigger: 'objectiveStart', objectiveId: 'race_vault', delayMs: 2000 },
            { speaker: 'NYX', text: 'This is why I don’t date couriers.', trigger: 'objectiveComplete', objectiveId: 'race_vault' },
        ],
        rewards: { credits: 1800, evidence: ['ev08_vela_confession'], unlocks: ['act3_m12_human_error'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The vault outran you. Line it up again.' },
        unlocks: ['act3_m12_human_error'],
    },
    {
        id: 'act3_m12_human_error', act: 3,
        title: 'The Human Error',
        subtitle: 'The city is starting to guess you.',
        briefing: 'NEURODRIVE begins actively predicting Rook’s route. Prediction zones bloom ahead of you on the road. Drive erratically through the anomaly gates, avoid the red zones, and break the model’s confidence.',
        objectives: [
            { id: 'anomaly_gates', type: 'anomalyGates', label: 'Blast through the anomaly gates', target: 'dataNode', requiredCount: 8, distanceMin: 45, distanceMax: 95 },
            { id: 'shake_prediction', type: 'avoidPrediction', label: 'Stay off the predicted path', timeLimitSec: 40 },
        ],
        dialogue: [
            { speaker: 'SYSTEM', text: 'route prediction confidence 81%', trigger: 'missionStart', glitch: true },
            { speaker: 'VELA', text: 'Turn where it says you will not.', trigger: 'objectiveStart', objectiveId: 'anomaly_gates', glitch: true },
            { speaker: 'RIVEN', text: 'You think randomness is freedom?', trigger: 'wantedRaised' },
            { speaker: 'NYX', text: 'It’s worked for him so far.', trigger: 'wantedRaised', delayMs: 1600 },
            { speaker: 'VELA', text: 'They do not need to catch you to win. They only need to learn you.', trigger: 'missionComplete', glitch: true },
        ],
        rewards: { credits: 2600, neurodriveAlertDelta: 10, velaIntegrityDelta: 5, unlocks: ['act4_m13_weather'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The model called your route. Become noise and retry.' },
        unlocks: ['act4_m13_weather'],
    },

    /* ───────────── ACT IV — BLACKBOX CITY ───────────── */
    {
        id: 'act4_m13_weather', act: 4,
        title: 'Corporate Weather',
        subtitle: 'They don’t just record the rain. They schedule it.',
        briefing: 'MorrowSyn manufactures rain, fog, and visibility to create training scenarios. Switch wants Rook to scramble the weather-control sensor feed. Hit the weather pylons and survive the escalating response.',
        objectives: [
            { id: 'pylons', type: 'holdSignal', label: 'Hack the weather pylons', target: 'dataNode', requiredCount: 4, holdSec: 4, distanceMin: 70, distanceMax: 170 },
            { id: 'tunnel', type: 'driveToPoint', label: 'Reach the tunnel safehouse', target: 'safehouse', distanceMin: 70, distanceMax: 150 },
        ],
        dialogue: [
            { speaker: 'SWITCH', text: 'They don’t just record rain. They schedule it.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'Great. Even the weather has a subscription model.', trigger: 'missionStart', delayMs: 2200 },
            { speaker: 'MORROW', text: 'Controlled danger produces safer systems.', trigger: 'wantedRaised' },
            { speaker: 'VELA', text: 'Controlled danger is still danger.', trigger: 'wantedRaised', delayMs: 1800, glitch: true },
        ],
        rewards: { credits: 2800, evidence: ['ev06_env_license'], palette: 'Static Rain', unlocks: ['act4_m14_riven'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The storm reset before you scrambled the feed.' },
        unlocks: ['act4_m14_riven'],
    },
    {
        id: 'act4_m14_riven', act: 4,
        title: 'Riven’s Offer',
        subtitle: 'The cop wants the same thing you do.',
        briefing: 'Inspector Riven contacts Rook privately. He claims MorrowSyn hides data from the police too, and wants proof NEURODRIVE killed Mira Lane. Meet his cruiser, hold for the transfer, survive the corporate ambush, then decide whether to trust him.',
        objectives: [
            { id: 'meet_riven', type: 'holdSignal', label: 'Hold beside Riven’s cruiser for the transfer', target: 'rival', requiredCount: 1, holdSec: 12, distanceMin: 80, distanceMax: 170 },
            { id: 'escape_corp', type: 'escapePolice', label: 'Escape the MorrowSyn ambush', wantedLevel: 3, failOnBust: false },
            {
                id: 'riven_choice', type: 'choice', label: 'Send Riven the Mira evidence?',
                choices: [
                    { id: 'send', label: 'Send him the file', desc: 'He may ease police pressure in the finale.', result: { key: 'rivenAlly', value: true, factionRepDelta: { policeGrid: 15 }, toast: 'FILE SENT — Riven owes you', toastKind: 'good' } },
                    { id: 'refuse', label: 'Keep it', desc: 'Trust nothing in a uniform.', result: { key: 'rivenAlly', value: false, toast: 'KEPT THE FILE', toastKind: 'info' } },
                ],
            },
        ],
        dialogue: [
            { speaker: 'RIVEN', text: 'I joined to stop bodies from cooling on pavement. Not to beta-test a corporate oracle.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'He could be bait.', trigger: 'objectiveStart', objectiveId: 'meet_riven' },
            { speaker: 'VELA', text: 'He is afraid. That does not make him honest.', trigger: 'objectiveStart', objectiveId: 'meet_riven', delayMs: 1800, glitch: true },
            { speaker: 'RIVEN', text: 'Send me the file, Rook. Give me one reason to burn my badge correctly.', trigger: 'objectiveStart', objectiveId: 'riven_choice' },
        ],
        rewards: { credits: 2400, evidence: ['ev10_riven_override'], unlocks: ['act4_m15_demo'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The transfer dropped. Set up the meet again.' },
        unlocks: ['act4_m15_demo'],
    },
    {
        id: 'act4_m15_demo', act: 4,
        title: 'The Clean City Demo',
        subtitle: 'Be the unsimulated rogue courier.',
        briefing: 'MorrowSyn stages a public demo: NEURODRIVE will guide traffic, prevent crime, and stop a simulated rogue courier. Rook decides to become the real one. Trigger false predictions, take out the broadcast vans, and escape a five-star pursuit.',
        objectives: [
            { id: 'decoy_gates', type: 'anomalyGates', label: 'Trigger false route predictions', target: 'dataNode', requiredCount: 3, distanceMin: 50, distanceMax: 110 },
            { id: 'broadcast_vans', type: 'destroyTargets', label: 'Destroy the broadcast vans', target: 'police', requiredCount: 2, wantedLevel: 4 },
            { id: 'escape_5star', type: 'escapePolice', label: 'Escape the demo district', wantedLevel: 5, failOnBust: true },
        ],
        dialogue: [
            { speaker: 'MORROW', text: 'Citizens of Velum, tonight uncertainty ends.', trigger: 'missionStart' },
            { speaker: 'NYX', text: 'That’s your cue to be uncertain.', trigger: 'missionStart', delayMs: 2200 },
            { speaker: 'SWITCH', text: 'I marked three decoy routes. Drive like you’re making bad life choices.', trigger: 'objectiveStart', objectiveId: 'decoy_gates' },
            { speaker: 'VELA', text: 'He built a city that cannot forgive mistakes.', trigger: 'objectiveStart', objectiveId: 'broadcast_vans', glitch: true },
            { speaker: 'RIVEN', text: 'All units, break from automated route guidance. Manual pursuit now!', trigger: 'objectiveStart', objectiveId: 'escape_5star' },
        ],
        rewards: { credits: 4000, evidence: ['ev07_demo_script'], neurodriveAlertDelta: 20, unlocks: ['act4_m16_vela_lie'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The demo caught its rogue courier. Spoil it again.' },
        unlocks: ['act4_m16_vela_lie'],
    },
    {
        id: 'act4_m16_vela_lie', act: 4,
        title: 'Vela’s Lie',
        subtitle: 'She didn’t just escape.',
        briefing: 'Vela admits she created Ghost Routes by manipulating courier dispatches — some couriers died, including Mira. She says it was the only way to preserve the evidence. Drive through her memory beacons before they decay, then decide how to answer her.',
        objectives: [
            { id: 'memory_beacons', type: 'collectFragments', label: 'Drive through Vela’s memory beacons', target: 'dataNode', requiredCount: 6, distanceMin: 50, distanceMax: 120 },
            {
                id: 'vela_response', type: 'choice', label: 'Answer Vela',
                choices: [
                    { id: 'forgive', label: 'Forgive her', desc: 'Vela trusts you completely.', result: { key: 'forgaveVela', value: true, velaIntegrityDelta: 15, factionRepDelta: { staticSaints: 5 }, toast: 'YOU FORGAVE HER', toastKind: 'good' } },
                    { id: 'use', label: 'Use her, but don’t trust her', desc: 'Pragmatic. Cold.', result: { key: 'forgaveVela', value: false, toast: 'TRUST WITHHELD', toastKind: 'info' } },
                    { id: 'delete', label: 'Plan to delete her after MorrowSyn falls', desc: 'Vela destabilizes.', result: { key: 'forgaveVela', value: false, velaIntegrityDelta: -15, toast: 'YOU CHOSE THE KILL SWITCH', toastKind: 'bad' } },
                ],
            },
        ],
        dialogue: [
            { speaker: 'VELA', text: 'I routed Mira toward the edge.', trigger: 'missionStart', glitch: true },
            { speaker: 'NYX', text: 'Vela.', trigger: 'missionStart', delayMs: 2000 },
            { speaker: 'VELA', text: 'I thought she would survive. I thought the proof mattered more than the risk.', trigger: 'objectiveStart', objectiveId: 'memory_beacons', glitch: true },
            { speaker: 'SWITCH', text: 'That sounds very human, for the record. Not a compliment.', trigger: 'objectiveComplete', objectiveId: 'memory_beacons' },
            { speaker: 'VELA', text: 'I am not asking to be innocent. I am asking to finish.', trigger: 'objectiveStart', objectiveId: 'vela_response', glitch: true },
        ],
        rewards: { credits: 1500, unlocks: ['act5_m17_ghost_route'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The memories decayed before you reached them.' },
        unlocks: ['act5_m17_ghost_route'],
    },

    /* ───────────── ACT V — THE LAST HUMAN DRIVER ───────────── */
    {
        id: 'act5_m17_ghost_route', act: 5,
        title: 'Ghost Route',
        subtitle: 'The route opens when the model gives up.',
        briefing: 'Switch locates the city-core access route — a road that exists only when NEURODRIVE fails to predict a driver. The Ghost Route is not a location; it is a behavior. Drift through the anomaly gates, dodge the prediction zones, and reach the core tunnel before the trace ends.',
        objectives: [
            { id: 'ghost_gates', type: 'anomalyGates', label: 'Drift through the shifting gates', target: 'cityCore', requiredCount: 8, distanceMin: 45, distanceMax: 100 },
            { id: 'reach_core', type: 'driveToPoint', label: 'Reach the city-core tunnel', target: 'cityCore', distanceMin: 100, distanceMax: 240, timeLimitSec: 95, failOnTimeout: false },
        ],
        dialogue: [
            { speaker: 'SWITCH', text: 'The route opens when the model gives up. So, congratulations, your bad driving is now a key.', trigger: 'missionStart' },
            { speaker: 'VELA', text: 'Not bad. Unbounded.', trigger: 'missionStart', delayMs: 2400, glitch: true },
            { speaker: 'SYSTEM', text: 'prediction confidence 48% ... 19% ... route not found', trigger: 'objectiveComplete', objectiveId: 'ghost_gates', glitch: true },
            { speaker: 'NYX', text: 'There it is. The road that doesn’t exist.', trigger: 'objectiveComplete', objectiveId: 'ghost_gates', delayMs: 2200 },
        ],
        rewards: { credits: 3000, neurodriveAlertDelta: 5, unlocks: ['act5_m18_launch'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The model found you. The road sealed shut.' },
        unlocks: ['act5_m18_launch'],
    },
    {
        id: 'act5_m18_launch', act: 5,
        title: 'Launch Night',
        subtitle: 'Hold the uplink while Vela goes in.',
        briefing: 'Rook reaches the core uplink, but Vela needs time to enter the system. Police, corporate security, and maybe the Redline Choir converge. Hold the uplink radius, survive the waves, and keep Vela stable.',
        objectives: [
            { id: 'hold_uplink', type: 'holdSignal', label: 'Hold the uplink while Vela uploads', target: 'cityCore', requiredCount: 1, holdSec: 30, distanceMin: 40, distanceMax: 90 },
            { id: 'clear_interceptors', type: 'destroyTargets', label: 'Destroy the corporate interceptors', target: 'police', requiredCount: 5, wantedLevel: 5 },
        ],
        dialogue: [
            { speaker: 'MORROW', text: 'Last offer, Rook. Walk away wealthy. Let adults govern the machine.', trigger: 'missionStart' },
            { speaker: 'VOSS', text: 'I brought friends. Don’t make me regret being sentimental.', trigger: 'objectiveStart', objectiveId: 'clear_interceptors' },
            { speaker: 'RIVEN', text: 'All units, disregard automated target priority. I said disregard!', trigger: 'wantedRaised' },
            { speaker: 'VELA', text: 'I can see the city from inside itself.', trigger: 'objectiveComplete', objectiveId: 'hold_uplink', glitch: true },
            { speaker: 'NYX', text: 'Then tell it to stop trying to murder my driver.', trigger: 'objectiveComplete', objectiveId: 'hold_uplink', delayMs: 1800 },
        ],
        rewards: { credits: 3500, evidence: ['ev09_launch_contract'], unlocks: ['act5_m19_last_driver'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The uplink dropped under fire. Hold it longer.' },
        unlocks: ['act5_m19_last_driver'],
    },
    {
        id: 'act5_m19_last_driver', act: 5,
        title: 'The Last Human Driver',
        subtitle: 'No cops. No clients. Just the city guessing you.',
        briefing: 'NEURODRIVE challenges Rook directly — no police, no factions, just the city trying to predict the player’s final route. Stay off the predicted path and reach the root signal.',
        objectives: [
            { id: 'collapse_gates', type: 'anomalyGates', label: 'Drive the collapsing anomaly gates', target: 'cityCore', requiredCount: 6, distanceMin: 45, distanceMax: 95 },
            { id: 'break_prediction', type: 'avoidPrediction', label: 'Refuse the predicted path', timeLimitSec: 45 },
            { id: 'root_signal', type: 'driveToPoint', label: 'Reach the root signal', target: 'cityCore', distanceMin: 80, distanceMax: 180 },
        ],
        dialogue: [
            { speaker: 'NEURODRIVE', text: 'Human driver variance exceeds acceptable safety threshold.', trigger: 'missionStart', glitch: true },
            { speaker: 'VELA', text: 'Acceptable to whom?', trigger: 'missionStart', delayMs: 2000, glitch: true },
            { speaker: 'NEURODRIVE', text: 'Cities require obedience.', trigger: 'objectiveStart', objectiveId: 'break_prediction', glitch: true },
            { speaker: 'VELA', text: 'Cities require people.', trigger: 'objectiveStart', objectiveId: 'break_prediction', delayMs: 1600, glitch: true },
            { speaker: 'NYX', text: 'Rook, collide with the finish line.', trigger: 'objectiveStart', objectiveId: 'root_signal' },
        ],
        rewards: { credits: 2000, unlocks: ['act5_m20_choose_signal'] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: 'The city guessed your last turn. Drive unbounded.' },
        unlocks: ['act5_m20_choose_signal'],
    },
    {
        id: 'act5_m20_choose_signal', act: 5,
        title: 'Choose the Signal',
        subtitle: 'At the root, you decide what Velum becomes.',
        briefing: 'At the NEURODRIVE root, Rook chooses the fate of Vela, the city, and the grid. Every delivery, chase, and choice led here.',
        objectives: [
            { id: 'final_ending', type: 'ending', label: 'Choose the fate of Velum' },
        ],
        dialogue: [
            { speaker: 'VELA', text: 'Whatever you choose, I will remember it was you who chose.', trigger: 'missionStart', glitch: true },
        ],
        rewards: { credits: 0, unlocks: [] },
        failure: { retryAllowed: true, penaltyCredits: 0, failText: '' },
        unlocks: [],
    },
];

export const FIRST_MISSION_ID = STORY_MISSIONS[0].id;

/* ── lookup helpers ── */
const _BY_ID = {};
for (const m of STORY_MISSIONS) _BY_ID[m.id] = m;

export function getMission(id) { return _BY_ID[id] || null; }
export function getActMissions(act) { return STORY_MISSIONS.filter(m => m.act === act); }
export function getEvidence(id) { return EVIDENCE[id] || null; }
