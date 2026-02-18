This is a comprehensive **Architecture & Implementation Master Plan** designed specifically for you to feed into Antigravity (your AI coding assistant).

It breaks the development of **"Echoes: Reforged"** down into modular, logical steps. This plan assumes a **Next.js (Frontend/UI)** + **Phaser 3 (Game Engine)** hybrid architecture.

---

# 1. Architectural Blueprint

Before coding, Antigravity needs to understand the "Brain" of the application.

### The Hybrid Stack

* **The Game Loop (Phaser 3):** Handles 60FPS rendering, physics (Arcade Physics), collision detection, enemy spawning, and bullet hell mechanics.
* **The UI Layer (React/Next.js):** Handles the HUD (Heads Up Display), Evolution Selection Screens, Inventory, Pause Menus, and Metagame persistence.
* **The Bridge (Zustand):** A state management store that syncs data between the two.
* *Example:* Player gets hit in Phaser  Updates `hp` in Zustand  React Health Bar updates.



---

# 2. Detailed Implementation Walkthrough

Feed these phases to Antigravity one by one to avoid context overload.

## Phase 1: The Engine Scaffold (The "Void")

**Goal:** Initialize a hardware-accelerated 2D canvas inside Next.js that handles window resizing and asset loading.

1. **Dynamic Import:** Since Next.js is server-side rendered (SSR) and Phaser requires the `window` object, instruct Antigravity to create a `GameComponent` that uses `next/dynamic` with `ssr: false`.
2. **Scene Setup:** Create three distinct Scenes:
* `BootScene`: Loads assets (sprites, audio).
* `MenuScene`: The start screen.
* `DungeonScene`: The main gameplay loop.


3. **The Asset Loader:** Set up a system to load "placeholder" assets programmatically (drawing colored rectangles/circles via `graphics`) so you can test gameplay immediately without waiting for art files.

## Phase 2: The "Risk of Rain" Controller (Movement & Combat)

**Goal:** Create the tight, fast-paced game feel.

1. **Player Prefab:** Create a `Player.js` class extending `Phaser.Physics.Arcade.Sprite`.
2. **Input Handling:**
* **WASD:** Apply **Velocity** (Acceleration/Drag), not direct coordinate manipulation. This gives the movement "weight."
* **Mouse Aim:** The player sprite must calculate the angle between itself and the mouse pointer (`Phaser.Math.Angle.Between`) and rotate accordingly.


3. **The Shooting Mechanic:**
* Create a `ProjectileGroup` (Object Pooling). This is crucial for performance. Instead of creating/destroying bullets, recycle them.
* **Fire Rate:** Implement a `lastFired` timestamp to control attack speed.
* **Recoil:** Apply a small reverse velocity to the player when shooting for tactile feedback.



## Phase 3: The "Binding of Isaac" World (Procedural Generation)

**Goal:** Generate a grid-based dungeon with distinct rooms.

1. **The Grid System:**
* Define a global grid (e.g., 10x10).
* Implement a **Random Walker Algorithm**. It starts at [5,5], takes X steps in random cardinal directions, and marks those grids as "Active Rooms."


2. **Room Templates:**
* Create a generic `Room` class.
* **Walls:** Automate wall placement on the boundaries of the screen (colliders).
* **Doors:** Logic to check neighbors. If `Grid[x+1][y]` exists, place a "Door" object on the East wall.


3. **Camera Transitions:**
* When Player touches a Door  Pause Physics  Pan Camera to next grid coordinate  Resume Physics.



## Phase 4: The "Pokémon" Evolution System

**Goal:** The core hook. Dynamic character mutation.

1. **The Genome Structure:**
* Instruct Antigravity to create a `EvolutionConfig` object.
* **Base Form:** "Echo" (Balanced).
* **Tier 1 Evolutions:**
* *Type A (Tank):* "Goliath" - Scale sprite 1.5x, Speed -20%, HP +100%, Weapon: Shotgun.
* *Type B (Rogue):* "Wraith" - Scale sprite 0.8x, Speed +40%, HP -20%, Weapon: Piercing Railgun.




