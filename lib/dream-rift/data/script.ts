import type { DialogueLine } from '../types';

// =============================================================================
// Dream Rift — Full Game Script
// =============================================================================
// Two routes: Rei (power / confrontational) and Yume (speed / investigative)
// 6 stages, each with intro, mid-boss, boss encounter, boss defeat, and outro.
// Stage 6 culminates with The Dreamer — the emotional climax of both routes.
// =============================================================================

export interface StageScript {
  stageIntro: DialogueLine[];
  midBossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossDefeat: { rei: DialogueLine[]; yume: DialogueLine[] };
  stageOutro: { rei: DialogueLine[]; yume: DialogueLine[] };
}

// =============================================================================
// STAGE 1 — Lucid Meadow
// =============================================================================
// Ethereal flower fields stretching in every direction. Floating paper lanterns
// drift overhead, casting soft amber light. The grass shimmers with dew that
// never dries. The Rift's influence is subtle here — petals occasionally
// dissolving into static before reforming.
// =============================================================================

const stage1: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'The boundary between waking and dreaming has torn open. A meadow of impossible flowers stretches beyond the Rift — luminous, alive, and deeply wrong.',
    },
    {
      speaker: 'narrator',
      text: 'Paper lanterns float overhead, their light warm but wavering, as if the dream itself is uncertain whether to welcome or consume you.',
    },
    {
      speaker: 'narrator',
      text: 'Something stirs among the petals. The meadow has a guardian — and it does not recognize you.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'Dream Sprite',
        text: 'A visitor! A real visitor! You smell like the waking world... like coffee and alarm clocks!',
        emotion: 'happy',
      },
      {
        speaker: 'rei',
        text: 'Out of my way, sparkle-bug. I don\'t have time for the welcome committee.',
        emotion: 'angry',
      },
      {
        speaker: 'Dream Sprite',
        text: 'So rude! Nobody passes through the meadow without playing with me first!',
        emotion: 'angry',
      },
    ],
    yume: [
      {
        speaker: 'Dream Sprite',
        text: 'Oh! Oh oh oh! A dreamer who\'s still awake? How did you get here?',
        emotion: 'surprised',
      },
      {
        speaker: 'yume',
        text: 'Through the Rift. I\'m investigating what opened it. Have you noticed anything strange?',
        emotion: 'neutral',
      },
      {
        speaker: 'Dream Sprite',
        text: 'Strange? Everything\'s strange! The flowers used to sing, but now they scream! Let me show you!',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'Wait — show me gently, please!',
        emotion: 'surprised',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'At the meadow\'s heart, a figure stands before an arch of woven starlight — the Gate between the outer dream and what lies deeper.',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'You carry a blade into a world made of thought. How very... literal of you.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'And you\'re standing between me and the thing tearing reality apart. How very inconvenient for you.',
        emotion: 'angry',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'I am the first threshold. All who enter the deeper dream must prove they can endure its weight.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'I didn\'t come here to take a test. I came here to cut the problem at its source.',
        emotion: 'angry',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'Then let your blade speak for you. Show me the strength of one who refuses to dream.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The meadow converges on a luminous archway — and before it, a silent figure waits with the patience of something that has stood here since the first dream was ever dreamt.',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'You approach with open hands instead of drawn weapons. That is... unusual.',
        emotion: 'surprised',
      },
      {
        speaker: 'yume',
        text: 'I\'m not here to fight you. Something is wrong with the Rift, and I need to understand why.',
        emotion: 'neutral',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'Understanding requires passage through the deeper dream. And passage requires proof of resolve.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'Then test me. But know that I\'ll be asking questions the entire time.',
        emotion: 'happy',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'Ha. Very well. Your curiosity is your weapon — let us see how sharp it truly is.',
        emotion: 'happy',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'Keeper of the Gate',
        text: 'Formidable... You cut through my trials as though they were paper. The deeper dream awaits you.',
        emotion: 'surprised',
      },
      {
        speaker: 'rei',
        text: 'That\'s more like it. What\'s past this gate?',
        emotion: 'neutral',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'Memory. Madness. The things dreamers forget upon waking. Tread carefully — or don\'t. You seem the type.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'Keeper of the Gate',
        text: 'You pass. Your resolve is quiet, but it runs deep — like a river beneath still earth.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'Before I go — who opened the Rift? Do you know?',
        emotion: 'neutral',
      },
      {
        speaker: 'Keeper of the Gate',
        text: 'The one who sleeps at the core. They have been calling out for a long time. Perhaps... they finally broke through.',
        emotion: 'sad',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The gate groans open. Beyond it, the dream deepens — and the meadow\'s gentle light gives way to the musty dark of an impossible library.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The gate opens without a sound. Yume steps through into a world of ink and parchment, where every page holds a forgotten thought.',
      },
    ],
  },
};

