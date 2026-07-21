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
    tags: string[];
}

// ───────────────────────────────────────────────────────────────────────────
//  CHAIN TEMPLATES — 30 total (10 short / 12 medium / 8 long)
// ───────────────────────────────────────────────────────────────────────────

const CHAINLINK_POOL: ChainlinkTemplate[] = [
    // ── SHORT (parLinks: 4, 5-word chains) ── 10 templates ──

    {
        startWord: 'SUN',
        endWord: 'MUSIC',
        parLinks: 4,
        exampleChain: ['SUN', 'light', 'show', 'band', 'MUSIC'],
        connectionExplanations: ['sunlight', 'light show', 'showband', 'band music'],
        difficulty: 'short',
        tags: ['nature', 'short'],
    },
    {
        startWord: 'FIRE',
        endWord: 'BED',
        parLinks: 4,
        exampleChain: ['FIRE', 'place', 'work', 'out', 'BED'],
        connectionExplanations: ['fireplace', 'workplace', 'workout', 'out of bed'],
        difficulty: 'short',
        tags: ['home', 'short'],
    },
    {
        startWord: 'CAKE',
        endWord: 'STAR',
        parLinks: 4,
        exampleChain: ['CAKE', 'birthday', 'party', 'rock', 'STAR'],
        connectionExplanations: ['birthday cake', 'birthday party', 'party rock', 'rock star'],
        difficulty: 'short',
        tags: ['food', 'short'],
    },
    {
        startWord: 'MOON',
        endWord: 'CUP',
        parLinks: 4,
        exampleChain: ['MOON', 'light', 'bulb', 'butter', 'CUP'],
        connectionExplanations: ['moonlight', 'light bulb', 'butterbulb (bulb shape) / bulb → butter', 'buttercup'],
        difficulty: 'short',
        tags: ['nature', 'short'],
    },
    {
        startWord: 'PIANO',
        endWord: 'GARDEN',
        parLinks: 4,
        exampleChain: ['PIANO', 'keys', 'lock', 'gate', 'GARDEN'],
        connectionExplanations: ['piano keys', 'lock and key', 'padlock on a gate', 'garden gate'],
        difficulty: 'short',
        tags: ['music', 'short'],
    },
    {
        startWord: 'SNOW',
        endWord: 'DANCE',
        parLinks: 4,
        exampleChain: ['SNOW', 'ball', 'room', 'ball', 'DANCE'],
        connectionExplanations: ['snowball', 'ballroom', 'ballroom', 'ballroom dance'],
        difficulty: 'short',
        tags: ['nature', 'short'],
    },
    {
        startWord: 'BLACK',
        endWord: 'FLY',
        parLinks: 4,
        exampleChain: ['BLACK', 'bird', 'house', 'fly', 'FLY'],
        connectionExplanations: ['blackbird', 'birdhouse', 'housefly', 'housefly'],
        difficulty: 'short',
        tags: ['animals', 'short'],
    },
    {
        startWord: 'TOOTH',
        endWord: 'STORM',
        parLinks: 4,
        exampleChain: ['TOOTH', 'brush', 'fire', 'ice', 'STORM'],
        connectionExplanations: ['toothbrush', 'brushfire', 'fire and ice', 'ice storm'],
        difficulty: 'short',
        tags: ['body', 'short'],
    },
    {
        startWord: 'WATER',
        endWord: 'LIGHT',
        parLinks: 4,
        exampleChain: ['WATER', 'fall', 'down', 'town', 'LIGHT'],
        connectionExplanations: ['waterfall', 'downfall / fall down', 'downtown', 'town light / spotlight'],
        difficulty: 'short',
        tags: ['nature', 'short'],
    },
    {
        startWord: 'BASKET',
        endWord: 'FISH',
        parLinks: 4,
        exampleChain: ['BASKET', 'ball', 'game', 'sword', 'FISH'],
        connectionExplanations: ['basketball', 'ball game', 'game → sword', 'swordfish'],
        difficulty: 'short',
        tags: ['sports', 'short'],
    },

    // ── MEDIUM (parLinks: 5, 6-word chains) ── 12 templates ──

    {
        startWord: 'OCEAN',
        endWord: 'WORK',
        parLinks: 5,
        exampleChain: ['OCEAN', 'wave', 'hand', 'clock', 'frame', 'WORK'],
        connectionExplanations: ['ocean wave', 'hand wave', 'clock hand', 'clock frame / time frame', 'framework'],
        difficulty: 'medium',
        tags: ['nature', 'medium'],
    },
    {
        startWord: 'SNOW',
        endWord: 'GUITAR',
        parLinks: 5,
        exampleChain: ['SNOW', 'ball', 'room', 'music', 'string', 'GUITAR'],
        connectionExplanations: ['snowball', 'ballroom', 'music room', 'music string', 'guitar string'],
        difficulty: 'medium',
        tags: ['nature', 'medium'],
    },
    {
        startWord: 'DIAMOND',
        endWord: 'BREAKFAST',
        parLinks: 5,
        exampleChain: ['DIAMOND', 'ring', 'bell', 'alarm', 'morning', 'BREAKFAST'],
        connectionExplanations: ['diamond ring', 'ring a bell', 'alarm bell', 'morning alarm', 'morning breakfast'],
        difficulty: 'medium',
        tags: ['luxury', 'medium'],
    },
    {
        startWord: 'CASTLE',
        endWord: 'PAPER',
        parLinks: 5,
        exampleChain: ['CASTLE', 'sand', 'box', 'card', 'board', 'PAPER'],
        connectionExplanations: ['sandcastle', 'sandbox', 'card box / box of cards', 'cardboard', 'paperboard'],
        difficulty: 'medium',
        tags: ['fantasy', 'medium'],
    },
    {
        startWord: 'RAIN',
        endWord: 'CAKE',
        parLinks: 5,
        exampleChain: ['RAIN', 'bow', 'tie', 'cup', 'pan', 'CAKE'],
        connectionExplanations: ['rainbow', 'bow tie', 'tie cup / cup tie', 'cupcake / cup → pan', 'pancake'],
        difficulty: 'medium',
        tags: ['weather', 'medium'],
    },
    {
        startWord: 'BOOK',
        endWord: 'FIRE',
        parLinks: 5,
        exampleChain: ['BOOK', 'worm', 'hole', 'camp', 'ground', 'FIRE'],
        connectionExplanations: ['bookworm', 'wormhole', 'camphole → camp', 'campground', 'ground fire / campfire'],
        difficulty: 'medium',
        tags: ['education', 'medium'],
    },
    {
        startWord: 'HORSE',
        endWord: 'CREAM',
        parLinks: 5,
        exampleChain: ['HORSE', 'back', 'hand', 'shake', 'ice', 'CREAM'],
        connectionExplanations: ['horseback', 'backhand', 'handshake', 'shake → ice', 'ice cream'],
        difficulty: 'medium',
        tags: ['animals', 'medium'],
    },
    {
        startWord: 'FOOT',
        endWord: 'HOUSE',
        parLinks: 5,
        exampleChain: ['FOOT', 'ball', 'park', 'bench', 'dog', 'HOUSE'],
        connectionExplanations: ['football', 'ballpark', 'park bench', 'bench → dog', 'doghouse'],
        difficulty: 'medium',
        tags: ['sports', 'medium'],
    },
    {
        startWord: 'HEAD',
        endWord: 'BERRY',
        parLinks: 5,
        exampleChain: ['HEAD', 'band', 'rock', 'black', 'straw', 'BERRY'],
        connectionExplanations: ['headband', 'rock band', 'black rock / rock → black', 'blackberry → straw', 'strawberry'],
        difficulty: 'medium',
        tags: ['body', 'medium'],
    },
    {
        startWord: 'DOOR',
        endWord: 'SHINE',
        parLinks: 5,
        exampleChain: ['DOOR', 'bell', 'tower', 'clock', 'moon', 'SHINE'],
        connectionExplanations: ['doorbell', 'bell tower', 'clock tower', 'clock → moon', 'moonshine'],
        difficulty: 'medium',
        tags: ['home', 'medium'],
    },
    {
        startWord: 'EGG',
        endWord: 'BOAT',
        parLinks: 5,
        exampleChain: ['EGG', 'shell', 'fish', 'sword', 'speed', 'BOAT'],
        connectionExplanations: ['eggshell', 'shellfish', 'swordfish', 'speedboat → speed', 'speedboat'],
        difficulty: 'medium',
        tags: ['food', 'medium'],
    },
    {
        startWord: 'GOLD',
        endWord: 'BOARD',
        parLinks: 5,
        exampleChain: ['GOLD', 'fish', 'hook', 'captain', 'card', 'BOARD'],
        connectionExplanations: ['goldfish', 'fish hook', 'Captain Hook', 'captain → card', 'cardboard'],
        difficulty: 'medium',
        tags: ['treasure', 'medium'],
    },

    // ── LONG (parLinks: 6, 7-word chains) ── 8 templates ──

    {
        startWord: 'ROCKET',
        endWord: 'DREAM',
        parLinks: 6,
        exampleChain: ['ROCKET', 'ship', 'wreck', 'ball', 'room', 'bed', 'DREAM'],
        connectionExplanations: ['rocket ship', 'shipwreck', 'wrecking ball', 'ballroom', 'bedroom', 'bed → dream'],
        difficulty: 'long',
        tags: ['space', 'long'],
    },
    {
        startWord: 'THUNDER',
        endWord: 'GARDEN',
        parLinks: 6,
        exampleChain: ['THUNDER', 'bolt', 'lightning', 'bug', 'lady', 'bird', 'GARDEN'],
        connectionExplanations: ['thunderbolt', 'lightning bolt', 'lightning bug', 'ladybug', 'ladybird', 'bird garden / garden bird'],
        difficulty: 'long',
        tags: ['weather', 'long'],
    },
    {
        startWord: 'BUTTER',
        endWord: 'STORM',
        parLinks: 6,
        exampleChain: ['BUTTER', 'fly', 'paper', 'news', 'break', 'ice', 'STORM'],
        connectionExplanations: ['butterfly', 'flypaper', 'newspaper', 'newsbreak', 'break the ice / icebreaker', 'ice storm'],
        difficulty: 'long',
        tags: ['nature', 'long'],
    },
    {
        startWord: 'STAR',
        endWord: 'CAKE',
        parLinks: 6,
        exampleChain: ['STAR', 'fish', 'bowl', 'pin', 'head', 'cup', 'CAKE'],
        connectionExplanations: ['starfish', 'fishbowl', 'bowling pin', 'pinhead', 'headcup → cup', 'cupcake'],
        difficulty: 'long',
        tags: ['space', 'long'],
    },
    {
        startWord: 'BLUE',
        endWord: 'LIGHT',
        parLinks: 6,
        exampleChain: ['BLUE', 'print', 'finger', 'tip', 'ice', 'moon', 'LIGHT'],
        connectionExplanations: ['blueprint', 'fingerprint', 'fingertip', 'tip of the iceberg / ice tip', 'ice moon', 'moonlight'],
        difficulty: 'long',
        tags: ['color', 'long'],
    },
    {
        startWord: 'PEPPER',
        endWord: 'HOUSE',
        parLinks: 6,
        exampleChain: ['PEPPER', 'mint', 'fresh', 'water', 'fall', 'tree', 'HOUSE'],
        connectionExplanations: ['peppermint', 'mint fresh', 'freshwater', 'waterfall', 'fall tree / tree in fall', 'treehouse'],
        difficulty: 'long',
        tags: ['food', 'long'],
    },
    {
        startWord: 'CHAIN',
        endWord: 'BERRY',
        parLinks: 6,
        exampleChain: ['CHAIN', 'link', 'fence', 'post', 'box', 'juice', 'BERRY'],
        connectionExplanations: ['chainlink', 'link fence / chain-link fence', 'fence post', 'post box', 'juice box', 'juice berry / berry juice'],
        difficulty: 'long',
        tags: ['meta', 'long'],
    },
    {
        startWord: 'NIGHT',
        endWord: 'BOARD',
        parLinks: 6,
        exampleChain: ['NIGHT', 'owl', 'barn', 'door', 'key', 'note', 'BOARD'],
        connectionExplanations: ['night owl', 'barn owl', 'barn door', 'door key', 'keynote', 'note board / bulletin board'],
        difficulty: 'long',
        tags: ['time', 'long'],
    },
];

