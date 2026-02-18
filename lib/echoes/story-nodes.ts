import { StoryNode } from './types';

export const STORY_NODES: Record<string, StoryNode> = {
  'root': {
    id: 'root',
    title: 'The Awakening',
    type: 'memory',
    content: "You open your eyes. The world is... fragmented. Shards of reality float in a void of static. You remember nothing, but you feel a hunger. A hunger for *coherence*.",
    cost: 0,
    entropy: 0,
    requirements: [],
    choices: [
      {
        id: 'c1',
        text: 'Reach out to the static',
        nextNodeId: 'static_void',
        cost: 0
      },
      {
        id: 'c2',
        text: 'Focus on your breathing',
        nextNodeId: 'inner_calm',
        cost: 0
      }
    ]
  },
  'static_void': {
    id: 'static_void',
    title: 'The Static',
    type: 'void',
    content: "The static burns your fingertips. It's cold and hot at the same time. You hear a whisper... or is it just noise? You gain a glimpse of something dark.",
    cost: 0,
    entropy: 10,
    requirements: ['root'],
    choices: [
      {
        id: 'c3',
        text: 'Pull back',
        nextNodeId: 'root',
        cost: 0
      },
      {
        id: 'c4',
        text: 'Dive deeper (Cost: 10 Memories)',
        nextNodeId: 'deep_void',
        cost: 10
      }
    ]
  },
  'inner_calm': {
    id: 'inner_calm',
    title: 'The Firewall',
    type: 'puzzle',
    content: "A barrier blocks your path. It's a security protocol from an old world. Decrypt the signal to proceed.",
    cost: 0,
    entropy: -5,
    requirements: ['root'],
    puzzleConfig: {
        type: 'cipher',
        data: { word: 'MEMORY' },
        reward: 50
    },
    choices: [
      {
        id: 'c5',
        text: 'Access the deeper network',
        nextNodeId: 'core_uplink',
        cost: 0
      }
    ]
  },
  'core_uplink': {
    id: 'core_uplink',
    title: 'Core Uplink',
    type: 'puzzle',
    content: "You've breached the firewall. Now, synchronize with the core frequency to stabilize the reality anchor.",
    cost: 0,
    entropy: -10,
    requirements: ['inner_calm'],
    puzzleConfig: {
        type: 'sequence',
        data: { sequence: [0, 2, 1, 3, 0] },
        reward: 100
    },
    choices: [
      {
        id: 'c6',
        text: 'Stabilize Reality',
        nextNodeId: 'root', // Loop back or ending
        cost: 0,
        effect: (state) => state.decreaseEntropy(20)
      }
    ]
  },
  'deep_void': {
    id: 'deep_void',
    title: 'The Deep Void',
    type: 'ending',
    content: "You went too far. The static consumes you. There is no memory here, only oblivion.",
    cost: 0,
    entropy: 100, // Insta-kill
    requirements: ['static_void'],
    choices: []
  }
};