// =============================================================================
// STAGE 2 — Drowning Library
// =============================================================================
// An infinite library where the shelves stretch beyond sight in every direction.
// Rivers of ink flow between the aisles. Pages tear themselves free and swirl
// through the air as danmaku. The deeper you go, the more the words on the
// pages become illegible — replaced by symbols that hurt to read.
// =============================================================================

const stage2: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'An infinite library unfolds in every direction. Shelves spiral upward into darkness, and rivers of black ink wind between the aisles like veins.',
    },
    {
      speaker: 'narrator',
      text: 'Pages rip free from their bindings and swirl through the air — each one a forgotten memory, a lost thought, a dream that someone never finished.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'Ink Phantom',
        text: 'Shhhhh... This is a library. You\'re being much too loud with all that sword-swinging.',
        emotion: 'angry',
      },
      {
        speaker: 'rei',
        text: 'Then I\'ll make this quick so you can get back to your eternal silence.',
        emotion: 'angry',
      },
      {
        speaker: 'Ink Phantom',
        text: 'Quick? No, no. Stories take time. Let me write you a tragedy.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'Ink Phantom',
        text: 'Another reader? How delightful. Most visitors can\'t even see the words anymore.',
        emotion: 'happy',
      },
      {
        speaker: 'yume',
        text: 'The text on these pages... it\'s degrading. Something is corrupting the library from within.',
        emotion: 'neutral',
      },
      {
        speaker: 'Ink Phantom',
        text: 'Corrupting? Or editing? The Archivist has been... revising the collection. I merely guard the margins.',
        emotion: 'neutral',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'At the library\'s deepest chamber, a vast figure hunches over an endless desk, furiously writing and erasing, writing and erasing.',
      },
      {
        speaker: 'The Archivist',
        text: 'Do not interrupt me. I am cataloguing every dream that has ever been lost. There are... so many.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'You\'re hoarding stolen memories. People\'s dreams are leaking through the Rift because of this place.',
        emotion: 'angry',
      },
      {
        speaker: 'The Archivist',
        text: 'Stolen? I am preserving them! Without my archive, they would dissolve into nothing!',
        emotion: 'angry',
      },
      {
        speaker: 'rei',
        text: 'They\'re not yours to keep. Stand aside or I\'ll cut through every page in this place.',
        emotion: 'angry',
      },
      {
        speaker: 'The Archivist',
        text: 'Barbarian! Very well — I shall write your defeat into the permanent collection!',
        emotion: 'angry',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'Deep within the library, a towering figure sits at a desk that stretches into infinity, surrounded by mountains of manuscripts that glow with fading light.',
      },
      {
        speaker: 'The Archivist',
        text: 'Ah, a visitor who reads before she acts. How refreshing. Most simply tear through my shelves.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'You\'re collecting dreams that fall through the Rift, aren\'t you? But the collection is overwhelming you.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Archivist',
        text: '...You can tell? The influx has been... unprecedented. Since the Rift opened, thousands pour in every hour.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'I can help, but I need to go deeper. What lies beyond the library?',
        emotion: 'neutral',
      },
      {
        speaker: 'The Archivist',
        text: 'Beyond? Time itself. And I cannot let you pass until I know your intentions are true. Prove it!',
        emotion: 'neutral',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'The Archivist',
        text: 'My pages... scattered. You fight as though words mean nothing to you.',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'Words are fine. Cages made of words aren\'t. The dreams you\'re hoarding belong to their dreamers.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'The Archivist',
        text: 'You fought with precision, not destruction. Perhaps... you truly do wish to understand.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'I do. When the Rift is sealed, will you be alright? Can the library heal?',
        emotion: 'sad',
      },
      {
        speaker: 'The Archivist',
        text: 'If the flood stops... yes. Go. Find the one who opened the Rift. And tell them... the library remembers everything.',
        emotion: 'neutral',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The ink rivers part. Beyond the final shelf, gears grind in the dark — the sound of time being devoured.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'A passage opens between the shelves, revealing a corridor of frozen clockwork. Yume steps forward into a place where time has forgotten how to move.',
      },
    ],
  },
};

