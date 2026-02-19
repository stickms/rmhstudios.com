This implementation plan is designed for an **Agentic AI Workflow** (e.g., Cursor Composer, Windsurf, or v0). It structures the game specifically for your **Next.js** environment (`rmhstudios.com`) and integrates your interests in **neuroscience/medical themes** (fitting the "RMH" lore) and **Balatro-style aesthetics**.

### **Project Title:** Vega (The RMH Loop Defense)

**Core Concept:** A "Chrono-Loop" Tower Defense where you defend a "Memory Core" against "Intrusive Thoughts." You play through the same 5-minute timeline multiple times. In Loop 2, your towers from Loop 1 are present as "Ghost Protocols," assisting you.

---

### **1. Art Direction & Vibe**

* **Style:** **"Clinical Glitch" / CRT Horror** (Inspired by *Balatro* & *Pony Island*).
* **Background:** Dark gray/black medical grid, flickering scanlines.
* **UI:** Minimalist, monospace fonts (e.g., 'Courier Prime'), green/amber terminal text.
* **Visuals:** 2D geometric shapes with heavy post-processing (chromatic aberration, noise).
* **Towers:** Look like medical equipment or neural synapses.
* **Enemies:** Glitchy, amorphous blobs or sharp, jagged "spikes" representing anxiety/trauma.



### **2. Technical Architecture (Next.js)**

* **Framework:** Next.js (App Router).
* **Rendering:** HTML5 Canvas (via `useRef`) for performance, or `React-Three-Fiber` (drei) if you want 2.5D, but **pure Canvas 2D** is best for the "thousands of enemies" loop mechanic.
* **State Management:** `Zustand` (cleaner for game loops than Redux).
* **Database:** Supabase/PostgreSQL (to save high scores or "Global Trauma" metrics).

---

### **3. Game Design Document (GDD)**

#### **A. Mechanics: The Loop System**

The game consists of **3 Loops** of the same **5-minute timeline**.

1. **Loop 1 (The Trauma):** You defend normally with limited resources.
2. **Loop 2 (The Therapy):** The game resets to T=0:00. Your towers from Loop 1 appear as **"Ghost Structures"**. They shoot and deal damage but cannot be moved or sold. You build *new* towers to cover the gaps you missed in Loop 1.
3. **Loop 3 (The Breakthrough):** Final loop. Loop 1 and Loop 2 towers are both present. The enemy waves are now massive (combination of Wave 1 + Wave 2 patterns).

#### **B. Controls**

* **Mouse:** Left-click to select/place. Right-click to cancel.
* **Keyboard:**
* `1-4`: Select Tower Type.
* `Space`: Pause/Play (Slow motion effect).
* `R`: Trigger "Recall" (Active Ability).



#### **C. Resources**

* **Focus (Money):** Earned by destroying Intrusive Thoughts.
* **Sanity (Lives):** Starts at 100%. Leaks when enemies hit the Core.
* **Neuroplasticity (Upgrade Points):** Earned between loops to upgrade base stats.

#### **D. Towers (The "Cognitive Defenses")**

1. **The Synapse (Basic):**
* *Function:* Rapid fire, low damage.
* *Visual:* A neuron firing sparks.


2. **The Suppressor (Slow/CC):**
* *Function:* Sprays a chemical mist that slows enemies.
* *Visual:* An IV drip bag pulsing blue.


3. **The Lobotomizer (Sniper):**
* *Function:* High damage, long cooldown, infinite range.
* *Visual:* A surgical laser.


4. **The Echo (Buffer):**
* *Function:* Doesn't shoot. Boosts fire rate of nearby towers (including Ghost Towers from previous loops).
* *Visual:* A spinning tape reel.



#### **E. Enemies (The "Intrusions")**

1. **Anxiety Sprites:** Fast, weak, swarm in erratic patterns.
2. **Depression Hulks:** Slow, massive health, ignore "Slow" effects.
3. **Manic Spikes:** Move instantly between points (teleportation), require AoE damage.

---

### **4. Agentic AI Implementation Plan**

Copy and paste these prompts sequentially into your AI coding tool (Cursor/Windsurf).

#### **Phase 1: The Engine & Loop Recorder**

> "Create a Next.js component called `GameCanvas`. Setup a basic game loop using `requestAnimationFrame`.
> **The Core Requirement:** Implement a 'TimeManager' class. This class must record every player action (TowerPlacement) with a timestamp relative to the start of the game.
> When the game resets (Phase 2), the TimeManager must be able to 'replay' these actions. Create a simple 'Red Square' tower that shoots a 'Yellow Dot' at a 'Blue Circle' enemy moving from left to right. When I click 'Reset', the game should restart, but a 'Ghost' version of the tower I placed should appear automatically at the correct timestamp."

#### **Phase 2: The Grid & Pathfinding**

> "Implement a grid-based placement system on the Canvas.
> 1. Use A* (A-Star) pathfinding. Enemies spawn at specific 'Entry Nodes' and move to the 'Core'.
> 2. When a user places a tower, update the grid to be 'blocked'.
> 3. **Critical:** If a Ghost Tower from a previous loop blocks the path in the *current* loop, the enemies must re-route. If the path is fully blocked, the tower placement should be invalid."
> 
> 

#### **Phase 3: Visuals & "RMH" Aesthetics**

> "Refine the rendering. Use the HTML5 Canvas API.
> 1. Apply a CRT scanline effect over the entire canvas (draw thin semi-transparent lines every 2 pixels).
> 2. Use a color palette: Background #0a0a0a, Grid #1a1a1a, Towers #00ff41 (Matrix Green), Enemies #ff0055 (Glitch Red).
> 3. Add a 'Glitch' effect: Every few seconds, random hitboxes should shift slightly in x/y for 1 frame to simulate signal corruption."
> 
> 

#### **Phase 4: Game Logic Integration**

> "Create the `Tower` and `Enemy` classes.
> * **Tower:** Needs `range`, `fireRate`, `damage`, `cooldown`.
> * **Enemy:** Needs `speed`, `health`, `pathIndex`.
> * **Wave Manager:** Script a 60-second wave.
> * 0-10s: Spawn Enemy Type A every 1s.
> * 10-30s: Spawn Enemy Type B every 2s.
> * Save this wave config in a JSON object so we can scale it for Loop 2 and Loop 3."
> 
> 
> 
> 

#### **Phase 5: The "Paradox" System (Advanced)**

> "Implement a 'Paradox' check.
> If the player in Loop 2 places a tower in the *exact same spot* as a tower from Loop 1, the two towers merge into a 'Paradox Tower' which has 2x stats and a corrupted visual sprite. Add a screen shake effect when this happens."

### **5. Next Steps for You**

1. **Repository Setup:** Initialize your Next.js repo if you haven't.
2. **Asset Generation:** Do you want to generate the 2D sprites (Towers/Enemies) using an image generator, or should the AI write code to draw them procedurally (using shapes)?
* *Procedural is faster for prototyping and fits the "Glitch" style better.*


3. **Deployment:** Create a specific route `/projects/recursion` on `rmhstudios.com`.

**Would you like me to generate the actual React component code for "Phase 1: The Engine" to get you started?**
