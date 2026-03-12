/**
 * Share string generation for all Daily Puzzle modes.
 */

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const ALIBI_SOLVED_QUIPS = [
    'The alibi crumbled under pressure.',
    'Elementary, my dear Watson.',
    'No one escapes the truth.',
    'Justice has been served.',
    'Case closed before the coffee got cold.',
    'The liar never had a chance.',
    'Sharp eye. Sharper mind.',
    'Another case for the wall.',
    'The contradiction was hiding in plain sight.',
    'Detective instincts on point.',
];

const ALIBI_FAILED_QUIPS = [
    'The suspect walked free today.',
    'The case goes cold.',
    'They got away this time.',
    'Better luck on tomorrow\'s case.',
    'The liar lives another day.',
];

function getQuip(pool: string[], puzzleNumber: number, score: number): string {
    return pool[(Math.abs(puzzleNumber) * 7 + score * 13) % pool.length];
}

export function generateAlibiShare(puzzleNumber: number, solved: boolean, guessesUsed: number, timeSeconds: number, score: number, difficulty: string): string {
    const bar = '█'.repeat(solved ? guessesUsed : 0) + '░'.repeat(2 - (solved ? guessesUsed : 0));
    const status = solved ? 'CASE CLOSED' : 'COLD CASE';
    const quip = getQuip(solved ? ALIBI_SOLVED_QUIPS : ALIBI_FAILED_QUIPS, puzzleNumber, score);
    const scoreLine = solved
        ? `⏱️ ${formatTime(timeSeconds)} | 🏆 ${score} pts`
        : `⏱️ ${formatTime(timeSeconds)} | 💀 0 pts`;

    return [
        `🔍 RMH Alibi #${puzzleNumber} — ${status}`,
        '',
        `🕵️ ${bar} ${solved ? `Guess ${guessesUsed}/2` : '0/2'}`,
        scoreLine,
        solved ? `🧠 ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}` : '',
        '',
        `"${quip}"`,
        '',
        'https://rmhstudios.com/daily/alibi',
    ].filter(Boolean).join('\n');
}

export function generateSpectrumShare(puzzleNumber: number, accuracy: number, itemScores: number[], score: number, label: string): string {
    const blocks = itemScores.map(s => s === 2 ? '🟩' : s === 1 ? '🟧' : '🟥').join('');
    const filledBar = '▰'.repeat(accuracy) + '▱'.repeat(10 - accuracy);

    return [
        `🌈 RMH Spectrum #${puzzleNumber} — ${accuracy}/10`,
        '',
        blocks,
        filledBar,
        '',
        `Category: ${label.split(':')[0]}`,
        `🏆 ${score} pts`,
        '',
        'https://rmhstudios.com/daily/spectrum',
    ].join('\n');
}

export function generateOutcastShare(puzzleNumber: number, correctRounds: boolean[], score: number, maxScore: number): string {
    const roundLine = correctRounds.map((c, i) => `R${i + 1} ${c ? '✅' : '❌'}`).join(' ');
    const allCorrect = correctRounds.every(Boolean);
    const quip = allCorrect ? 'Perfect instincts!' : `Fell for Round ${correctRounds.indexOf(false) + 1}'s trap 😤`;

    return [
        `🎭 RMH Outcast #${puzzleNumber}`,
        '',
        roundLine,
        `🏆 ${score}/${maxScore} pts`,
        '',
        quip,
        '',
        'https://rmhstudios.com/daily/outcast',
    ].join('\n');
}

export function generateChainlinkShare(puzzleNumber: number, startWord: string, endWord: string, chainLength: number, score: number, par: number): string {
    const links = '🔗'.repeat(chainLength);
    const parComparison = chainLength <= par ? 'Under par!' : chainLength === par + 1 ? 'One over par' : `${chainLength - par} over par`;

    return [
        `🔗 RMH Chainlink #${puzzleNumber}`,
        '',
        `${startWord} → ... → ${endWord}`,
        `${links} (${chainLength} links)`,
        `🏆 ${score} pts | Par: ${par}`,
        '',
        `"${chainLength <= par ? 'Made a connection most wouldn\'t see.' : 'The chain holds, link by link.'}"`,
        '',
        'https://rmhstudios.com/daily/chainlink',
    ].join('\n');
}

export function generateImpostorShare(puzzleNumber: number, topic: string, topicEmoji: string, statementResults: ('real' | 'fake-found' | 'fake-missed' | 'wrong-guess')[], score: number, guessCount: number): string {
    const blocks = statementResults.map(r => {
        if (r === 'real') return '🟩';
        if (r === 'fake-found') return '🟥';
        if (r === 'fake-missed') return '⬛';
        return '🟧'; // wrong-guess
    }).join('');

    const bothFound = statementResults.filter(r => r === 'fake-found').length === 2;
    const quip = bothFound
        ? (guessCount === 1 ? 'Found both fakes on guess 1!' : 'Found both fakes across 2 guesses!')
        : 'Some lies slipped through...';

    return [
        `🤥 RMH Impostor #${puzzleNumber}`,
        '',
        `Topic: ${topic} ${topicEmoji}`,
        blocks,
        quip,
        `🏆 ${score} pts`,
        '',
        '"Trust nothing. Question everything."',
        '',
        'https://rmhstudios.com/daily/impostor',
    ].join('\n');
}