// =============================================================================
// STAGE 3 — Clockwork Abyss
// =============================================================================
// Time is broken here. Massive gears hang frozen in the void. Pendulums swing
// in reverse. Clocks melt and reform. Bullets slow down and speed up
// unpredictably. The space itself stutters — frames of reality repeating,
// skipping, rewinding.
// =============================================================================

const stage3: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'Time shatters. Gears the size of mountains hang motionless in a void of ticking silence. Pendulums swing backward. Clocks melt and reform in endless loops.',
    },
    {
      speaker: 'narrator',
      text: 'This is the Clockwork Abyss — where every moment that was ever lost in a dream comes to die.',
    },
    {
      speaker: 'narrator',
      text: 'Reality stutters here. Be warned: what moves forward may suddenly move back.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'Time Fragment',
        text: 'You-you-you are here-here-here. I am a moment that keeps repeating-repeating-repeating.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'Great. A broken record. Let me fix that for you.',
        emotion: 'angry',
      },
      {
        speaker: 'Time Fragment',
        text: 'Fix? You cannot fix time! Time fixes YOU-YOU-YOU—',
        emotion: 'angry',
      },
    ],
    yume: [
      {
        speaker: 'Time Fragment',
        text: 'Help... me... I was a single second, but the Rift stretched me across an eternity...',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'A fragment of broken time? You poor thing. What happened here?',
        emotion: 'sad',
      },
      {
        speaker: 'Time Fragment',
        text: 'The Chronophage... eats moments... to keep the Abyss stable. But it is never... enough...',
        emotion: 'sad',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'At the Abyss\'s center, something vast turns — a creature made of interlocking gears and stolen seconds, grinding endlessly.',
      },
      {
        speaker: 'The Chronophage',
        text: 'Another mortal stumbling through frozen time. I have seen you arrive a thousand times. In some of them, you lose.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'Yeah? Well in this timeline, I win. Let\'s not waste any more of your precious time.',
        emotion: 'angry',
      },
      {
        speaker: 'The Chronophage',
        text: 'Waste? I consume time. I do not waste it. Every second I devour keeps this Abyss from collapsing into the waking world.',
        emotion: 'angry',
      },
      {
        speaker: 'rei',
        text: 'Noble speech from something that eats people\'s stolen moments. Move or be moved.',
        emotion: 'angry',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The Abyss\'s heart is a creature of interlocking gears — ancient, immense, and profoundly tired.',
      },
      {
        speaker: 'The Chronophage',
        text: 'You move with purpose through a place where purpose dissolves. Why?',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'Because someone at the Rift\'s core needs help. And I think you do too.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Chronophage',
        text: 'Help... I have been devouring lost seconds to keep the Abyss stable since the Rift tore open. I am so... tired.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'Then let me pass. If I can seal the Rift, the time flow will stabilize. You can rest.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Chronophage',
        text: 'Rest... I no longer remember what that means. But I must test you first. The deeper dream demands it.',
        emotion: 'neutral',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'The Chronophage',
        text: 'Impossible... you moved faster than time itself. What manner of human are you?',
        emotion: 'surprised',
      },
      {
        speaker: 'rei',
        text: 'The impatient kind. Now — what\'s past the Abyss?',
        emotion: 'neutral',
      },
      {
        speaker: 'The Chronophage',
        text: 'Reflections. The place where the dream shows you yourself. Do not flinch.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'The Chronophage',
        text: 'You fought without malice. The gears... are turning again. Slowly, but turning.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'Rest now. I\'ll fix this — I promise.',
        emotion: 'happy',
      },
      {
        speaker: 'The Chronophage',
        text: 'The one ahead... the Mirror Palace... it will show you truths you may not wish to see. Be ready.',
        emotion: 'neutral',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'Time lurches forward. The gears begin to turn — and in their reflection, Rei sees a palace of mirrors stretching into infinity.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The frozen seconds thaw. As the Abyss exhales, Yume catches a glimpse of her own reflection multiplied a thousand times in the surfaces ahead.',
      },
    ],
  },
};

