import type { Word, Character, PoemScore, Grade, PoemLine } from './types';
import { CHARACTERS } from './characters';

const TAG_KEYS = ['darkness', 'brightness', 'complexity', 'nature', 'urban', 'abstract', 'concrete', 'emotionIntensity', 'humor', 'sincerity'] as const;

type TagKey = typeof TAG_KEYS[number];

// Mapping from Word tag keys to Character preference keys for scoring
const TAG_TO_PREFERENCE: Record<TagKey, keyof Character['preferences']> = {
  darkness: 'darkness',
  brightness: 'brightness',
  complexity: 'complexity',
  nature: 'nature',
  urban: 'urban',
  abstract: 'abstract',
  concrete: 'concrete',
  emotionIntensity: 'emotionIntensity',
  humor: 'humor',
  sincerity: 'sincerity',
};

function getGrade(score: number): Grade {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function getReaction(grade: Grade): string {
  switch (grade) {
    case 'S': return 'absolutely loves';
    case 'A': return 'really enjoys';
    case 'B': return 'appreciates';
    case 'C': return 'thinks it\'s okay';
    case 'D': return 'isn\'t impressed by';
    case 'F': return 'dislikes';
  }
}

function hasAlliteration(words: Word[]): boolean {
  if (words.length < 3) return false;
  const firstLetters = words.map(w => w.text[0].toLowerCase());
  const counts: Record<string, number> = {};
  for (const l of firstLetters) {
    counts[l] = (counts[l] || 0) + 1;
    if (counts[l] >= 3) return true;
  }
  return false;
}

function hasRhymingPair(words: Word[]): boolean {
  const groups = new Set<string>();
  for (const w of words) {
    if (groups.has(w.rhymeGroup)) return true;
    groups.add(w.rhymeGroup);
  }
  return false;
}

export function scoreWordSelectPoem(selectedWords: Word[], presentations: Record<string, string>): PoemScore {
  // Compute poem's average tag values
  const poemProfile: Record<string, number> = {};
  for (const tag of TAG_KEYS) {
    poemProfile[tag] = selectedWords.reduce((sum, w) => sum + w.tags[tag], 0) / selectedWords.length;
  }

  // Score against each character
  const characterScores: PoemScore['characterScores'] = {};
  const bonuses: string[] = [];

  // Check global bonuses
  if (hasAlliteration(selectedWords)) bonuses.push('Alliteration');
  if (hasRhymingPair(selectedWords)) bonuses.push('Rhyming Pair');

  const rareCount = selectedWords.filter(w => w.isRare).length;
  if (rareCount >= 2) bonuses.push('Literary Vocabulary');

  for (const [charId, char] of Object.entries(CHARACTERS)) {
    // Weighted similarity
    let affinityScore = 0;
    for (const tag of TAG_KEYS) {
      const charPref = char.preferences[TAG_TO_PREFERENCE[tag]];
      const poemVal = poemProfile[tag];
      affinityScore += charPref * poemVal;
    }
    affinityScore /= TAG_KEYS.length;

    // Category bonuses
    let categoryBonus = 0;
    for (const word of selectedWords) {
      for (const cat of word.categories) {
        if (char.lovedWordCategories.includes(cat)) categoryBonus += 0.02;
        if (char.hatedWordCategories.includes(cat)) categoryBonus -= 0.03;
      }
    }

    // Special word bonuses
    const rareBonus = rareCount * 0.01;

    // Bonus conditions
    let bonusPoints = 0;
    if (hasAlliteration(selectedWords)) bonusPoints += 0.05;
    if (hasRhymingPair(selectedWords)) bonusPoints += 0.05;

    const raw = affinityScore + categoryBonus + rareBonus + bonusPoints;
    const score = Math.round(Math.max(0, Math.min(100, raw * 100)));
    const grade = getGrade(score);
    const affinityChange = Math.round(raw * 15) - 3;

    characterScores[charId] = {
      score,
      grade,
      affinityChange: Math.max(-5, Math.min(15, affinityChange)),
      reaction: getReaction(grade),
    };
  }

  // Overall score is average of all character scores
  const allScores = Object.values(characterScores).map(s => s.score);
  const overallScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);

  return {
    score: overallScore,
    grade: getGrade(overallScore),
    characterScores,
    bonuses,
  };
}

export function scoreLineArrangePoem(arrangedLines: PoemLine[], puzzleData: { optimalOrders: string[][]; scoringMode: string }): PoemScore {
  const lineIds = arrangedLines.map(l => l.id);

  // Flow score: how well adjacent lines connect
  let flowScore = 0;
  let maxFlow = 0;
  for (let i = 1; i < arrangedLines.length; i++) {
    const prev = arrangedLines[i - 1];
    const curr = arrangedLines[i];
    maxFlow += 1;
    if (curr.flowsWellAfter.includes(prev.id)) flowScore += 1;
    if (prev.clashesWith.includes(curr.id)) flowScore -= 0.5;
  }
  const normalizedFlow = maxFlow > 0 ? flowScore / maxFlow : 0;

  // Opening/closing bonus
  let structureBonus = 0;
  if (arrangedLines[0]?.strongOpener) structureBonus += 0.1;
  if (arrangedLines[arrangedLines.length - 1]?.strongCloser) structureBonus += 0.1;

  // Emotional arc
  let arcScore = 0;
  const intensities = arrangedLines.map(l => l.emotionalIntensity);
  const peakIndex = intensities.indexOf(Math.max(...intensities));
  // Reward if peak is in the second half (builds to climax)
  if (peakIndex >= intensities.length * 0.5) arcScore += 0.15;

  // Check optimal order match
  let optimalBonus = 0;
  for (const optimal of puzzleData.optimalOrders) {
    if (JSON.stringify(lineIds) === JSON.stringify(optimal)) {
      optimalBonus = 0.2;
      break;
    }
  }

  const raw = Math.max(0, Math.min(1, normalizedFlow * 0.5 + structureBonus + arcScore + optimalBonus));
  const score = Math.round(raw * 100);

  // Score for each character (line arrange is more universal)
  const characterScores: PoemScore['characterScores'] = {};
  for (const [charId] of Object.entries(CHARACTERS)) {
    const charScore = Math.round(score * (0.8 + Math.random() * 0.4)); // slight variation per character
    const grade = getGrade(Math.min(100, charScore));
    characterScores[charId] = {
      score: Math.min(100, charScore),
      grade,
      affinityChange: Math.max(-3, Math.min(12, Math.round((charScore / 100) * 12) - 2)),
      reaction: getReaction(grade),
    };
  }

  const bonuses: string[] = [];
  if (arrangedLines[0]?.strongOpener) bonuses.push('Strong Opening');
  if (arrangedLines[arrangedLines.length - 1]?.strongCloser) bonuses.push('Strong Closing');
  if (optimalBonus > 0) bonuses.push('Perfect Arrangement');

  return {
    score,
    grade: getGrade(score),
    characterScores,
    bonuses,
  };
}
