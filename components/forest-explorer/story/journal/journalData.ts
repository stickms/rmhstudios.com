import type { JournalEntryData } from '@/lib/forest-explorer/types';

export const journalEntries: JournalEntryData[] = [
    // ─── Act 1 ────────────────────────────────────────────────────────────────

    {
        id: 'act1_personal_intro',
        act: 'act1',
        category: 'personal',
        title: 'My First Night',
        content: 'The forest is different at night. The trees seem taller, the shadows deeper. I brought only a flashlight and a sense that something here wants to be found. The old stories say these woods remember — every footstep, every whisper. I intend to find out what they remember about me.',
        hintLevel: 0,
    },
    {
        id: 'act1_stone_lore',
        act: 'act1',
        category: 'lore',
        title: 'The Standing Stones',
        content: 'These stones predate any known settlement. The carvings on each face glow faintly when illuminated — not reflected light, but something from within the stone itself. The ancient builders arranged them in a circle, each stone bearing a unique rune. I\'ve noticed they pulse in sequence when the moonlight hits them just right.',
        hintLevel: 1,
        relatedPuzzleId: 'act1_rune_sequence',
    },
    {
        id: 'act1_star_map',
        act: 'act1',
        category: 'hint',
        title: 'The Tree of Life Constellation',
        content: 'An ancient tree between the stone circle and the clearing bears a carving of stars connected by lines — a constellation in the shape of a tree. A single root star at the bottom rises through a trunk to a branch point, splitting left and right with tips at each end and a crown star at the top. Seven lines connect eight bright stars. The stars above the clearing match this exact pattern — ignore the dim ones.',
        hintLevel: 2,
        relatedPuzzleId: 'act1_constellation',
    },
    {
        id: 'act1_shadow_legend',
        act: 'act1',
        category: 'lore',
        title: 'The Shadow Wall Legend',
        content: 'Local folklore speaks of a wall deep in the forest where shadows come alive at dusk. The ancients would place carved totems before it, casting shadows that told stories. "When the deer runs beside the river under a crescent moon, the wall opens its secrets." Perhaps the totems can still be arranged.',
        hintLevel: 1,
        relatedPuzzleId: 'act1_shadow_match',
    },
    {
        id: 'act1_ward_inscription',
        act: 'act1',
        category: 'hint',
        title: 'Gateway Ward Inscription',
        content: 'Etched into the pillar beside the arch: "Three circles guard the way. Turn the outer ring twice right. The middle ring turns five. The inner, once to the right." The symbols on each ring align with markers at the top of the arch.',
        hintLevel: 2,
        relatedPuzzleId: 'act1_ward_seal',
    },
    {
        id: 'act1_creature_tracks',
        act: 'act1',
        category: 'creature',
        title: 'Strange Footprints',
        content: 'Pressed into the soft earth — tracks unlike any animal I know. Three-toed, with a faint luminescent residue. They lead toward the stone circle and then simply... vanish. Whatever left these walks between the stones.',
        hintLevel: 0,
    },
    {
        id: 'act1_history_forest',
        act: 'act1',
        category: 'history',
        title: 'The Forest That Remembers',
        content: 'According to village records, this forest has stood for over a thousand years. Loggers who attempted to clear it in the 1800s reported their axes bouncing off trunks, their compasses spinning wildly. The forest was declared protected — not by any government, but by the unanimous agreement of everyone who entered it.',
        hintLevel: 0,
    },
    {
        id: 'act1_bioluminescence',
        act: 'act1',
        category: 'creature',
        title: 'Living Light',
        content: 'The mushrooms here produce their own light — a soft green glow that intensifies when I approach. They seem to cluster near the ancient landmarks, as if drawn to the same energy that powers the rune stones. Are they guides, or guardians?',
        hintLevel: 0,
    },
    {
        id: 'act1_landmark_stone_circle',
        act: 'act1',
        category: 'landmark',
        title: 'The Stone Circle',
        content: 'A ring of towering standing stones, each carved with runes that pulse faintly in the moonlight. The air here hums with a deep resonance, as if the stones are singing a song too low for human ears. At the center, the ground is worn smooth by countless feet — or perhaps by something else entirely. The ancients clearly gathered here for rituals of great importance.',
        hintLevel: 0,
    },
    {
        id: 'act1_landmark_gateway_arch',
        act: 'act1',
        category: 'landmark',
        title: 'The Gateway Arch',
        content: 'A massive stone archway, impossibly balanced, covered in ward symbols that glow with a faint amber light. Three concentric ring carvings frame the passage, each bearing strange symbols. A pillar beside the arch bears an inscription — the key to unlocking the ward seal. Beyond the arch, the forest grows darker and more restless.',
        hintLevel: 0,
    },

    // ─── Act 2 ────────────────────────────────────────────────────────────────

    {
        id: 'act2_intro',
        act: 'act2',
        category: 'personal',
        title: 'Beyond the Gate',
        content: 'The gateway led me deeper than I expected. The forest here is... wrong. Trees move when I\'m not looking. Paths that existed moments ago are gone. The air smells of copper and pine. I need to stay focused — the shifting is disorienting, but there must be a pattern.',
        hintLevel: 0,
    },
    {
        id: 'act2_wind_song',
        act: 'act2',
        category: 'hint',
        title: 'The Wind Hollow',
        content: 'Ancient pipes carved from hollow wood are embedded in this massive tree trunk. When the wind blows through them in the right configuration, the tree hums with a resonance that calms the surrounding forest. The pipes can be rotated to direct airflow from the source opening to the resonance chamber.',
        hintLevel: 1,
        relatedPuzzleId: 'act2_sound_pipe',
    },
    {
        id: 'act2_mirror_legend',
        act: 'act2',
        category: 'hint',
        title: 'Pool of Reflections',
        content: 'A still pool surrounded by polished stone surfaces. Moonlight enters from above and can be bounced between the mirrors. The inscription reads: "Truth is never direct. It bends, it reflects, it finds its way to those who arrange the path." The mirrors can be angled to redirect the beam.',
        hintLevel: 2,
        relatedPuzzleId: 'act2_reflection',
    },
    {
        id: 'act2_echo_lore',
        act: 'act2',
        category: 'lore',
        title: 'The Echo Chamber',
        content: 'A natural amphitheater where sounds don\'t behave normally. Clap once and you hear it three times — but each echo is different. The forest stores sounds like memories. The stones here each produce a unique tone when struck. I think the forest is trying to teach me a song.',
        hintLevel: 1,
        relatedPuzzleId: 'act2_memory_echo',
    },
    {
        id: 'act2_root_history',
        act: 'act2',
        category: 'history',
        title: 'The Root Network',
        content: 'Beneath the surface, every tree in this forest is connected by a vast root network. The ancients called it "The Root Mind" — a living neural network that passes information between trees. Some root paths glow when activated. I need to find the right connections from the central node to the gate.',
        hintLevel: 1,
        relatedPuzzleId: 'act2_root_network',
    },
    {
        id: 'act2_shifting_trees',
        act: 'act2',
        category: 'lore',
        title: 'The Shifting',
        content: 'It happened again. I solved a puzzle and the world went dark for just a moment. When the fog cleared, the trees had rearranged. New paths where there were walls, and walls where there were paths. The forest tests those who enter the deep wood.',
        hintLevel: 0,
    },

    // ─── Act 3 ────────────────────────────────────────────────────────────────

    {
        id: 'act3_intro',
        act: 'act3',
        category: 'personal',
        title: 'Dawn Approaches',
        content: 'The sky is lightening. After the chaos of the shifting canopy, this grove feels almost peaceful — except for the corruption. Purple tendrils twist through some trees, and the light here has an unnatural quality. But dawn is coming. I can feel the forest fighting to heal itself.',
        hintLevel: 0,
    },
    {
        id: 'act3_monument_lore',
        act: 'act3',
        category: 'hint',
        title: 'The Shattered Monument',
        content: 'Once a single piece, now scattered into fragments. The glyph it bore was a word of power — "Balance" in the old tongue. Reassembling it might push back the corruption. Each piece can be rotated and positioned. The cracks show where they connect.',
        hintLevel: 2,
        relatedPuzzleId: 'act3_corrupted_glyph',
    },
    {
        id: 'act3_final_star_map',
        act: 'act3',
        category: 'hint',
        title: 'The Last Constellation',
        content: 'As dawn approaches, the stars are fading. But one constellation remains visible — brighter than the rest, as if refusing to give way to the sun. "The Phoenix Rising," according to this astronomer\'s journal. "Connect its stars before dawn claims them, and rebirth follows."',
        hintLevel: 2,
        relatedPuzzleId: 'act3_constellation',
    },
    {
        id: 'act3_crystal_legend',
        act: 'act3',
        category: 'hint',
        title: 'Crystal Nexus',
        content: 'A cluster of prismatic crystals that split light into its component colors. The dawn light entering from the east can be guided through these prisms to the forest heart. The prisms add a twist — light changes color as it passes through them.',
        hintLevel: 1,
        relatedPuzzleId: 'act3_reflection',
    },
    {
        id: 'act3_heartwood_inscription',
        act: 'act3',
        category: 'hint',
        title: 'Heartwood Bark Scroll',
        content: 'Written in sap on ancient bark: "Four rings guard the heart. Each ring bears eight marks. The third mark on the first ring. The seventh on the second. The second on the third. The fifth on the last. When aligned, the heart awakens." The oldest tree in the forest holds the final seal.',
        hintLevel: 2,
        relatedPuzzleId: 'act3_ward_seal',
    },
    {
        id: 'act3_corruption',
        act: 'act3',
        category: 'lore',
        title: 'The Corruption',
        content: 'The purple corruption isn\'t disease — it\'s forgetting. The forest is losing its memories, its identity. Each puzzle solved restores a piece of what was lost. The bioluminescent mushrooms from Act 1, the echoes from Act 2 — they\'re all fragments of the forest\'s fading consciousness.',
        hintLevel: 0,
    },
    {
        id: 'act3_final_lore',
        act: 'act3',
        category: 'history',
        title: 'The Forest\'s Purpose',
        content: 'I understand now. The forest isn\'t just old — it\'s a living archive. Every stone, every tree, every mushroom holds a memory. The wards, the puzzles, the shifting — they\'re all tests to find someone who can help it remember. Someone who would take the time to listen.',
        hintLevel: 0,
    },
];

export function getEntriesByAct(act: import('@/lib/forest-explorer/types').ActId): JournalEntryData[] {
    return journalEntries.filter(e => e.act === act);
}

export function getEntryById(id: string): JournalEntryData | undefined {
    return journalEntries.find(e => e.id === id);
}