// =============================================================================
// STAGE 4 — Mirror Palace
// =============================================================================
// A palace made entirely of mirrors. Every surface reflects — but the
// reflections don't always match. Your mirror-self moves a half-second behind,
// then a half-second ahead. The symmetry is beautiful and deeply unsettling.
// The deeper you go, the more the reflections deviate from reality.
// =============================================================================

const stage4: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'A palace of infinite mirrors unfolds. Every surface reflects, but the reflections do not obey. They lag behind. They move ahead. They smile when you do not.',
    },
    {
      speaker: 'narrator',
      text: 'In the Mirror Palace, the dream confronts you with the one opponent you can never truly defeat: yourself.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'Doppelganger',
        text: 'Hello, me. Or should I say — hello, the version of me that still thinks she can solve everything with a sword.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: '...You\'re not me. You\'re a reflection. And reflections break.',
        emotion: 'angry',
      },
      {
        speaker: 'Doppelganger',
        text: 'Maybe. But I know every move you\'ll make before you make it. After all — I\'ve been watching.',
        emotion: 'happy',
      },
    ],
    yume: [
      {
        speaker: 'Doppelganger',
        text: 'Oh, Yume. Always trying to understand everyone else. When was the last time you tried to understand yourself?',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'You\'re... me. But you feel different. Colder.',
        emotion: 'surprised',
      },
      {
        speaker: 'Doppelganger',
        text: 'I\'m the part of you that\'s tired of being kind. Let\'s see which one of us is real.',
        emotion: 'angry',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'At the Palace\'s heart, every mirror shatters — and from the shards, a figure assembles itself, wearing your face twisted into a grin that doesn\'t belong to you.',
      },
      {
        speaker: 'The Narcissist',
        text: 'Magnificent, isn\'t it? Every mirror in this palace reflects the most beautiful thing in existence: me.',
        emotion: 'happy',
      },
      {
        speaker: 'rei',
        text: 'You turned this whole place into a shrine to yourself? That\'s not confidence — that\'s a cry for help.',
        emotion: 'angry',
      },
      {
        speaker: 'The Narcissist',
        text: 'Help? I am perfection! Every reflection proves it! And you — you\'re just a crude original. Imperfect. Flawed.',
        emotion: 'angry',
      },
      {
        speaker: 'rei',
        text: 'Flawed, sure. But at least I\'m real. You\'re just glass.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Narcissist',
        text: 'GLASS?! I\'ll shatter you into a thousand reflections and keep the prettiest one!',
        emotion: 'angry',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The Palace converges on a throne of mirrors, where a figure sits draped in light — a being that has stared at its own reflection so long it has forgotten what it was reflecting.',
      },
      {
        speaker: 'The Narcissist',
        text: 'Another face? How quaint. But tell me — is your face truly yours, or just what the dream wants you to see?',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'That\'s... actually a good question. In a dream, identity is fluid. Is that what happened to you?',
        emotion: 'neutral',
      },
      {
        speaker: 'The Narcissist',
        text: 'Happened to me? I chose this! I gazed into the mirrors until I became the most beautiful thing in them!',
        emotion: 'happy',
      },
      {
        speaker: 'yume',
        text: 'But you\'re trapped. If you look away from the mirrors, do you even know who you are anymore?',
        emotion: 'sad',
      },
      {
        speaker: 'The Narcissist',
        text: 'SILENCE! I don\'t need to look away — I need you to LOOK AT ME!',
        emotion: 'angry',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'The Narcissist',
        text: 'No... my reflections... they\'re cracking... I can\'t see myself anymore...',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'Maybe that\'s a good thing. Try looking outward for once.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'The Narcissist',
        text: 'The mirrors... they\'re going dark. I can\'t... who am I without them?',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'Someone who can finally find out. You don\'t need a reflection to exist.',
        emotion: 'happy',
      },
      {
        speaker: 'The Narcissist',
        text: '...Go. Before I change my mind. The carnival beyond is far worse than any mirror.',
        emotion: 'neutral',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The mirrors fall silent. Through the shattered glass, distant music plays — warped, carnivalesque, and burning.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'As the last mirror goes dark, a smell drifts through the Palace: smoke, sugar, and something underneath that makes the dream itself flinch.',
      },
    ],
  },
};

