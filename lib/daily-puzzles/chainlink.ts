/**
 * Chainlink — Daily Puzzle
 * Connect a start word to an end word through a chain of association jumps.
 */

import { createSeededRng, getDateSeed } from './seed';

export interface ChainlinkPuzzle {
    startWord: string;
    endWord: string;
    parLinks: number;
    difficulty: 'short' | 'medium' | 'long';
    _exampleChain: string[];
    _connectionExplanations: string[];
}

interface ChainlinkTemplate {
    startWord: string;
    endWord: string;
    parLinks: number;
    exampleChain: string[];
    connectionExplanations: string[];
    difficulty: 'short' | 'medium' | 'long';
}

const CHAINLINK_POOL: ChainlinkTemplate[] = [
    {
        startWord: 'SUN',
        endWord: 'MUSIC',
        parLinks: 4,
        exampleChain: ['SUN', 'light', 'show', 'band', 'MUSIC'],
        connectionExplanations: ['sunlight', 'light show', 'show band', 'band music'],
        difficulty: 'short',
    },
    {
        startWord: 'FIRE',
        endWord: 'DREAM',
        parLinks: 4,
        exampleChain: ['FIRE', 'camp', 'sleep', 'night', 'DREAM'],
        connectionExplanations: ['campfire', 'sleep at camp', 'sleep at night', 'night dream'],
        difficulty: 'short',
    },
    {
        startWord: 'CAKE',
        endWord: 'STAR',
        parLinks: 4,
        exampleChain: ['CAKE', 'birthday', 'party', 'rock', 'STAR'],
        connectionExplanations: ['birthday cake', 'birthday party', 'rock party / party rock', 'rock star'],
        difficulty: 'short',
    },
    {
        startWord: 'MOON',
        endWord: 'COFFEE',
        parLinks: 4,
        exampleChain: ['MOON', 'night', 'morning', 'bean', 'COFFEE'],
        connectionExplanations: ['moonlit night', 'morning after night', 'morning bean / coffee bean', 'coffee bean'],
        difficulty: 'short',
    },
    {
        startWord: 'PIANO',
        endWord: 'GARDEN',
        parLinks: 4,
        exampleChain: ['PIANO', 'keys', 'lock', 'gate', 'GARDEN'],
        connectionExplanations: ['piano keys', 'keys lock', 'lock on a gate', 'garden gate'],
        difficulty: 'short',
    },
    {
        startWord: 'CASTLE',
        endWord: 'PHONE',
        parLinks: 4,
        exampleChain: ['CASTLE', 'tower', 'cell', 'call', 'PHONE'],
        connectionExplanations: ['castle tower', 'cell tower', 'cell call / phone call', 'phone call'],
        difficulty: 'short',
    },
    {
        startWord: 'ROCKET',
        endWord: 'CAKE',
        parLinks: 4,
        exampleChain: ['ROCKET', 'launch', 'party', 'birthday', 'CAKE'],
        connectionExplanations: ['rocket launch', 'launch party', 'birthday party', 'birthday cake'],
        difficulty: 'short',
    },
    {
        startWord: 'OCEAN',
        endWord: 'CLOCK',
        parLinks: 5,
        exampleChain: ['OCEAN', 'wave', 'hand', 'clock', 'time', 'CLOCK'],
        connectionExplanations: ['ocean wave', 'hand wave', 'clock hand', 'clock tells time', 'clock time'],
        difficulty: 'medium',
    },
    {
        startWord: 'SNOW',
        endWord: 'GUITAR',
        parLinks: 5,
        exampleChain: ['SNOW', 'ball', 'room', 'music', 'string', 'GUITAR'],
        connectionExplanations: ['snowball', 'ballroom', 'music room', 'music strings', 'guitar string'],
        difficulty: 'medium',
    },
    {
        startWord: 'CROWN',
        endWord: 'BEACH',
        parLinks: 5,
        exampleChain: ['CROWN', 'king', 'tide', 'wave', 'sand', 'BEACH'],
        connectionExplanations: ['king wears a crown', 'King Tide (extra high tide)', 'tidal wave', 'sand waves / wave on sand', 'sandy beach'],
        difficulty: 'medium',
    },
    {
        startWord: 'DIAMOND',
        endWord: 'BREAKFAST',
        parLinks: 5,
        exampleChain: ['DIAMOND', 'ring', 'bell', 'alarm', 'morning', 'BREAKFAST'],
        connectionExplanations: ['diamond ring', 'ring a bell', 'alarm bell', 'morning alarm', 'morning breakfast'],
        difficulty: 'medium',
    },
    {
        startWord: 'SHADOW',
        endWord: 'PIZZA',
        parLinks: 5,
        exampleChain: ['SHADOW', 'dark', 'knight', 'round', 'table', 'PIZZA'],
        connectionExplanations: ['dark shadow', 'The Dark Knight', 'knights of the round table', 'round table', 'pizza on the table / pizza table'],
        difficulty: 'medium',
    },
    {
        startWord: 'BRIDGE',
        endWord: 'PENCIL',
        parLinks: 5,
        exampleChain: ['BRIDGE', 'draw', 'card', 'sharp', 'point', 'PENCIL'],
        connectionExplanations: ['drawbridge', 'draw a card', 'card sharp (skilled player)', 'sharp point', 'pencil point'],
        difficulty: 'medium',
    },
    {
        startWord: 'ANCHOR',
        endWord: 'DREAM',
        parLinks: 5,
        exampleChain: ['ANCHOR', 'ship', 'bed', 'sleep', 'night', 'DREAM'],
        connectionExplanations: ['anchor a ship', 'ship bed / bed on a ship', 'sleep in bed', 'sleep at night', 'night dream'],
        difficulty: 'medium',
    },
    {
        startWord: 'MIRROR',
        endWord: 'HONEY',
        parLinks: 4,
        exampleChain: ['MIRROR', 'glass', 'bee', 'hive', 'HONEY'],
        connectionExplanations: ['mirror glass', 'glass bee / bees and glass', 'beehive', 'hive honey'],
        difficulty: 'short',
    },
];