2. **The XP Loop:**
* Enemies drop "Data Shards" (XP).
* When XP fills: Pause Game (Phaser)  Open Modal (React).


3. **The Hot-Swap Logic:**
* Upon selecting an evolution in React, pass the ID back to Phaser.
* The `Player` class must have a `morph(evolutionId)` method that:
* Destroys the old sprite texture.
* Applies the new texture.
* Updates physics body size (hitbox).
* Swaps the weapon logic.





## Phase 5: The "Entropy" Difficulty Director

**Goal:** Scaling difficulty like *Risk of Rain*.

1. **The Director:** A background class that doesn't render anything.
2. **The Credits System:**
* The Director receives "Credits" every second.
* Credits increase based on the **Entropy Meter** (Time played).
* Spawning an enemy costs credits.
* *Early Game:* Director has 10 credits (Spawns 5 weak enemies).
* *Late Game:* Director has 1000 credits (Spawns 2 Bosses + 20 weak enemies).


3. **The Mob Spawner:** Logic to spawn enemies *off-screen* or at specific "Vents" within the current room so they don't pop in on top of the player.

---

# 3. Prompt Chain for Antigravity

Copy-paste these blocks sequentially to your assistant to build the game.

### Prompt 1: The Setup

> "Initialize a Next.js project with TypeScript. Set up a directory structure for a game called 'Echoes'. I need a component `GameCanvas.tsx` that dynamically imports `phaser` (no SSR). Create a custom Hook `useGameStore` using Zustand to manage: `playerHealth`, `currentLevel`, `evolutionStage`, and `entropyLevel`."

### Prompt 2: The Player & Physics

> "Create a Phaser Scene called `MainScene`. Inside it, implement a Player class using Arcade Physics.
> 1. Use WASD for movement with acceleration/drag physics (so it feels slippery/smooth).
> 2. Make the player sprite rotate to face the mouse cursor.
> 3. Implement a shooting mechanic: Left Click fires a projectile towards the mouse. Use an Object Pool for bullets to optimize performance."
> 
> 

### Prompt 3: The Map Generation

> "Implement a 'RoomManager' class. It should use a Random Walker algorithm to generate a layout of 8-12 linked rooms on a grid.
> 1. Each room is one screen size (1280x720).
> 2. Auto-generate wall colliders around the edges.
> 3. Place 'Door' triggers. When the player hits a door, slide the camera to the next room."
> 
> 

### Prompt 4: The Evolution System

> "Create a `EvolutionManager`. Define a config object with 3 distinct forms (Base, Heavy, Fast).
> 1. Track XP. When XP hits 100, emit a 'LEVEL_UP' event to the Zustand store.
> 2. In the React layer, create a generic Modal that listens for 'LEVEL_UP' and displays 3 cards.
> 3. When a card is clicked, fire a function in Phaser that changes the Player's stats (speed, fire rate) and changes their color/tint to represent the new form."
> 
> 

### Prompt 5: The Entropy & Enemies

> "Create an `EnemyDirector` class.
> 1. It runs a timer. Every minute, the 'Entropy' multiplier increases by 0.5x.
> 2. Spawn enemies (Red Squares) that follow the player.
> 3. Enemy Health and Damage = Base * Entropy Multiplier.
> 4. Ensure enemies only spawn in the active room, not in the whole dungeon at once."
> 
> 

---

# 4. Critical Logic for Antigravity to Know

* **Collision Layers:** Tell Antigravity to use Phaser's `Collision Bitmasks`. Player Bullets should hit Enemies, but not other Player Bullets. Enemy Bullets should hit Player, but not other Enemies.
* **State Sync:** Do not update React every frame (60 times a second). Only update React on *events* (Damage taken, Level up, Room change) to prevent lag.
* **Resiliency:** Ensure the `GameCanvas` handles cleanup (`game.destroy(true)`) on unmount, or you will have multiple game instances running in the background while coding hot-reloads.
