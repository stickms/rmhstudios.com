import { DialogueNode } from './NarrativeStore';
import { useNarrativeStore } from './NarrativeStore';
import { useAchievementStore } from './AchievementStore';

// Helper to access stores inside effects (outside React)
const getStore = () => useNarrativeStore.getState();
const getAch = () => useAchievementStore.getState();

export const script: Record<string, DialogueNode> = {
    'intro_elara': {
        id: 'intro_elara',
        speaker: 'Elara',
        text: "You're finally awake. I wasn't sure the cryo-sickness would wear off. Do you remember your name?",
        choices: [
            { text: "Who are you?", nextId: 'intro_elara_2', effect: () => getAch().unlock('meet_elara') },
            { text: "Where am I?", nextId: 'intro_elara_location', effect: () => getAch().unlock('meet_elara') }
        ]
    },
    'intro_elara_2': {
        id: 'intro_elara_2',
        speaker: 'Elara',
        text: "I'm Elara. Maintenance Chief. Or what's left of maintenance. Look, we have to move. The shadows are getting restless.",
        choices: [
            { text: "Shadows?", nextId: 'intro_elara_shadows' },
            { text: "I'm ready.", nextId: 'intro_elara_end' }
        ]
    },
    'intro_elara_location': {
        id: 'intro_elara_location',
        speaker: 'Elara',
        text: "Outpost 13. Deep space mining rig. It... went dark three weeks ago. We're the cleanup crew.",
        choices: [
            { text: "What happened?", nextId: 'intro_elara_2' }
        ]
    },
    'intro_elara_shadows': {
        id: 'intro_elara_shadows',
        speaker: 'Elara',
        text: "They call them 'Echoes'. Glitches in reality. Don't let them touch you.",
        choices: [
            { text: "Understood.", nextId: 'intro_elara_end' }
        ]
    },
    'intro_elara_end': {
        id: 'intro_elara_end',
        speaker: 'Elara',
        text: "Here, take this pistol. It's not much, but it fires charged particles. Should hurt them.",
        choices: [
            { 
                text: "Take Weapon", 
                nextId: 'end_dialogue', 
                effect: () => {
                    getStore().setFlag('has_weapon', true);
                    getStore().endDialogue();
                    getAch().unlock('take_weapon');
                }
            }
        ]
    },
    // Interaction Nodes
    'examine_terminal': {
        id: 'examine_terminal',
        speaker: 'System',
        text: "ERROR: NEURAL LINK SEVERED. LAST LOGIN: 3 WEEKS AGO BY USER 'KAEL'.",
        choices: []
    }
};