/** Known valid associations for client-side validation */
const ASSOCIATION_MAP: Record<string, string[]> = {
    'sun': ['light', 'shine', 'burn', 'rise', 'set', 'flower', 'screen', 'glasses', 'roof', 'day', 'tan', 'block', 'beam', 'ray', 'bright', 'star', 'solar', 'heat', 'warm', 'gold'],
    'light': ['show', 'sun', 'bright', 'bulb', 'house', 'weight', 'year', 'speed', 'flash', 'dark', 'switch', 'moon', 'beam', 'ray', 'lamp', 'torch', 'candle', 'night', 'day', 'fire'],
    'show': ['band', 'time', 'room', 'boat', 'case', 'down', 'off', 'man', 'stopper', 'light', 'talk', 'game', 'road', 'side', 'piece', 'business', 'horse'],
    'band': ['music', 'rubber', 'rock', 'wedding', 'aid', 'width', 'camp', 'wagon', 'marching', 'brass', 'head', 'arm', 'wrist', 'ring', 'gap'],
    'camp': ['fire', 'sleep', 'ground', 'site', 'summer', 'tent', 'out', 'base', 'boot', 'happy', 'band', 'counselor', 'nature', 'hike', 'cabin'],
    'star': ['light', 'fish', 'war', 'rock', 'gold', 'dust', 'trek', 'gaze', 'night', 'sky', 'bright', 'shoot', 'movie', 'pop', 'death', 'all', 'five', 'north'],
    'rock': ['star', 'band', 'music', 'hard', 'climb', 'roll', 'solid', 'bottom', 'paper', 'scissors', 'bed', 'slide', 'mountain', 'stone', 'boulder', 'party', 'punk', 'classic'],
    'snow': ['ball', 'flake', 'man', 'white', 'cold', 'winter', 'fall', 'drift', 'plow', 'storm', 'board', 'shoe', 'cap', 'bird', 'drop', 'globe', 'blind'],
    'glass': ['mirror', 'window', 'eye', 'sun', 'wine', 'stain', 'blow', 'ceiling', 'cup', 'water', 'sand', 'fiber', 'hour', 'look', 'magnify', 'bee', 'clear', 'break'],
    'ocean': ['wave', 'water', 'sea', 'deep', 'blue', 'fish', 'tide', 'salt', 'current', 'floor', 'surf', 'beach', 'shore', 'pacific', 'atlantic', 'marine', 'dive', 'swim', 'ship', 'boat'],
    'wave': ['hand', 'water', 'ocean', 'surf', 'sound', 'radio', 'heat', 'light', 'particle', 'crash'],
    'hand': ['shake', 'finger', 'palm', 'glove', 'grip', 'wave', 'hold', 'clap', 'fist', 'wrist', 'write', 'grab'],
    'shake': ['milk', 'hand', 'rattle', 'tremble', 'quake', 'earth', 'protein', 'drink', 'baby'],
    'milk': ['wallet', 'cow', 'cream', 'white', 'dairy', 'shake', 'bottle', 'chocolate', 'cereal', 'glass'],
    'piano': ['keys', 'music', 'black', 'white', 'play', 'grand', 'notes', 'ivory', 'tune', 'song', 'concert'],
    'keys': ['lock', 'piano', 'door', 'car', 'keyboard', 'florida', 'open', 'ring', 'master'],
    'lock': ['gate', 'key', 'door', 'safe', 'hair', 'pick', 'chain', 'dead', 'pad', 'bolt', 'screen', 'secure'],
    'gate': ['garden', 'door', 'fence', 'entry', 'open', 'iron', 'bill', 'water', 'golden', 'heaven', 'hell'],
    'diamond': ['ring', 'gem', 'baseball', 'hard', 'sparkle', 'card', 'suit', 'mine', 'crystal', 'cut', 'rough', 'shine'],
    'ring': ['bell', 'finger', 'wedding', 'boxing', 'phone', 'circle', 'lord', 'diamond', 'gold', 'silver'],
    'bell': ['morning', 'ring', 'tower', 'cow', 'door', 'taco', 'liberty', 'alarm', 'church', 'jingle', 'sound'],
    'morning': ['alarm', 'dawn', 'coffee', 'sunrise', 'breakfast', 'early', 'dew', 'glory', 'star', 'news', 'show'],
    'alarm': ['breakfast', 'clock', 'fire', 'morning', 'wake', 'bell', 'siren', 'system', 'panic', 'security'],
    'castle': ['tower', 'king', 'queen', 'medieval', 'stone', 'fortress', 'dragon', 'moat', 'knight', 'sand'],
    'tower': ['cell', 'bridge', 'tall', 'water', 'clock', 'power', 'eiffel', 'castle', 'babel', 'london', 'ivory', 'trump'],
    'cell': ['call', 'phone', 'prison', 'battery', 'biology', 'blood', 'tower', 'fuel', 'solar'],
    'call': ['phone', 'name', 'duty', 'bird', 'roll', 'wild', 'close', 'curtain', 'ring'],
    'moon': ['night', 'sun', 'star', 'full', 'half', 'light', 'lunar', 'space', 'eclipse', 'dark', 'tide', 'walk', 'shine', 'howl'],
    'night': ['owl', 'dark', 'moon', 'star', 'sleep', 'dream', 'sky', 'shift', 'late', 'club', 'cap', 'mare', 'watch'],
    'owl': ['wise', 'night', 'bird', 'hoot', 'barn', 'snowy', 'eyes', 'feather', 'prey'],
    'wise': ['bean', 'old', 'owl', 'sage', 'man', 'crack', 'word', 'wisdom', 'guy'],
    'bean': ['coffee', 'green', 'jelly', 'string', 'counter', 'baked', 'lima', 'jump', 'magic', 'vanilla'],
    'fire': ['alarm', 'hot', 'flame', 'burn', 'smoke', 'truck', 'camp', 'light', 'fighter', 'work', 'pit', 'wood', 'place', 'hydrant', 'starter', 'dragon'],
    'clock': ['tower', 'time', 'alarm', 'tick', 'watch', 'hand', 'wall', 'cuckoo', 'digital', 'face', 'work', 'wise'],
    'book': ['library', 'read', 'page', 'story', 'novel', 'cover', 'worm', 'shelf', 'mark', 'club', 'cook', 'text', 'note'],
    'snowflake': ['crystal', 'ice', 'snow', 'cold', 'winter', 'unique', 'flake', 'white', 'frost'],
    'crystal': ['ball', 'clear', 'glass', 'gem', 'rock', 'meth', 'palace', 'lake', 'cave'],
    'ball': ['room', 'game', 'basket', 'foot', 'base', 'bounce', 'round', 'crystal', 'tennis', 'golf', 'bowl', 'catch', 'dance', 'gown'],
    'room': ['music', 'bed', 'living', 'bath', 'class', 'clean', 'dark', 'mate', 'service', 'ball', 'chat', 'escape', 'show'],
    'music': ['string', 'note', 'song', 'band', 'play', 'sheet', 'box', 'room', 'live', 'pop', 'rock', 'jazz', 'classical', 'folk', 'country'],
    'string': ['guitar', 'cheese', 'theory', 'bean', 'along', 'attach', 'instrument', 'puppet', 'bow', 'tie', 'quartet'],
    'crown': ['king', 'queen', 'royal', 'gold', 'jewel', 'head', 'prince', 'tooth', 'victoria', 'top'],
    'king': ['tide', 'queen', 'crown', 'kong', 'throne', 'lion', 'chess', 'martin', 'luther', 'cobra', 'size', 'pin', 'burger'],
    'tide': ['wave', 'ocean', 'moon', 'pod', 'high', 'low', 'pool', 'turn', 'laundry', 'change'],
    'sand': ['beach', 'castle', 'dune', 'storm', 'box', 'paper', 'quick', 'dollar', 'grain', 'pit', 'bag', 'time', 'glass', 'bar'],
    'rocket': ['launch', 'ship', 'space', 'fast', 'fuel', 'science', 'man', 'red', 'boost', 'fly', 'sky', 'firework'],
    'launch': ['party', 'rocket', 'pad', 'start', 'ship', 'product', 'date', 'site', 'sequence', 'attack'],
    'party': ['birthday', 'dance', 'political', 'host', 'celebrate', 'music', 'fun', 'favor', 'guest', 'block', 'house', 'pool'],
    'birthday': ['cake', 'party', 'card', 'gift', 'present', 'candle', 'wish', 'happy', 'surprise', 'song'],
    'shadow': ['dark', 'light', 'puppet', 'box', 'cast', 'shade', 'follow', 'ban', 'figure', 'realm'],
    'dark': ['knight', 'night', 'light', 'shadow', 'room', 'side', 'age', 'horse', 'web', 'matter', 'chocolate', 'cloud'],
    'knight': ['round', 'dark', 'chess', 'armor', 'sword', 'noble', 'castle', 'medieval', 'quest', 'night', 'table', 'shining'],
    'round': ['table', 'circle', 'ball', 'turn', 'trip', 'about', 'ring', 'fight', 'boxing', 'robin'],
    'table': ['pizza', 'round', 'top', 'cloth', 'tennis', 'dinner', 'pool', 'turn', 'set', 'card', 'coffee', 'leg', 'flat', 'chair'],
    'bridge': ['draw', 'card', 'game', 'over', 'gap', 'water', 'london', 'golden', 'suspension', 'dental', 'nose'],
    'draw': ['card', 'sketch', 'paint', 'bridge', 'back', 'quick', 'line', 'blood', 'sword', 'attention', 'luck'],
    'card': ['sharp', 'game', 'credit', 'gift', 'play', 'business', 'board', 'birthday', 'wild', 'trick', 'deck', 'poker'],
    'sharp': ['point', 'knife', 'edge', 'note', 'mind', 'dress', 'shooter', 'tongue', 'turn', 'flat'],
    'point': ['pencil', 'sharp', 'tip', 'score', 'gun', 'power', 'west', 'blank', 'break', 'focal', 'view', 'ball'],
    'tornado': ['funnel', 'storm', 'wind', 'alley', 'spin', 'destroy', 'warning', 'wizard', 'oz', 'debris', 'twister'],
    'funnel': ['cake', 'web', 'cloud', 'tornado', 'shape', 'pour', 'spider', 'narrow'],
    'cake': ['canvas', 'birthday', 'chocolate', 'layer', 'ice', 'cup', 'cheese', 'pan', 'bake', 'slice', 'wedding', 'piece', 'walk', 'red', 'pound', 'frosting'],
    'canvas': ['oil', 'paint', 'art', 'tent', 'shoe', 'bag', 'fabric', 'stretch', 'blank', 'sail'],
    'oil': ['brush', 'paint', 'olive', 'palm', 'cooking', 'crude', 'fuel', 'petroleum', 'baby', 'engine', 'spill', 'change', 'well', 'canvas', 'snake', 'essential'],
    'brush': ['painting', 'hair', 'tooth', 'paint', 'fire', 'stroke', 'off', 'clean', 'up', 'scrub'],
    'anchor': ['ship', 'news', 'weight', 'heavy', 'hold', 'chain', 'harbor', 'dock', 'sea', 'point', 'text', 'baby'],
    'ship': ['captain', 'boat', 'sail', 'sea', 'anchor', 'cargo', 'pirate', 'wreck', 'cruise', 'flag', 'war', 'battle', 'rocket', 'space', 'relation'],
    'captain': ['bed', 'america', 'ship', 'hook', 'jack', 'team', 'leader', 'pilot', 'obvious', 'crunch', 'morgan'],
    'bed': ['sleep', 'room', 'sheet', 'pillow', 'frame', 'time', 'bug', 'river', 'flower', 'rock', 'water', 'bunk', 'captain'],
    'sleep': ['dream', 'bed', 'night', 'rest', 'wake', 'nap', 'deep', 'walk', 'over', 'tight', 'beauty'],
    'volcano': ['lava', 'erupt', 'mountain', 'ash', 'fire', 'magma', 'island', 'hawaii', 'ring', 'dormant', 'active', 'hot'],
    'lava': ['flow', 'hot', 'volcano', 'rock', 'lamp', 'magma', 'cake', 'molten', 'red', 'cool'],
    'flow': ['river', 'water', 'cash', 'stream', 'chart', 'go', 'lava', 'current', 'air', 'blood', 'free', 'work', 'over'],
    'river': ['mail', 'water', 'bank', 'flow', 'stream', 'bridge', 'delta', 'deep', 'bed', 'fish', 'nile', 'amazon', 'mississippi', 'snake', 'run'],
    'mail': ['post', 'letter', 'box', 'man', 'email', 'stamp', 'delivery', 'chain', 'junk', 'air', 'fan', 'snail', 'slot', 'order', 'voice'],
    'post': ['stamp', 'mail', 'office', 'card', 'man', 'box', 'sign', 'blog', 'goal', 'lamp', 'it', 'mortem', 'modern', 'war'],
    'mirror': ['reflection', 'glass', 'image', 'look', 'face', 'fun', 'house', 'rear', 'view', 'magic', 'side', 'wall', 'lake', 'selfie', 'vanity'],
    'reflection': ['bee', 'mirror', 'water', 'light', 'image', 'self', 'think', 'pool', 'glass', 'thought', 'deep'],
    'bee': ['hive', 'honey', 'sting', 'buzz', 'queen', 'worker', 'bumble', 'flower', 'pollen', 'wax', 'keeper', 'spelling', 'busy'],
    'hive': ['honey', 'bee', 'mind', 'queen', 'five', 'worker', 'swarm', 'comb', 'colony', 'nest'],
    'wallet': ['money', 'cash', 'card', 'pocket', 'leather', 'fold', 'lost', 'digital', 'chain', 'fat', 'thin', 'crypto', 'billfold'],
    'garden': ['flower', 'plant', 'grow', 'gate', 'secret', 'rose', 'vegetable', 'water', 'herb', 'zen', 'beer', 'madison', 'olive', 'party'],
    'breakfast': ['morning', 'egg', 'cereal', 'pancake', 'toast', 'coffee', 'meal', 'lunch', 'bed', 'tiffany', 'champion', 'club'],
    'phone': ['call', 'cell', 'ring', 'smart', 'mobile', 'screen', 'case', 'number', 'home', 'app', 'head', 'ear', 'head', 'micro'],
    'coffee': ['bean', 'cup', 'shop', 'morning', 'brew', 'espresso', 'latte', 'black', 'table', 'grind', 'mug', 'cream', 'break', 'pot', 'house', 'cake', 'stain'],
    'library': ['book', 'read', 'quiet', 'card', 'shelf', 'study', 'public', 'reference', 'digital', 'borrow', 'silence', 'return'],
    'guitar': ['string', 'music', 'play', 'bass', 'electric', 'acoustic', 'chord', 'rock', 'pick', 'solo', 'hero', 'air', 'strum'],
    'beach': ['sand', 'wave', 'ocean', 'sun', 'surf', 'shore', 'towel', 'ball', 'vacation', 'palm', 'volleyball', 'party', 'board', 'body'],
    'pizza': ['slice', 'cheese', 'delivery', 'box', 'dough', 'sauce', 'table', 'oven', 'party', 'topping', 'pepperoni', 'crust', 'pie', 'round', 'hut'],
    'pencil': ['point', 'sharp', 'draw', 'write', 'eraser', 'lead', 'number', 'case', 'box', 'mechanical', 'color', 'sketch', 'graphite', 'wood', 'sharpener'],
    'painting': ['brush', 'art', 'canvas', 'oil', 'water', 'color', 'frame', 'hang', 'portrait', 'landscape', 'abstract', 'museum', 'gallery', 'masterpiece'],
    'dream': ['sleep', 'night', 'wish', 'day', 'lucid', 'nightmare', 'team', 'pipe', 'big', 'land', 'catcher', 'american', 'vision', 'fantasy'],
    'stamp': ['post', 'mail', 'collect', 'rubber', 'approval', 'ink', 'date', 'food', 'out', 'time', 'passport'],
    'honey': ['bee', 'sweet', 'bear', 'comb', 'gold', 'moon', 'pot', 'trap', 'dew', 'badger', 'bun', 'jar', 'mustard'],
};

