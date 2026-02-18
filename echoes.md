Here is a comprehensive project plan tailored for an AI coding assistant (like Antigravity) to implement the game "Echoes" into an existing Next.js application.

This plan focuses on a web-based React implementation using **Next.js**, **Tailwind CSS**, and **Framer Motion** for the visual effects.

---

# Project Echoes: Game Implementation Plan

## 1. Project Overview & Tech Stack

**Objective:** Create a browser-based, narrative puzzle game titled "Echoes" where players manage "Memory" resources to navigate a non-linear story graph while fighting against a decaying "Entropy" mechanic.

**Stack:**

* **Framework:** Next.js (App Router preferred)
* **Language:** TypeScript
* **State Management:** Zustand (for lightweight, reactive game state)
* **Styling:** Tailwind CSS + CSS Modules (for specific glitch effects)
* **Animation:** Framer Motion (for "void" effects and transitions)
* **Audio:** Howler.js (for adaptive audio landscapes)
* **Persistence:** LocalStorage (for saving progress/timelines)

---

## 2. Core Data Structures (TypeScript Interfaces)

*Ask Antigravity to define these types first in `src/types/echoes.d.ts`.*

```typescript
// The Node Graph System for Non-Linear Storytelling
export type NodeType = 'memory' | 'puzzle' | 'void' | 'ending';

export interface StoryNode {
  id: string;
  title: string;
  content: string; // Markdown or Text
  type: NodeType;
  cost: number; // Memory cost to unlock
  entropy: number; // How much this node contributes to entropy
  requirements: string[]; // IDs of nodes that must be unlocked first
  choices: Choice[];
}

export interface Choice {
  id: string;
  text: string;
  nextNodeId: string;
  cost?: number;
  effect?: (state: GameState) => void; // e.g., 'restore_memory'
}

export interface GameState {
  memories: number; // The currency
  entropy: number; // The decay meter (0-100)
  unlockedNodes: string[]; // History of visited nodes
  currentTimeline: string; // Tracking the "branch" the player is on
  isGameOver: boolean;
}

```

---

## 3. Implementation Phases

### Phase 1: Game State Management (Zustand Store)

**File:** `src/store/useEchoesStore.ts`

**Logic to Implement:**

1. **Memory Currency:** Actions to `spendMemory(amount)` and `gainMemory(amount)`.
2. **Entropy Ticker:** A `useEffect` loop that increments `entropy` slowly over time (simulating the "void dissolving everything").
* *Mechanic:* If Entropy reaches 100%, the game ends (Game Over screen).
* *Mechanic:* Solving puzzles reduces Entropy.


3. **Timeline Tracking:** Methods to `unlockNode(id)` and validate if a player has the required `memories` to proceed.

### Phase 2: The Narrative Engine (Data Layer)

**File:** `src/data/story-nodes.ts`

Create a JSON/Object graph representing the "Fragmented Reality."

* **Root Node:** "The Awakening" (Free cost).
* **Branching Paths:**
* *Path A:* High memory cost, reveals lore about the "Void."
* *Path B:* High puzzle difficulty, rewards high memory currency.


* **The Void:** Randomly lock previously visited nodes (make them inaccessible) if Entropy gets too high.

### Phase 3: UI Components

#### A. The Game Container (HUD)

**File:** `src/components/echoes/GameInterface.tsx`

* **Layout:** A dashboard style view.
* **Top Bar:**
* **Memory Counter:** Displayed as glowing text (Currency).
* **Entropy Meter:** A progress bar that pulses purple/red as it fills.


* **Main View:** Renders the `CurrentNode`.

#### B. The Node Viewer (Card Component)

**File:** `src/components/echoes/NodeCard.tsx`

* **Visual Style:** Dark glassmorphism (backdrop-blur), neon purple borders (`border-purple-500`), and glitch text effects.
* **Interaction:**
* Display narrative text.
* Render `ChoiceButtons`.
* **Puzzle Component:** If the node is a 'puzzle', render a mini-game (e.g., pattern matching or cipher text) that must be solved to unlock the `Choice` buttons.



#### C. The Void Effect (Overlay)

**File:** `src/components/echoes/VoidOverlay.tsx`

* **Visuals:** A Framer Motion component that overlays the screen with "static" or "fog" based on the current `Entropy` level.
* **Logic:** As `entropy` increases, `opacity` of the overlay increases, making the text harder to read.

### Phase 4: Audio System (Adaptive Landscapes)

**File:** `src/hooks/useAdaptiveAudio.ts`

**Logic:**

1. **Base Layer:** Deep, ambient drone (Space/Sci-fi).
2. **Entropy Layer:** High-pitched, dissonant strings or static that fades in as `entropy` rises > 50%.
3. **Memory Layer:** Melodic chimes when `memories` are gained.

* *Implementation:* Use `Howler` to crossfade between tracks based on store state.

---

## 4. Prompting Guide for Antigravity

*Copy and paste these specific prompts into your AI coding assistant to build the modules one by one.*

**Prompt 1 (Setup & Types):**

> "Create a TypeScript definitions file `src/types/echoes.d.ts` for a narrative game. I need interfaces for StoryNode, Choice, and GameState. The game involves 'memories' as currency and an 'entropy' meter. Also, set up a basic Zustand store in `src/store/useEchoesStore.ts` to manage these values."

**Prompt 2 (The Story Data):**

> "Generate a mock data file `src/data/echoes-narrative.ts` with 5 linked story nodes. Include branching paths where choices cost 'memories'. The theme is a sci-fi fragmented reality."

**Prompt 3 (The Component Shell):**

> "Build a `GameInterface` component using Tailwind CSS. It should have a dark theme (black background), a HUD showing 'Memories' and an 'Entropy' bar at the top, and a main content area. Use a neon purple accent color (#a855f7)."

**Prompt 4 (Game Logic - The Entropy Mechanic):**

> "Update the Zustand store to include a game loop. Every 1 second, increase 'Entropy' by 1. If 'Entropy' hits 100, set a 'isGameOver' flag. Create a hook `useEntropy` that manages this timer."

**Prompt 5 (The Landing Modal - From Image):**

> "Create a 'AboutEchoes' modal component that matches the attached image style. Dark background, purple glow border, 'About the Game' header in purple, description text, and a 'Wishlist on Steam' button at the bottom."

---

## 5. Visual Style Guide (Tailwind Config)

To match the uploaded image, ensure your `tailwind.config.js` includes:

```javascript
theme: {
  extend: {
    colors: {
      void: '#0a0a0a',
      neon: '#bf00ff', // The purple from the image
      'neon-glow': '#d8b4fe',
    },
    boxShadow: {
      'neon': '0 0 10px #bf00ff, 0 0 20px #bf00ff',
    },
    animation: {
      'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    }
  }
}

```