// =============================================================================
// STAGE 5 — Burning Carnival
// =============================================================================
// A nightmare carnival ablaze. Ferris wheels spin in reverse, wreathed in
// prismatic fire. Carousel horses gallop through the sky trailing embers.
// Everything is on fire but nothing burns away — the destruction loops endlessly.
// The laughter of a crowd that isn't there echoes between the tents.
// =============================================================================

const stage5: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'A carnival in eternal conflagration. Ferris wheels spin backward through prismatic fire. Carousel horses trail embers across a sky that has forgotten what stars look like.',
    },
    {
      speaker: 'narrator',
      text: 'The laughter of a thousand absent visitors echoes between burning tents that never collapse. This is joy curdled into nightmare — and it is spectacular.',
    },
    {
      speaker: 'narrator',
      text: 'Somewhere in the inferno, a ringmaster\'s shadow beckons. The show must go on.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'Ring Master\'s Shadow',
        text: 'LADIES AND GENTLEMEN! Tonight\'s main event: a swordswoman versus an entire carnival! Place your bets!',
        emotion: 'happy',
      },
      {
        speaker: 'rei',
        text: 'I\'m not here for your show. Where\'s your boss?',
        emotion: 'angry',
      },
      {
        speaker: 'Ring Master\'s Shadow',
        text: 'The Jester? Oh, you\'ll find them at the center ring! But first — the OPENING ACT!',
        emotion: 'happy',
      },
    ],
    yume: [
      {
        speaker: 'Ring Master\'s Shadow',
        text: 'Step right up, step right up! One admission gets you a front-row seat to the end of everything!',
        emotion: 'happy',
      },
      {
        speaker: 'yume',
        text: 'This carnival... it\'s a recurring nightmare, isn\'t it? Someone dreamed this place into being.',
        emotion: 'neutral',
      },
      {
        speaker: 'Ring Master\'s Shadow',
        text: 'Dreamed it? HA! This is what happens when joy goes unattended for too long. Now sit back and enjoy the flames!',
        emotion: 'happy',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The center ring. A figure dances atop a pillar of flame, juggling spheres of compressed nightmare. Their laughter cracks the air like breaking glass.',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'AHAHAHAHA! Finally! Someone who looks like they know how to have a BAD time!',
        emotion: 'happy',
      },
      {
        speaker: 'rei',
        text: 'You think setting a dream world on fire is funny?',
        emotion: 'angry',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'Funny? It\'s HILARIOUS! Do you know what a nightmare carnival represents? It\'s every broken promise of fun anyone has ever had!',
        emotion: 'happy',
      },
      {
        speaker: 'rei',
        text: 'Great backstory. Now hold still while I put out your fire.',
        emotion: 'angry',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'Oh, you\'re no fun at all! That\'s fine — I\'ll MAKE it fun! The grand finale starts NOW!',
        emotion: 'happy',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'At the carnival\'s heart, a figure dances through flames with reckless joy — laughing, always laughing, as the world burns around them.',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'A new audience member! Tell me, darling — what makes you laugh? What makes you SCREAM?',
        emotion: 'happy',
      },
      {
        speaker: 'yume',
        text: 'Neither. I want to know what made you this way. Jesters traditionally hid pain behind humor.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Jester of Ruin',
        text: '...Oh. You\'re one of THOSE. The kind who looks behind the mask. How tedious.',
        emotion: 'neutral',
      },
      {
        speaker: 'yume',
        text: 'The carnival is burning because you can\'t stop performing, even when there\'s no audience left.',
        emotion: 'sad',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'SHUT UP! The show never ends! It NEVER ENDS! Let me show you the finale — it\'s TO DIE FOR!',
        emotion: 'angry',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'The Jester of Ruin',
        text: 'The fire... it\'s going out. The show... is over?',
        emotion: 'surprised',
      },
      {
        speaker: 'rei',
        text: 'Show\'s over. Now — what\'s past the carnival? I can feel something massive ahead.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Jester of Ruin',
        text: 'The Rift Core. The source of everything. The Dreamer. And trust me, kid — they\'re not laughing.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'The Jester of Ruin',
        text: 'The flames... they\'re dimming. I can hear the silence. I don\'t... I don\'t like the silence.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'Silence isn\'t emptiness. It\'s rest. You\'ve earned it.',
        emotion: 'happy',
      },
      {
        speaker: 'The Jester of Ruin',
        text: '...The Dreamer is just ahead. At the Rift Core. They\'re the reason everything is falling apart. Or maybe... they\'re the reason everything was held together. I honestly can\'t tell anymore.',
        emotion: 'sad',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The carnival collapses into ash and silence. Beyond it, the dream itself fractures — revealing something breathtaking. The Rift Core.',
      },
      {
        speaker: 'narrator',
        text: 'Rei grips her sword. Whatever is at the center of all this — it ends here.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The embers settle. The silence stretches. And through the smoke, Yume sees it — a fracture in the sky so beautiful it makes her heart ache.',
      },
      {
        speaker: 'narrator',
        text: 'The Rift Core. The source. The answer to every question she has asked.',
      },
    ],
  },
};