// ───────────────────────────────────────────────────────────────────────────
//  ASSOCIATION MAP — comprehensive word-association graph for validation
// ───────────────────────────────────────────────────────────────────────────

const ASSOCIATION_MAP: Record<string, string[]> = {
    // ── A ──
    'air': ['plane', 'port', 'craft', 'line', 'bag', 'tight', 'condition', 'force', 'head', 'wave', 'guitar', 'lock', 'mail', 'field', 'way', 'borne', 'ship', 'flow', 'gun', 'brush'],
    'arm': ['chair', 'band', 'pit', 'rest', 'strong', 'hand', 'lock', 'guard', 'hole', 'wrestle', 'bar', 'force'],
    'apple': ['pie', 'sauce', 'tree', 'seed', 'jack', 'cart', 'cider', 'core', 'green', 'red', 'blossom', 'butter', 'crisp'],

    // ── B ──
    'back': ['bone', 'fire', 'hand', 'pack', 'yard', 'board', 'ground', 'stage', 'track', 'door', 'drop', 'flip', 'lash', 'log', 'seat', 'stab', 'stroke', 'ward', 'wash', 'space'],
    'ball': ['room', 'game', 'park', 'basket', 'foot', 'base', 'bounce', 'round', 'crystal', 'tennis', 'golf', 'bowl', 'catch', 'dance', 'gown', 'fire', 'snow', 'pin', 'eye', 'chain'],
    'band': ['music', 'rubber', 'rock', 'wedding', 'aid', 'width', 'camp', 'wagon', 'marching', 'brass', 'head', 'arm', 'wrist', 'ring', 'gap', 'stand'],
    'barn': ['owl', 'door', 'yard', 'storm', 'dance', 'red', 'horse', 'hay', 'roof', 'cat', 'wood', 'swallow'],
    'basket': ['ball', 'case', 'weave', 'bread', 'flower', 'picnic', 'waste', 'egg', 'fruit', 'laundry', 'gift'],
    'bath': ['room', 'tub', 'water', 'robe', 'towel', 'house', 'salt', 'bomb', 'time', 'mat', 'mud', 'bubble'],
    'bean': ['coffee', 'green', 'jelly', 'string', 'counter', 'baked', 'lima', 'jump', 'magic', 'vanilla', 'bag', 'stalk', 'pole', 'sprout'],
    'bed': ['room', 'time', 'bug', 'rock', 'spread', 'side', 'frame', 'sheet', 'post', 'flower', 'river', 'water', 'bunk', 'sleep', 'head', 'rail', 'sore'],
    'bee': ['hive', 'honey', 'sting', 'buzz', 'queen', 'worker', 'bumble', 'flower', 'pollen', 'wax', 'keeper', 'spelling', 'busy', 'line'],
    'bell': ['ring', 'tower', 'cow', 'door', 'taco', 'liberty', 'alarm', 'church', 'jingle', 'sound', 'boy', 'hop', 'bottom', 'pepper', 'curve'],
    'berry': ['blue', 'straw', 'black', 'rasp', 'cran', 'goose', 'juice', 'pie', 'bush', 'wild', 'sweet', 'pick', 'jam'],
    'bird': ['house', 'bath', 'cage', 'song', 'watch', 'seed', 'black', 'blue', 'hum', 'thunder', 'early', 'lady', 'garden', 'snow', 'fire', 'mock', 'fly'],
    'black': ['bird', 'board', 'berry', 'out', 'smith', 'mail', 'top', 'jack', 'list', 'market', 'hole', 'eye', 'box', 'tie', 'sheep', 'belt', 'fire', 'light'],
    'blood': ['hound', 'line', 'bath', 'stream', 'bank', 'pressure', 'red', 'cell', 'type', 'donor', 'sugar', 'stain', 'flow'],
    'blue': ['berry', 'bird', 'bell', 'print', 'tooth', 'grass', 'jay', 'sky', 'light', 'blood', 'moon', 'collar', 'cheese', 'ridge', 'bonnet'],
    'board': ['game', 'room', 'card', 'chalk', 'clip', 'cup', 'dart', 'floor', 'key', 'note', 'score', 'skate', 'snow', 'surf', 'switch', 'white', 'black', 'base', 'head', 'card'],
    'bolt': ['lightning', 'thunder', 'door', 'lock', 'dead', 'eye', 'action', 'nut', 'screw', 'run', 'cross', 'up'],
    'bone': ['back', 'head', 'dry', 'wish', 'jaw', 'collar', 'fish', 'dog', 'break', 'trom', 'rib', 'marrow'],
    'book': ['shelf', 'worm', 'mark', 'store', 'case', 'club', 'cook', 'text', 'note', 'hand', 'pocket', 'face', 'guide', 'log', 'year', 'play', 'end', 'over', 'page', 'cover'],
    'box': ['card', 'sand', 'mail', 'lunch', 'tool', 'jack', 'music', 'black', 'post', 'fire', 'drop', 'juice', 'match', 'gear', 'fox', 'ice', 'gift', 'out', 'car'],
    'break': ['fast', 'down', 'through', 'water', 'out', 'neck', 'bone', 'day', 'ice', 'ground', 'wind', 'jaw', 'heart', 'news', 'dance'],
    'bridge': ['draw', 'card', 'game', 'over', 'gap', 'water', 'london', 'golden', 'suspension', 'dental', 'nose', 'foot', 'cambridge'],
    'brush': ['tooth', 'hair', 'paint', 'fire', 'stroke', 'off', 'scrub', 'air', 'under', 'sage'],
    'butter': ['fly', 'cup', 'milk', 'scotch', 'cream', 'finger', 'ball', 'nut', 'bean', 'bread', 'sweet', 'peanut', 'apple'],

    // ── C ──
    'cake': ['birthday', 'chocolate', 'layer', 'ice', 'cup', 'cheese', 'pan', 'bake', 'slice', 'wedding', 'piece', 'walk', 'pound', 'frosting', 'coffee', 'funnel', 'short', 'hot', 'rice'],
    'camp': ['fire', 'ground', 'site', 'summer', 'tent', 'out', 'base', 'boot', 'band', 'counselor', 'nature', 'hike', 'cabin', 'day'],
    'candle': ['light', 'stick', 'wax', 'wick', 'birthday', 'flame', 'holder', 'roman', 'scent', 'blow', 'burn', 'night'],
    'cap': ['tain', 'night', 'ice', 'hub', 'knee', 'skull', 'gun', 'toe', 'red', 'snow', 'base', 'hand'],
    'captain': ['hook', 'america', 'ship', 'team', 'jack', 'leader', 'pilot', 'crunch', 'morgan', 'obvious'],
    'car': ['pet', 'pool', 'wash', 'go', 'port', 'seat', 'box', 'jack', 'park', 'side', 'top', 'race', 'stock', 'rail'],
    'card': ['board', 'sharp', 'game', 'credit', 'gift', 'play', 'business', 'birthday', 'wild', 'trick', 'deck', 'poker', 'post', 'flash', 'score', 'report'],
    'castle': ['tower', 'king', 'queen', 'sand', 'stone', 'fortress', 'dragon', 'moat', 'knight', 'bounce'],
    'cat': ['fish', 'nap', 'nip', 'walk', 'suit', 'eye', 'call', 'bob', 'wild', 'copy', 'tom', 'house', 'scan', 'tail'],
    'cell': ['phone', 'tower', 'blood', 'battery', 'prison', 'wall', 'fuel', 'solar', 'brain', 'stem', 'division'],
    'chain': ['link', 'mail', 'saw', 'reaction', 'food', 'gang', 'ball', 'smoke', 'key', 'supply', 'store', 'mountain'],
    'cheese': ['cake', 'burger', 'string', 'cream', 'grilled', 'blue', 'board', 'cloth', 'steak', 'cottage', 'mac', 'goat', 'swiss', 'cheddar'],
    'clock': ['tower', 'time', 'alarm', 'tick', 'watch', 'hand', 'wall', 'cuckoo', 'digital', 'face', 'work', 'wise', 'grand', 'sun', 'round'],
    'cloud': ['rain', 'storm', 'nine', 'burst', 'thunder', 'cover', 'dark', 'silver', 'white', 'soft', 'data', 'storage'],
    'coat': ['rain', 'over', 'top', 'fur', 'sugar', 'arm', 'under', 'lab', 'goat', 'pea', 'trench'],
    'coffee': ['bean', 'cup', 'shop', 'morning', 'brew', 'espresso', 'latte', 'black', 'table', 'grind', 'mug', 'cream', 'break', 'pot', 'house', 'cake', 'stain', 'filter', 'ground', 'ice'],
    'cold': ['blood', 'front', 'snap', 'shoulder', 'war', 'cut', 'stone', 'water', 'heart', 'ice', 'winter', 'flu', 'play', 'turkey'],
    'corn': ['field', 'cob', 'stalk', 'bread', 'meal', 'pop', 'hole', 'row', 'dog', 'stone', 'flower', 'husk', 'silk', 'sweet', 'candy'],
    'cow': ['boy', 'bell', 'girl', 'hide', 'milk', 'pie', 'pox', 'slip', 'ard', 'horn', 'yard'],
    'cross': ['road', 'bow', 'word', 'walk', 'fire', 'bar', 'fit', 'bone', 'check', 'over', 'country', 'section', 'stitch', 'wind'],
    'crown': ['king', 'queen', 'royal', 'gold', 'jewel', 'head', 'prince', 'tooth', 'top', 'glory', 'court'],
    'cup': ['cake', 'board', 'tea', 'coffee', 'butter', 'world', 'sauce', 'holder', 'half', 'egg', 'eye'],

    // ── D ──
    'dark': ['knight', 'night', 'room', 'side', 'horse', 'web', 'matter', 'chocolate', 'cloud', 'ness', 'age', 'star'],
    'day': ['light', 'break', 'dream', 'time', 'birth', 'every', 'sun', 'pay', 'game', 'school', 'work', 'wash', 'rain', 'holi', 'mid'],
    'dead': ['line', 'lock', 'bolt', 'end', 'beat', 'eye', 'wood', 'head', 'pan', 'pool', 'weight', 'heat'],
    'diamond': ['ring', 'gem', 'baseball', 'hard', 'card', 'mine', 'crystal', 'cut', 'rough', 'back', 'head', 'dust', 'plate'],
    'dog': ['house', 'bone', 'fish', 'tag', 'wood', 'watch', 'sled', 'hot', 'under', 'bull', 'cat', 'corn', 'mad', 'lap', 'star', 'prairie', 'fight'],
    'door': ['bell', 'step', 'way', 'knob', 'mat', 'man', 'stop', 'front', 'back', 'trap', 'screen', 'barn', 'key', 'lock', 'slide', 'frame', 'hinge'],
    'down': ['town', 'fall', 'hill', 'pour', 'load', 'stairs', 'turn', 'ward', 'side', 'stream', 'time', 'play', 'grade', 'beat', 'right', 'wind', 'break'],
    'draw': ['bridge', 'back', 'card', 'sketch', 'string', 'line', 'blood', 'sword', 'quick', 'gun', 'luck', 'over'],
    'dream': ['sleep', 'night', 'day', 'pipe', 'land', 'catcher', 'team', 'big', 'american', 'vision', 'boat', 'bad', 'lucid'],
    'drop': ['down', 'out', 'kick', 'rain', 'dew', 'tear', 'back', 'dead', 'box', 'ship', 'snow', 'water', 'jaw', 'eye', 'air', 'gum'],
    'dust': ['pan', 'storm', 'bin', 'bunny', 'devil', 'gold', 'star', 'angel', 'saw', 'cloud', 'coat', 'mop'],

    // ── E ──
    'ear': ['ring', 'drum', 'phone', 'wax', 'ache', 'plug', 'lobe', 'mark', 'piece', 'bud', 'worm', 'wig'],
    'egg': ['shell', 'plant', 'nog', 'cup', 'head', 'roll', 'white', 'yolk', 'fried', 'scramble', 'hard', 'boil', 'hunt', 'easter', 'nest'],
    'eye': ['ball', 'brow', 'lash', 'lid', 'sight', 'drop', 'glass', 'patch', 'witness', 'sore', 'bird', 'bull', 'cat', 'fish', 'hook', 'black', 'eagle', 'shadow'],

    // ── F ──
    'fall': ['down', 'water', 'out', 'back', 'short', 'wind', 'free', 'night', 'rain', 'pit', 'snow', 'land', 'foot', 'over', 'trap', 'leaf', 'tree', 'spring'],
    'fence': ['post', 'link', 'chain', 'picket', 'wire', 'wood', 'rail', 'gate', 'line', 'yard', 'bar', 'iron'],
    'finger': ['tip', 'print', 'nail', 'point', 'ring', 'food', 'snap', 'butter', 'fish', 'board', 'gun', 'spell', 'paint'],
    'fire': ['place', 'work', 'truck', 'fly', 'ball', 'alarm', 'hot', 'flame', 'burn', 'smoke', 'camp', 'light', 'fighter', 'pit', 'wood', 'hydrant', 'starter', 'dragon', 'side', 'arm', 'house', 'bird', 'proof', 'storm', 'bug', 'cracker', 'man'],
    'fish': ['bowl', 'hook', 'bone', 'eye', 'cat', 'gold', 'sword', 'star', 'blow', 'shell', 'tank', 'net', 'pond', 'stick', 'cake', 'finger', 'dog', 'jelly', 'angel', 'clown'],
    'flag': ['ship', 'pole', 'staff', 'red', 'white', 'half', 'check', 'race', 'stone', 'wave', 'drop'],
    'floor': ['board', 'plan', 'show', 'ground', 'dance', 'wood', 'tile', 'mat', 'work', 'space'],
    'flower': ['pot', 'bed', 'girl', 'garden', 'power', 'shop', 'sun', 'wild', 'corn', 'wall', 'press', 'bud', 'bloom', 'petal', 'bouquet'],
    'fly': ['paper', 'wheel', 'ball', 'fire', 'butter', 'dragon', 'house', 'may', 'over', 'by', 'fish', 'bar', 'swat', 'bird', 'time', 'spray'],
    'foot': ['ball', 'note', 'print', 'step', 'wear', 'hold', 'hill', 'path', 'rest', 'bridge', 'stool', 'work', 'fall', 'light', 'loose', 'bare'],
    'fox': ['hound', 'hole', 'fire', 'tail', 'red', 'news', 'trot', 'glove', 'silver', 'quick', 'arctic', 'box'],
    'frame': ['work', 'time', 'door', 'picture', 'bed', 'wire', 'gold', 'main', 'cold'],
    'fresh': ['water', 'air', 'man', 'breath', 'cut', 'prince', 'squeeze', 'mint', 'face', 'baked'],
    'fruit': ['cake', 'fly', 'juice', 'basket', 'salad', 'tree', 'punch', 'cocktail', 'grape', 'passion', 'dragon', 'loop'],

    // ── G ──
    'game': ['board', 'play', 'ball', 'day', 'plan', 'time', 'show', 'over', 'fair', 'name', 'end', 'card', 'war', 'video', 'mind', 'sword'],
    'garden': ['flower', 'plant', 'gate', 'party', 'rose', 'vegetable', 'water', 'herb', 'zen', 'beer', 'bird', 'wall', 'olive', 'roof', 'tea', 'secret'],
    'gate': ['garden', 'way', 'fence', 'iron', 'golden', 'flood', 'tail', 'keeper', 'crash', 'water', 'heaven', 'front', 'back', 'toll', 'swing'],
    'glass': ['window', 'eye', 'sun', 'wine', 'stain', 'blow', 'ceiling', 'cup', 'water', 'sand', 'fiber', 'hour', 'magnify', 'clear', 'break', 'mirror', 'shot', 'looking'],
    'gold': ['fish', 'mine', 'rush', 'ring', 'dust', 'bar', 'medal', 'en', 'pot', 'star', 'smith', 'digger', 'leaf', 'tooth', 'brick', 'coast', 'standard', 'field'],
    'grand': ['father', 'mother', 'stand', 'piano', 'master', 'child', 'parent', 'total', 'prize', 'jury', 'slam', 'canyon', 'finale', 'son'],
    'grass': ['land', 'hopper', 'green', 'blade', 'root', 'court', 'seed', 'snake', 'skirt', 'cut', 'field', 'blue', 'crab', 'lemon'],
    'green': ['house', 'light', 'land', 'peace', 'grass', 'bean', 'tea', 'thumb', 'card', 'field', 'back', 'horn', 'eye', 'olive'],
    'ground': ['water', 'hog', 'floor', 'break', 'work', 'camp', 'play', 'fire', 'back', 'coffee', 'under', 'above', 'battle', 'fore', 'cover', 'zero'],
    'gun': ['fire', 'shot', 'powder', 'point', 'top', 'ship', 'smoke', 'finger', 'hand', 'machine', 'pop', 'water', 'air', 'cap', 'trigger'],
    'guitar': ['string', 'music', 'play', 'bass', 'electric', 'acoustic', 'chord', 'rock', 'pick', 'solo', 'hero', 'air', 'strum', 'lead', 'steel'],

    // ── H ──
    'hair': ['brush', 'cut', 'pin', 'line', 'band', 'net', 'style', 'piece', 'spray', 'tie', 'dresser', 'clip', 'long', 'arm', 'chair', 'split', 'cross'],
    'hand': ['shake', 'bag', 'ball', 'cuff', 'gun', 'made', 'out', 'rail', 'stand', 'write', 'wave', 'clap', 'fist', 'grip', 'book', 'spring', 'print', 'craft', 'palm', 'back', 'clock', 'off'],
    'head': ['band', 'line', 'light', 'phone', 'quarter', 'room', 'stand', 'strong', 'first', 'master', 'board', 'pin', 'stone', 'ache', 'lamp', 'count', 'over', 'bald', 'figure', 'hunter', 'egg', 'dead', 'bone', 'red', 'arrow', 'bull', 'cup'],
    'heart': ['beat', 'break', 'burn', 'land', 'string', 'warm', 'sweet', 'brave', 'ache', 'felt', 'attack', 'gold', 'cold', 'stone', 'lion', 'purple'],
    'high': ['light', 'way', 'land', 'chair', 'rise', 'ball', 'jack', 'life', 'noon', 'school', 'wire', 'five', 'tide', 'horse', 'road'],
    'hive': ['honey', 'bee', 'mind', 'queen', 'five', 'worker', 'swarm', 'comb'],
    'hole': ['worm', 'black', 'key', 'loop', 'man', 'pin', 'pot', 'water', 'rabbit', 'button', 'corn', 'fox', 'arm', 'blow', 'pie', 'fish', 'swim'],
    'honey': ['bee', 'sweet', 'bear', 'comb', 'gold', 'moon', 'pot', 'trap', 'dew', 'badger', 'bun', 'suckle', 'mustard'],
    'hook': ['fish', 'captain', 'eye', 'off', 'worm', 'line', 'book', 'bell', 'coat', 'left', 'right', 'crochet', 'meat'],
    'horse': ['back', 'shoe', 'power', 'play', 'race', 'fly', 'sea', 'war', 'dark', 'work', 'hair', 'cart', 'iron', 'wild', 'stud', 'rocking', 'trojan'],
    'hot': ['dog', 'cake', 'house', 'shot', 'spring', 'spot', 'head', 'pot', 'bed', 'plate', 'rod', 'wire', 'line', 'sauce', 'fire', 'pepper', 'seat'],
    'house': ['wife', 'work', 'hold', 'boat', 'fly', 'cat', 'dog', 'keep', 'plant', 'fire', 'green', 'tree', 'bird', 'play', 'mouse', 'ware', 'coat', 'full', 'light', 'open', 'power', 'store'],

    // ── I ──
    'ice': ['cream', 'berg', 'cap', 'break', 'land', 'box', 'cold', 'cube', 'rink', 'storm', 'tea', 'water', 'age', 'house', 'pick', 'skate', 'blue', 'dry', 'fire', 'moon', 'tip'],

    // ── J ──
    'jack': ['pot', 'knife', 'hammer', 'rabbit', 'apple', 'black', 'lumber', 'crack', 'flap', 'steak', 'car', 'union', 'yellow', 'hit', 'hijack', 'skip', 'boot'],
    'jaw': ['bone', 'break', 'line', 'drop', 'lock', 'fish', 'hinge', 'slack', 'iron'],
    'juice': ['box', 'orange', 'apple', 'grape', 'lemon', 'lime', 'berry', 'fruit', 'bar', 'tomato', 'cran', 'pine', 'power'],

    // ── K ──
    'key': ['board', 'chain', 'hole', 'note', 'ring', 'stone', 'word', 'lock', 'door', 'master', 'car', 'map', 'pad', 'stroke'],
    'king': ['fish', 'pin', 'dom', 'size', 'maker', 'queen', 'crown', 'chess', 'cobra', 'lion', 'burger', 'throne', 'kong'],
    'knight': ['dark', 'chess', 'sword', 'castle', 'round', 'table', 'shining', 'armor', 'noble', 'horse', 'quest', 'hood'],
    'knot': ['hole', 'tie', 'pine', 'slip', 'top', 'hard', 'love', 'reef', 'speed'],

    // ── L ──
    'lady': ['bug', 'bird', 'like', 'finger', 'love', 'luck', 'first', 'old', 'slipper', 'land'],
    'lamp': ['light', 'shade', 'post', 'oil', 'lava', 'floor', 'desk', 'head', 'black', 'flash', 'street', 'table'],
    'land': ['lord', 'mark', 'slide', 'scape', 'mine', 'fill', 'lock', 'fall', 'mass', 'ice', 'farm', 'green', 'grass', 'home', 'island', 'main', 'over', 'dream'],
    'leaf': ['green', 'gold', 'fall', 'clover', 'bay', 'tea', 'loose', 'tree', 'turnover', 'maple', 'page', 'fig'],
    'life': ['time', 'line', 'long', 'guard', 'style', 'like', 'boat', 'blood', 'jacket', 'saver', 'span', 'wild', 'night', 'half', 'shelf', 'high', 'after', 'mid'],
    'light': ['house', 'bulb', 'show', 'weight', 'year', 'speed', 'flash', 'switch', 'moon', 'beam', 'ray', 'lamp', 'torch', 'candle', 'night', 'day', 'fire', 'sun', 'bright', 'spot', 'head', 'star', 'green', 'high', 'foot', 'tail', 'lime', 'search', 'blue', 'sky', 'street', 'flood', 'stop', 'traffic'],
    'lightning': ['bolt', 'bug', 'rod', 'strike', 'fast', 'flash', 'thunder', 'storm', 'chain', 'ball', 'round'],
    'lime': ['stone', 'light', 'green', 'juice', 'tree', 'fruit', 'wedge', 'pie', 'water', 'soda', 'key'],
    'line': ['back', 'blood', 'bottom', 'clothes', 'dead', 'fine', 'fire', 'fish', 'flat', 'front', 'guide', 'hair', 'head', 'hot', 'jaw', 'land', 'life', 'main', 'off', 'on', 'out', 'over', 'pipe', 'punch', 'red', 'shore', 'side', 'sky', 'state', 'story', 'stream', 'straight', 'sun', 'tag', 'time', 'tree', 'under', 'up', 'water', 'waist'],
    'link': ['chain', 'fence', 'cuff', 'weak', 'missing', 'sausage', 'golf'],
    'lock': ['key', 'gate', 'door', 'safe', 'hair', 'pick', 'chain', 'dead', 'pad', 'bolt', 'screen', 'grid', 'jaw', 'land', 'gun', 'out', 'cap', 'inter', 'over', 'war', 'air', 'arm'],

    // ── M ──
    'mail': ['box', 'man', 'post', 'chain', 'air', 'fan', 'snail', 'slot', 'order', 'voice', 'bag', 'black', 'junk', 'stamp', 'email'],
    'match': ['box', 'stick', 'book', 'make', 'game', 'light', 'point', 'play', 'fire', 'mix', 'strike', 'head', 'wrestling', 'chess'],
    'milk': ['shake', 'man', 'maid', 'way', 'cow', 'cream', 'white', 'bottle', 'chocolate', 'cereal', 'glass', 'butter', 'goat', 'almond', 'oat', 'coconut', 'skim', 'whole'],
    'mind': ['set', 'blow', 'field', 'master', 'full', 'hive', 'game', 'read', 'open', 'peace', 'frame', 'eye', 'like', 'land'],
    'mint': ['fresh', 'pepper', 'spear', 'chocolate', 'green', 'leaf', 'candy', 'julep', 'tea', 'cool', 'sauce', 'gold', 'coin'],
    'mirror': ['glass', 'image', 'reflection', 'look', 'face', 'house', 'rear', 'view', 'magic', 'side', 'wall', 'lake', 'vanity', 'fun', 'ball'],
    'moon': ['light', 'shine', 'beam', 'stone', 'walk', 'rise', 'full', 'half', 'new', 'night', 'star', 'sun', 'lunar', 'eclipse', 'dark', 'tide', 'honey', 'blue', 'harvest', 'silver'],
    'morning': ['alarm', 'dawn', 'coffee', 'sunrise', 'breakfast', 'early', 'dew', 'glory', 'star', 'news', 'show', 'good', 'sickness', 'call'],
    'mountain': ['top', 'bike', 'lion', 'goat', 'side', 'range', 'climb', 'peak', 'snow', 'chain', 'spring', 'rock', 'river', 'base', 'view', 'lake', 'gold'],
    'mouse': ['trap', 'pad', 'hole', 'house', 'click', 'cat', 'deer', 'church', 'field', 'bat', 'computer', 'mighty'],
    'music': ['box', 'room', 'band', 'note', 'sheet', 'live', 'pop', 'rock', 'jazz', 'country', 'folk', 'string', 'play', 'score', 'house', 'face', 'dance', 'hip', 'soul'],

    // ── N ──
    'nail': ['hammer', 'finger', 'bed', 'polish', 'head', 'gun', 'iron', 'clipper', 'file', 'salon', 'hit', 'toe', 'coffin', 'tooth'],
    'neck': ['lace', 'tie', 'break', 'red', 'bottle', 'rubber', 'ring', 'bone', 'pain', 'stiff', 'line', 'wood'],
    'needle': ['eye', 'point', 'pine', 'thread', 'knitting', 'compass', 'haystack', 'space', 'sharp', 'sewing'],
    'net': ['work', 'ball', 'fish', 'basket', 'safety', 'hair', 'goal', 'butter', 'drag', 'cast'],
    'news': ['paper', 'break', 'flash', 'cast', 'room', 'stand', 'letter', 'reader', 'feed', 'good', 'bad', 'fox', 'hot', 'morning', 'fake'],
    'night': ['owl', 'fall', 'club', 'cap', 'mare', 'watch', 'shift', 'gown', 'stand', 'life', 'time', 'light', 'moon', 'star', 'dark', 'sleep', 'dream', 'mid', 'good', 'fly', 'hawk'],
    'note': ['book', 'pad', 'key', 'foot', 'bank', 'head', 'side', 'worth', 'quarter', 'whole', 'half', 'love', 'thank', 'music', 'board', 'post'],
    'nut': ['shell', 'crack', 'meg', 'bolt', 'pine', 'pea', 'chest', 'coconut', 'walnut', 'dough', 'butter', 'house', 'tree', 'wing'],

    // ── O ──
    'ocean': ['wave', 'water', 'sea', 'deep', 'blue', 'fish', 'tide', 'salt', 'current', 'floor', 'surf', 'beach', 'shore', 'pacific', 'atlantic', 'front'],
    'oil': ['paint', 'olive', 'palm', 'cooking', 'crude', 'fuel', 'baby', 'engine', 'spill', 'change', 'well', 'snake', 'essential', 'can', 'lamp', 'field', 'slick', 'skin', 'fish', 'coconut'],
    'out': ['break', 'come', 'door', 'fit', 'fox', 'grow', 'house', 'law', 'lay', 'let', 'line', 'look', 'play', 'post', 'put', 'reach', 'run', 'set', 'side', 'smart', 'take', 'ward', 'work'],
    'over': ['board', 'coat', 'flow', 'grow', 'head', 'land', 'load', 'look', 'night', 'power', 'rule', 'see', 'shoot', 'sleep', 'take', 'throw', 'time', 'turn', 'weight', 'work', 'come', 'due', 'all', 'pass', 'hand'],
    'owl': ['night', 'barn', 'hoot', 'wise', 'snowy', 'screech', 'great', 'horned', 'baby', 'eyes'],

    // ── P ──
    'pan': ['cake', 'handle', 'sauce', 'fry', 'bread', 'dust', 'try', 'flash', 'grid', 'spider', 'gold', 'steel'],
    'paper': ['back', 'clip', 'cut', 'news', 'sand', 'tissue', 'toilet', 'trail', 'wall', 'weight', 'work', 'white', 'fly', 'rock', 'towel', 'bag', 'plate', 'plane', 'boy', 'tiger'],
    'park': ['bench', 'way', 'car', 'ball', 'land', 'ranger', 'theme', 'trail', 'water', 'skate', 'amusement', 'national', 'central'],
    'path': ['way', 'foot', 'war', 'bike', 'flight', 'garden', 'tow', 'stone', 'cross', 'block', 'side'],
    'pea': ['nut', 'cock', 'coat', 'green', 'pod', 'soup', 'brain', 'hen', 'shooter', 'sweet'],
    'pen': ['cil', 'knife', 'pal', 'house', 'name', 'play', 'pig', 'bull', 'fountain', 'ball', 'point'],
    'pencil': ['point', 'sharp', 'draw', 'write', 'eraser', 'lead', 'case', 'box', 'mechanical', 'color', 'sketch', 'wood', 'sharpener', 'thin'],
    'pepper': ['mint', 'corn', 'bell', 'black', 'red', 'hot', 'green', 'spray', 'salt', 'chili', 'ghost', 'grinder', 'cayenne', 'white'],
    'phone': ['call', 'cell', 'ring', 'smart', 'mobile', 'screen', 'case', 'number', 'home', 'head', 'ear', 'micro', 'book', 'tap', 'speaker'],
    'pie': ['apple', 'chart', 'crust', 'hole', 'pizza', 'pot', 'mud', 'cow', 'humble', 'magpie', 'cream', 'cherry', 'meat', 'sweet', 'cutie'],
    'pin': ['ball', 'head', 'point', 'cushion', 'wheel', 'bowl', 'stripe', 'push', 'safety', 'rolling', 'clothes', 'hair', 'king', 'tail', 'drop', 'prick'],
    'pipe': ['line', 'dream', 'bag', 'bomb', 'organ', 'drain', 'water', 'lead', 'smoke', 'wind', 'stand', 'peace'],
    'pit': ['bull', 'fire', 'fall', 'stop', 'sand', 'snake', 'cock', 'arm', 'bottom', 'cherry', 'peach', 'olive'],
    'pizza': ['slice', 'cheese', 'delivery', 'box', 'dough', 'sauce', 'oven', 'party', 'topping', 'pepperoni', 'crust', 'pie', 'round', 'hut', 'table'],
    'plant': ['pot', 'house', 'seed', 'flower', 'garden', 'power', 'food', 'water', 'rubber', 'spider', 'egg', 'base', 'floor'],
    'play': ['ground', 'house', 'mate', 'off', 'thing', 'time', 'wright', 'word', 'ball', 'child', 'down', 'fair', 'foul', 'game', 'gun', 'horse', 'role', 'screen', 'sword', 'fore'],
    'point': ['blank', 'break', 'gun', 'ball', 'check', 'counter', 'end', 'finger', 'focal', 'needle', 'pencil', 'pen', 'pin', 'power', 'sharp', 'stand', 'start', 'strong', 'tip', 'turn', 'view', 'weak', 'west'],
    'pool': ['car', 'dead', 'party', 'side', 'swim', 'table', 'tide', 'whirl', 'blood', 'rock', 'water', 'liver'],
    'pop': ['corn', 'music', 'gun', 'star', 'culture', 'fly', 'eye', 'lollipop', 'over', 'shop', 'up', 'soda'],
    'post': ['card', 'box', 'man', 'mark', 'office', 'stamp', 'sign', 'bed', 'door', 'fence', 'goal', 'lamp', 'mail', 'finger', 'note', 'war', 'game'],
    'pot': ['flower', 'gold', 'hole', 'honey', 'hot', 'jack', 'crack', 'coffee', 'tea', 'stock', 'shot', 'lid', 'luck', 'belly', 'pie', 'roast'],
    'power': ['house', 'plant', 'line', 'point', 'horse', 'play', 'man', 'grid', 'cut', 'flower', 'gun', 'full', 'brain', 'wind', 'solar', 'super', 'water', 'over', 'fire', 'will'],
    'print': ['finger', 'blue', 'foot', 'news', 'out', 'press', 'screen', 'fine', 'hand', 'shop', 'wood', 'block', 'head', 'over', 'mis'],

    // ── R ──
    'rain': ['bow', 'coat', 'drop', 'fall', 'forest', 'storm', 'water', 'cloud', 'check', 'dance', 'maker', 'pour', 'day', 'acid', 'brain'],
    'ring': ['bell', 'finger', 'wedding', 'boxing', 'phone', 'circle', 'lord', 'diamond', 'gold', 'silver', 'ear', 'tone', 'leader', 'master', 'neck', 'key', 'nose', 'side', 'worm', 'spring'],
    'river': ['bank', 'bed', 'boat', 'bridge', 'flow', 'side', 'stream', 'water', 'delta', 'deep', 'fish', 'mouth', 'cross', 'horse', 'snake', 'fox', 'over'],
    'road': ['block', 'kill', 'map', 'race', 'runner', 'side', 'show', 'sign', 'trip', 'way', 'work', 'cross', 'off', 'rail', 'high', 'main'],
    'rock': ['star', 'band', 'music', 'hard', 'climb', 'roll', 'solid', 'bottom', 'paper', 'bed', 'slide', 'mountain', 'stone', 'boulder', 'party', 'punk', 'classic', 'black', 'sand', 'chair', 'pool', 'fish', 'salt'],
    'rocket': ['ship', 'launch', 'man', 'fuel', 'science', 'red', 'boost', 'fly', 'sky', 'fire', 'space', 'fast'],
    'room': ['mate', 'bed', 'bath', 'class', 'ball', 'board', 'dark', 'chat', 'escape', 'show', 'living', 'clean', 'service', 'music', 'green', 'news', 'stock', 'head', 'work', 'war'],
    'round': ['table', 'about', 'house', 'trip', 'up', 'ball', 'turn', 'ring', 'fight', 'boxing', 'robin', 'clock', 'ground', 'all', 'play', 'year', 'world'],

    // ── S ──
    'sand': ['beach', 'castle', 'dune', 'storm', 'box', 'paper', 'quick', 'dollar', 'grain', 'pit', 'bag', 'time', 'glass', 'bar', 'stone', 'bank', 'fly', 'piper', 'blast'],
    'sea': ['horse', 'shell', 'shore', 'food', 'side', 'weed', 'bird', 'port', 'bed', 'sick', 'son', 'scape', 'man', 'gull', 'water', 'lion'],
    'seed': ['bed', 'bird', 'corn', 'sun', 'flower', 'plant', 'grass', 'tree', 'weed', 'apple', 'grape', 'pod', 'scatter', 'sesame', 'pumpkin'],
    'shadow': ['box', 'cast', 'dark', 'puppet', 'shade', 'follow', 'ban', 'figure', 'land', 'eye', 'play', 'light'],
    'shake': ['hand', 'milk', 'earth', 'head', 'baby', 'salt', 'down', 'off', 'up', 'rattle', 'protein', 'leg'],
    'sharp': ['point', 'knife', 'edge', 'note', 'mind', 'dress', 'shooter', 'tongue', 'turn', 'flat', 'eye', 'tooth', 'card'],
    'shell': ['fish', 'sea', 'egg', 'shot', 'nut', 'bomb', 'shock', 'hard', 'clam', 'oyster', 'tortoise', 'fire', 'pea', 'out', 'gun'],
    'ship': ['wreck', 'yard', 'mate', 'captain', 'sail', 'flag', 'war', 'rocket', 'battle', 'cargo', 'pirate', 'cruise', 'steam', 'air', 'mother', 'space'],
    'shoe': ['horn', 'lace', 'string', 'horse', 'maker', 'box', 'tree', 'snow', 'gum', 'sole'],
    'show': ['boat', 'case', 'down', 'man', 'off', 'room', 'time', 'light', 'talk', 'game', 'road', 'side', 'piece', 'band', 'floor', 'gun', 'slide', 'horse', 'stop'],
    'side': ['walk', 'line', 'kick', 'burn', 'car', 'step', 'track', 'show', 'board', 'arm', 'bed', 'fire', 'hill', 'road', 'ring', 'way', 'wind', 'blind'],
    'silver': ['ware', 'screen', 'fish', 'smith', 'moon', 'fox', 'lining', 'medal', 'tongue', 'bell', 'bullet', 'back', 'mine', 'quick'],
    'sky': ['light', 'line', 'scraper', 'rocket', 'dive', 'lark', 'blue', 'high', 'walk', 'write', 'fall', 'ward', 'night', 'clear'],
    'smoke': ['screen', 'stack', 'alarm', 'signal', 'gun', 'pipe', 'fire', 'ring', 'house', 'cloud', 'chain', 'detector'],
    'snake': ['bite', 'skin', 'oil', 'eye', 'pit', 'charm', 'grass', 'rattle', 'head', 'river', 'water', 'king', 'coral', 'black'],
    'snow': ['ball', 'flake', 'man', 'board', 'shoe', 'cap', 'bird', 'drop', 'fall', 'plow', 'storm', 'drift', 'white', 'blind', 'globe', 'mobile'],
    'space': ['ship', 'craft', 'walk', 'suit', 'time', 'bar', 'station', 'man', 'rocket', 'shuttle', 'air', 'back', 'work', 'cyber', 'deep', 'head', 'outer'],
    'speed': ['boat', 'way', 'bump', 'dial', 'light', 'gun', 'well', 'limit', 'racer', 'trap', 'god', 'read', 'high', 'over'],
    'spring': ['board', 'time', 'water', 'chicken', 'roll', 'break', 'field', 'flower', 'clean', 'well', 'off', 'hot', 'hand', 'bed', 'ring', 'fall'],
    'stamp': ['post', 'mail', 'collect', 'rubber', 'approval', 'ink', 'date', 'food', 'out', 'time', 'passport', 'gold'],
    'star': ['fish', 'light', 'war', 'rock', 'gold', 'dust', 'gaze', 'night', 'sky', 'bright', 'shoot', 'movie', 'pop', 'death', 'all', 'north', 'five', 'dog', 'sea', 'super', 'lone', 'fire', 'day', 'fall'],
    'steam': ['boat', 'ship', 'engine', 'iron', 'roll', 'pipe', 'room', 'punk', 'cloud', 'train', 'power', 'valve', 'whistle'],
    'stone': ['cold', 'wall', 'mason', 'bridge', 'lime', 'sand', 'key', 'mile', 'grave', 'corner', 'flag', 'step', 'blood', 'gem', 'ground', 'brown', 'yellow', 'cobble', 'hail', 'moon', 'tomb', 'head', 'fire'],
    'storm': ['cloud', 'brain', 'fire', 'hail', 'ice', 'rain', 'sand', 'snow', 'thunder', 'barn', 'dust', 'eye', 'lightning', 'wind', 'electric', 'sea', 'perfect'],
    'string': ['bean', 'cheese', 'guitar', 'shoe', 'puppet', 'quartet', 'theory', 'tie', 'along', 'bow', 'heart', 'pull', 'ham', 'purse', 'apron', 'music'],
    'sun': ['light', 'shine', 'burn', 'rise', 'set', 'flower', 'screen', 'glasses', 'roof', 'day', 'tan', 'block', 'beam', 'ray', 'bright', 'star', 'stroke', 'dial', 'bath', 'seed', 'spot'],
    'sweet': ['heart', 'corn', 'pea', 'potato', 'tooth', 'dream', 'talk', 'shop', 'water', 'berry', 'cake', 'honey', 'pie', 'sauce', 'bitter'],
    'sword': ['fish', 'play', 'fight', 'sharp', 'broad', 'edge', 'man', 'smith', 'game', 'cross'],

    // ── T ──
    'table': ['cloth', 'top', 'tennis', 'coffee', 'dinner', 'pool', 'turn', 'set', 'card', 'leg', 'chair', 'round', 'side', 'time', 'water', 'pizza', 'lamp', 'flat', 'stable'],
    'tail': ['gate', 'spin', 'coat', 'wind', 'light', 'pipe', 'fox', 'horse', 'pony', 'cat', 'dog', 'fairy', 'cock', 'detail', 'pig', 'rat', 'pin'],
    'tea': ['pot', 'cup', 'bag', 'spoon', 'party', 'kettle', 'leaf', 'time', 'house', 'garden', 'green', 'black', 'ice', 'mint', 'tree', 'cake', 'room'],
    'thunder': ['bolt', 'storm', 'cloud', 'clap', 'bird', 'crack', 'head', 'struck', 'roll', 'shower', 'lightning', 'weather', 'loud'],
    'tide': ['wave', 'pool', 'water', 'moon', 'high', 'low', 'turn', 'rise', 'change', 'ebb', 'spring', 'red', 'ocean'],
    'time': ['line', 'table', 'clock', 'out', 'bomb', 'zone', 'travel', 'stamp', 'frame', 'piece', 'share', 'half', 'bed', 'day', 'down', 'full', 'game', 'good', 'hard', 'life', 'long', 'mean', 'night', 'old', 'over', 'play', 'past', 'prime', 'real', 'sand', 'short', 'show', 'some', 'spring', 'supper', 'war'],
    'tip': ['top', 'toe', 'ice', 'finger', 'off', 'over', 'point', 'pen', 'wing', 'bull', 'horse', 'cow', 'filter'],
    'tooth': ['brush', 'ache', 'paste', 'pick', 'fairy', 'sweet', 'saw', 'sharp', 'gold', 'wisdom', 'crown', 'saber'],
    'top': ['coat', 'hat', 'soil', 'spin', 'gun', 'side', 'table', 'tip', 'floor', 'lap', 'knot', 'tree', 'over', 'hill', 'mountain', 'counter', 'desk', 'roof', 'tank', 'notch'],
    'tower': ['bell', 'block', 'bridge', 'castle', 'cell', 'clock', 'control', 'guard', 'gun', 'ivory', 'london', 'power', 'water', 'eiffel', 'babel', 'fire', 'watch', 'trump', 'church', 'tall'],
    'town': ['house', 'ship', 'hall', 'home', 'cape', 'down', 'ghost', 'china', 'mid', 'small', 'old', 'light'],
    'train': ['track', 'station', 'wreck', 'car', 'ride', 'steam', 'freight', 'express', 'brain', 'rain', 'main', 'bullet', 'chain', 'power', 'gravy'],
    'tree': ['house', 'top', 'line', 'trunk', 'branch', 'root', 'bark', 'leaf', 'pine', 'palm', 'apple', 'cherry', 'lemon', 'lime', 'olive', 'oak', 'family', 'shoe', 'christmas', 'nut', 'fruit', 'fall', 'birch'],

    // ── U ──
    'under': ['cover', 'dog', 'ground', 'line', 'mine', 'pass', 'score', 'side', 'stand', 'take', 'tone', 'water', 'wear', 'world', 'cut', 'age', 'go', 'hand', 'belly', 'foot'],

    // ── W ──
    'wall': ['paper', 'flower', 'fire', 'stone', 'street', 'brick', 'clock', 'eye', 'sea', 'stall', 'mirror', 'nut'],
    'war': ['horse', 'head', 'lord', 'path', 'ship', 'time', 'zone', 'fare', 'game', 'paint', 'room', 'chest', 'craft', 'star', 'post', 'cold', 'civil', 'drug', 'world'],
    'water': ['fall', 'front', 'color', 'melon', 'proof', 'shed', 'side', 'way', 'bed', 'bird', 'board', 'course', 'craft', 'field', 'gate', 'gun', 'hole', 'line', 'log', 'mark', 'park', 'pipe', 'polo', 'pot', 'power', 'slide', 'spout', 'tight', 'tower', 'works', 'rain', 'spring', 'salt', 'fresh', 'ground', 'deep', 'flood', 'back', 'ice', 'white', 'under'],
    'wave': ['hand', 'water', 'ocean', 'surf', 'sound', 'radio', 'heat', 'light', 'air', 'shock', 'brain', 'flag', 'micro', 'short', 'tidal', 'crime', 'cold', 'new', 'length'],
    'wheel': ['chair', 'house', 'barrow', 'cart', 'fly', 'gear', 'pin', 'spin', 'steering', 'water', 'big', 'cart', 'color', 'ferris', 'free', 'mill', 'paddle', 'prayer', 'spare', 'spoke', 'training'],
    'white': ['board', 'house', 'wash', 'out', 'cap', 'fish', 'tail', 'water', 'noise', 'collar', 'flag', 'knight', 'light', 'lie', 'paper', 'sand', 'shark', 'snow', 'wall'],
    'wind': ['mill', 'shield', 'pipe', 'breaker', 'fall', 'ward', 'sock', 'storm', 'burn', 'screen', 'blow', 'chill', 'down', 'power', 'surf', 'tail', 'cross', 'head', 'whirl', 'side'],
    'wood': ['pecker', 'land', 'work', 'fire', 'house', 'pile', 'chip', 'block', 'cut', 'drift', 'floor', 'grain', 'hard', 'pine', 'ply', 'red', 'soft', 'dead', 'dog', 'green', 'iron', 'knot', 'neck', 'worm'],
    'word': ['play', 'press', 'smith', 'search', 'cross', 'pass', 'buzz', 'key', 'catch', 'sword', 'fore', 'guess', 'after', 'swear'],
    'work': ['bench', 'book', 'day', 'force', 'horse', 'house', 'load', 'man', 'out', 'over', 'place', 'room', 'shop', 'space', 'station', 'frame', 'fire', 'foot', 'ground', 'hand', 'home', 'net', 'team', 'clock', 'art', 'body', 'brain', 'brick', 'dream', 'class', 'course', 'field', 'hard', 'iron', 'master', 'patch', 'pipe', 'wood'],
    'worm': ['hole', 'book', 'earth', 'glow', 'inch', 'ring', 'silk', 'tape', 'wood', 'ear', 'slow', 'can'],
};

// ───────────────────────────────────────────────────────────────────────────
//  GENERATOR — cycles through pool deterministically per date
// ───────────────────────────────────────────────────────────────────────────

export function generateChainlinkPuzzle(date: Date): ChainlinkPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 43 + 19);

    // Use modulo to cycle through entire pool before repeating
    const dayIndex = seed % CHAINLINK_POOL.length;
    // Add a seeded shuffle offset so the order isn't purely sequential
    const offset = Math.floor(rng() * CHAINLINK_POOL.length);
    const idx = (dayIndex + offset) % CHAINLINK_POOL.length;
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

/** All words that have outgoing associations — the playable Chainlink vocabulary. */
export function associationVocabulary(): string[] {
    return Object.keys(ASSOCIATION_MAP);
}

/** Whether a word is a valid Chainlink anchor (has outgoing associations). */
export function isAssociationKey(word: string): boolean {
    return Boolean(ASSOCIATION_MAP[word.toLowerCase().trim()]);
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