export function generateChainlinkPuzzle(date: Date): ChainlinkPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 43 + 19);

    const idx = Math.floor(rng() * CHAINLINK_POOL.length);
    const template = CHAINLINK_POOL[idx];

    return {
        startWord: template.startWord,
        endWord: template.endWord,
        parLinks: template.parLinks,
        difficulty: template.difficulty,
        _exampleChain: template.exampleChain,
        _connectionExplanations: template.connectionExplanations,
    };
}

/** Simple client-side association check using the map */
export function isValidAssociation(wordA: string, wordB: string): boolean {
    const a = wordA.toLowerCase().trim();
    const b = wordB.toLowerCase().trim();

    // Check if b is in a's associations
    if (ASSOCIATION_MAP[a]?.includes(b)) return true;
    // Check reverse
    if (ASSOCIATION_MAP[b]?.includes(a)) return true;

    return false;
}

export function validateChain(chain: string[]): { valid: boolean; invalidLink?: number } {
    for (let i = 0; i < chain.length - 1; i++) {
        if (!isValidAssociation(chain[i], chain[i + 1])) {
            return { valid: false, invalidLink: i };
        }
    }
    return { valid: true };
}

export function computeChainlinkScore(chainLength: number): number {
    if (chainLength <= 3) return 150;
    if (chainLength === 4) return 120;
    if (chainLength === 5) return 90;
    if (chainLength === 6) return 60;
    if (chainLength === 7) return 30;
    if (chainLength === 8) return 10;
    return 0;
}