// =============================================================================
// STAGE 6 — The Rift Core
// =============================================================================
// STUNNINGLY BEAUTIFUL. Crystalline fractures in the fabric of spacetime
// radiate outward from a central point. Aurora-like cascades of color pour
// through the cracks — violet, gold, cyan, rose. Geometric shards of frozen
// dream-matter float in a vast expanse, each one reflecting a different
// starfield. The beauty is overwhelming, heartbreaking, and stands in stark
// contrast to the intensity of what is about to happen.
//
// The Dreamer floats at the center — a being of light and shadow, neither fully
// nightmare nor fully dream. Their form shifts constantly. They have been here
// for a very, very long time.
// =============================================================================

const stage6: StageScript = {
  stageIntro: [
    {
      speaker: 'narrator',
      text: 'The Rift Core. Crystalline fractures in the fabric of spacetime radiate outward like a shattered stained-glass window — and through every crack, light pours in colors that have no names.',
    },
    {
      speaker: 'narrator',
      text: 'Aurora cascades of violet, gold, and cyan flow between floating geometric shards, each one reflecting a different starfield, a different sky, a different world that could have been.',
    },
    {
      speaker: 'narrator',
      text: 'At the center of it all, a figure floats — neither nightmare nor dream, wreathed in light and shadow that breathe in perfect, devastating rhythm. The Dreamer. And they have been waiting.',
    },
  ],

  midBossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'Before the Dreamer, the echoes of every guardian converge — Dream Sprite, Ink Phantom, Time Fragment, Doppelganger, Ring Master\'s Shadow — one final gauntlet.',
      },
      {
        speaker: 'rei',
        text: 'All of you again? Fine. I beat you once. I\'ll beat you faster this time.',
        emotion: 'angry',
      },
      {
        speaker: 'Dream Sprite',
        text: 'We\'re not trying to stop you! We\'re... we\'re trying to warn you!',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'Warn me? About what?',
        emotion: 'surprised',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The guardians of every stage materialize at once — not as enemies, but as a final chorus, their forms translucent and flickering.',
      },
      {
        speaker: 'Time Fragment',
        text: 'We... remember you. You showed us kindness. Now we must show you... the truth.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'The truth about the Dreamer?',
        emotion: 'neutral',
      },
      {
        speaker: 'Ink Phantom',
        text: 'The Dreamer is not evil. But they are breaking. We are their last defense. Forgive us.',
        emotion: 'sad',
      },
    ],
  },

  bossEncounter: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The gauntlet fades. The Dreamer descends — a being of fractured light, their form shifting between a thousand half-remembered faces. Their voice is the sound of every lullaby ever whispered.',
      },
      {
        speaker: 'The Dreamer',
        text: '...You came. After all this time. Someone actually came.',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'I came to stop you. The Rift is tearing the waking world apart. Nightmares are pouring through. People are suffering.',
        emotion: 'angry',
      },
      {
        speaker: 'The Dreamer',
        text: 'Suffering... yes. I know suffering. I have been alone in this place for so long that I forgot what another voice sounded like.',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'So you opened the Rift because you were lonely? You flooded the world with nightmares because you wanted COMPANY?',
        emotion: 'angry',
      },
      {
        speaker: 'The Dreamer',
        text: 'I didn\'t mean for the nightmares! I just wanted... someone. Anyone. I tried to reach out, and the dream twisted my longing into something monstrous.',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: '...I\'m sorry you were alone. I am. But I can\'t let you keep the Rift open. The cost is too high.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Dreamer',
        text: 'Then close it. Close it by force if you must. But please — don\'t forget that I was here. Don\'t let me disappear into silence again.',
        emotion: 'sad',
      },
      {
        speaker: 'rei',
        text: 'I won\'t forget. But I\'m not going to let you drown the world in nightmares, either. Draw your power — let\'s end this.',
        emotion: 'neutral',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The guardians dissolve into motes of light. The Dreamer drifts forward — a being of impossible beauty, their form rippling with the weight of every dream they have carried alone.',
      },
      {
        speaker: 'The Dreamer',
        text: '...You\'re the one who listened. At every stage, you listened. No one has listened to me in centuries.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'I\'m listening now. Tell me everything. Why did you open the Rift?',
        emotion: 'neutral',
      },
      {
        speaker: 'The Dreamer',
        text: 'I was once a guardian, like the others. I protected the dream world from nightmares. But they never stopped coming. Layer after layer, year after year. They seeped into me.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'You absorbed the nightmares to protect the dreamers... and it corrupted you.',
        emotion: 'sad',
      },
      {
        speaker: 'The Dreamer',
        text: 'I couldn\'t hold them anymore. The dream world was drowning. I opened the Rift because I needed the waking world\'s help — its light, its clarity. But instead... the nightmares found the opening first.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'You didn\'t mean for any of this. You were trying to save the dream world, and it overwhelmed you.',
        emotion: 'sad',
      },
      {
        speaker: 'The Dreamer',
        text: 'I\'m so tired, Yume. I\'ve been holding back an ocean of nightmares with bare hands. I can feel myself slipping. If I let go completely... the Rift will consume everything.',
        emotion: 'sad',
      },
      {
        speaker: 'yume',
        text: 'Then don\'t let go. Let me help you carry it. That\'s what I came here to do.',
        emotion: 'happy',
      },
      {
        speaker: 'The Dreamer',
        text: 'You would... share this burden? Even knowing what it costs? Then show me. Show me the strength that comes from kindness — and I will believe you.',
        emotion: 'surprised',
      },
    ],
  },

  bossDefeat: {
    rei: [
      {
        speaker: 'The Dreamer',
        text: 'You\'re strong... stronger than anyone who has ever come to this place. The Rift is closing. I can feel it.',
        emotion: 'neutral',
      },
      {
        speaker: 'rei',
        text: 'It\'s over. The nightmares will stop.',
        emotion: 'neutral',
      },
      {
        speaker: 'The Dreamer',
        text: 'And I... will be alone again. But that is the price. Thank you for coming, even if it was to defeat me. For a moment... I wasn\'t alone.',
        emotion: 'sad',
      },
    ],
    yume: [
      {
        speaker: 'The Dreamer',
        text: 'The nightmares... they\'re receding. You actually did it. You took part of the weight.',
        emotion: 'surprised',
      },
      {
        speaker: 'yume',
        text: 'I told you. You don\'t have to carry everything alone. Nobody should have to.',
        emotion: 'happy',
      },
      {
        speaker: 'The Dreamer',
        text: 'The Rift is closing. But this time... this time it doesn\'t feel like a prison. It feels like... healing.',
        emotion: 'happy',
      },
    ],
  },

  stageOutro: {
    rei: [
      {
        speaker: 'narrator',
        text: 'The crystalline fractures seal, one by one, each closure releasing a cascade of light that fades into gentle warmth. The Rift Core dims. The dream exhales.',
      },
    ],
    yume: [
      {
        speaker: 'narrator',
        text: 'The Rift closes not with violence but with a sigh — a long-held breath finally released. The aurora fades to soft dawn light, and the dream world, for the first time in ages, is still.',
      },
    ],
  },
};

// =============================================================================
// ENDINGS
// =============================================================================

export const ENDINGS = {
  rei: [
    {
      speaker: 'narrator',
      text: 'The Rift seals. The dream world shudders once, twice, and then — stillness. The nightmares that had flooded the waking world begin to dissolve like morning frost.',
    },
    {
      speaker: 'narrator',
      text: 'Rei stands at the threshold between worlds as the gateway narrows to a sliver of light.',
    },
    {
      speaker: 'rei',
      text: 'It\'s done. The Rift is closed. But...',
      emotion: 'neutral',
    },
    {
      speaker: 'rei',
      text: 'I keep thinking about the Dreamer. Alone in there, for who knows how long. Calling out and only getting nightmares as an answer.',
      emotion: 'sad',
    },
    {
      speaker: 'rei',
      text: 'I did what I had to do. The waking world is safe. But maybe... maybe next time someone hears a cry from the dream world, they should listen before they draw their sword.',
      emotion: 'neutral',
    },
    {
      speaker: 'narrator',
      text: 'The last fracture of light closes. Rei steps back into the waking world, dawn breaking over the horizon. The city is quiet. The nightmares are gone.',
    },
    {
      speaker: 'narrator',
      text: 'But sometimes, in the space between sleeping and waking, Rei swears she can still hear the Dreamer — not crying out, but humming. A lullaby. Distant and gentle.',
    },
    {
      speaker: 'narrator',
      text: 'Perhaps loneliness, once acknowledged, is the first step toward something else entirely.',
    },
  ] as DialogueLine[],

  yume: [
    {
      speaker: 'narrator',
      text: 'The Rift closes gently, like a wound finally allowed to heal. The nightmare tide recedes from the waking world, and the dream world breathes — truly breathes — for the first time in centuries.',
    },
    {
      speaker: 'The Dreamer',
      text: 'You could leave now. The way is open. You should leave.',
      emotion: 'neutral',
    },
    {
      speaker: 'yume',
      text: 'I could. But I promised to help you carry the weight. And I don\'t break promises.',
      emotion: 'happy',
    },
    {
      speaker: 'The Dreamer',
      text: 'You want to stay? In the dream world? But your life — your waking self—',
      emotion: 'surprised',
    },
    {
      speaker: 'yume',
      text: 'I\'m not staying forever. But I\'ll visit. The Rift is sealed, but that doesn\'t mean the door has to be locked. We can build a window.',
      emotion: 'happy',
    },
    {
      speaker: 'The Dreamer',
      text: '...A window. Between the dream and the waking world. So that neither side ever has to be completely alone.',
      emotion: 'happy',
    },
    {
      speaker: 'narrator',
      text: 'Yume steps through the closing Rift, back into the gentle light of morning. But she carries with her a small shard of dream-crystal — warm to the touch, pulsing with a light that matches her heartbeat.',
    },
    {
      speaker: 'narrator',
      text: 'In the nights that follow, the world\'s dreams grow kinder. Nightmares still come — they always will — but they are met now by a guardian who is no longer alone. And somewhere, in the space between sleeping and waking, a window glows softly.',
    },
  ] as DialogueLine[],
};

// =============================================================================
// Combined Script Export
// =============================================================================

export const SCRIPT: Record<number, StageScript> = {
  1: stage1,
  2: stage2,
  3: stage3,
  4: stage4,
  5: stage5,
  6: stage6,
};
