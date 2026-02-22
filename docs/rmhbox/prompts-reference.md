I want to add a real-time multiplayer party game / minigame "game" called "RMHbox" (a play on Jackbox Games) to the website, utilizing the websocket server and server-side logic for authoritative state. This game will be put on the "/rmhbox" route of the website. Use "/rmhbox/" where applicable for file organization relevant to this game. The file structure should mimic the other games, as detailed in docs/codebase-overview.md.

The game should be gated behind the usual auth gate, and it should implement a public/private lobby system with host controls. The host should be able to select a minigame to play, or put it up to a vote. 

Specify a preloading state for each minigame. The server should not transition the lobby state from instructions to gameplay until all connected clients have emitted a READY_TO_RENDER event (to check for all necessary preloaded assets, for example) ensuring a synchronized start for all players regardless of hardware.

Include a spectator mode in the spec. Spectators should receive the game state but have their input capabilities stripped. This is crucial for the "Jackbox" feel where people can watch the chaos even if they aren't playing.

The UI design language should lean minimalist but somewhat cutesy and casual, and  should be somewhat consistent across games. Furthermore, all games should be made to be mobile-friendly. Use mobile-first development principles.

Code design should be as modular as possible, (reusable UI components, having a minigame class that all minigames inherit from or using functional mixins with a unified lifecycle, for example). Avoid hardcoding and magic formulas as much as possible, for both game logic and component design.

When designing the websocket communication structure, we want to avoid sending entire game states as much as possible to minimize latency and increase responsiveness and syncing, though it may be necessary to do so every so often to ensure any internet issues don't persist long. Never send a player's client any information via websocket that they shouldn't have, to prevent hacks and cheats.

The design must include a reconnection protocol. If a user's socket ID changes but their auth session remains valid, the server should recognize them, map them back to their existing player slot in the lobby, and send a state snapshot to catch them up immediately.

Explicitly define a JSON patch or action-based state synchronization model. Instead of syncing the state object, the server should broadcast actions (state deltas) (e.g., PLAYER_MOVE, VOTE_SUBMITTED) which the clients then use to update their local stores. Specify how the  "full state sync" (the heartbeat) will resolve conflicts between the client's projected state and the server’s authoritative state.

Implement a persistent leaderboard system utilizing our database. The design must include a schema for global stats and game-specific stats that tracks player wins, total points, etc. Additionally, for games where this makes sense, include a way to store game history/logs server-side for later reviewing by players. Specify the logic for the match-end lifecycle where the server-side authoritative state is sanitized and committed to the database. Ensure this process is asynchronous to avoid blocking the WebSocket loop. The spec should also detail a leaderboard API (or WebSocket event) that allows the client to fetch and display all-time and weekly rankings on the main landing page and during the post-game results screen.

Read through the minigame descriptions in /docs/rmhbox/minigame-ideas.md, and then write up a design spec document for the core infrastructure, lobby logic, apis, etc. in /docs/rmhbox/design-spec-core.md, then game-specific details in /docs/rmhbox/design-spec-minigames.md. Be very thorough, specific, and detailed. Make sure to carefully consider all aspects of the mechanics, server logic, state manipulation, and communication. Leave no detail unmentioned. Make sure to detail all types and data schemas.

When designing the tech stack and specific game mechanics, prioritize the use of established NPM packages rather than writing complex logic from scratch. For example, use specialized libraries for rhyming dictionaries (e.g., rhyming-part), physics engines for cursor/pixel games (e.g., matter-js or p2.js), and state-diffing utilities (e.g., rfc6902 for JSON patches). Brainstorm and suggest the most performant, well-maintained packages for each minigame's specific needs in the design-spec-minigames.md.

Define a ready-up system for the lobbies, and join-in-progress logic for each game: can a spectator become a player mid-game if a slot opens up, or are they locked into spectating until the next round?

Be very careful and design robust error-handling. We do not want to crash the entire websocket server if a particular game has errors, nor do we want to nuke the lobbies on accident.















I want to add a real-time multiplayer party game / minigame "game" called "RMHbox" (a play on Jackbox Games) to the website, utilizing the websocket server and server-side logic for authoritative state. This game will be put on the "/rmhbox" route of the website. Use "/rmhbox/" where applicable for file organization relevant to this game. The file structure should mimic the other games, as detailed in docs/codebase-overview.md.

The game should be gated behind the usual auth gate, and it should implement a public/private lobby system with host controls. The host should be able to select a minigame to play, or put it up to a vote.

The core infrastructure, lobby logic, and general API architecture have already been designed and documented in /docs/rmhbox/design-spec-core.md. You must read and strictly adhere to the standards, state-masking protocols, and communication structures defined in that document.

Your task is to utilize the core spec and the brief descriptions in /docs/rmhbox/minigame-ideas.md to generate highly detailed, technical design specs for each specific minigame. You will split these specs into four separate files:

/docs/rmhbox/minigames-1.md: Rhyme Time, Undercover Agent, Category Crash, Wiki-Race
/docs/rmhbox/minigames-2.md: Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema
/docs/rmhbox/minigames-3.md: Sequence Sam, Human Keyboard, Cursor Curling, Human Tetris
/docs/rmhbox/minigames-4.md: Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul

For each minigame in these files, you must provide at least:
Detailed Game Mechanics: Specific rules, win conditions, and timing.
Server-Side State Schema: A full breakdown of the game-specific state and how it is manipulated.
WebSocket Event Map: Specific actions (deltas) and events relevant only to that game.
Information Masking: Detailed rules on what data is withheld from specific players (e.g., secret roles).
Join-in-Progress Logic: Specifics on if/how a spectator can fill an empty slot mid-game.
Do not let this list of requirements restrict your thinking. Include any additional details as necessary or as detailed in the core spec.

Third-Party Integration: Brainstorm and suggest the most performant, well-maintained NPM packages for the specific game's needs (e.g., rhyming-part for Rhyme Time or matter-js for physics games like Cursor Curling).

The UI design language should lean minimalist but somewhat cutesy and casual, and should be consistent across games. All games must be mobile-friendly, using mobile-first development principles and modular code design (reusable UI components, inheriting from the base Minigame class defined in the core spec).

Avoid hardcoding and magic formulas. Be very thorough, specific, and detailed. Leave no detail unmentioned regarding mechanics, server logic, state manipulation, and communication.

Code design should be as modular as possible, (reusable UI components, having a minigame class that all minigames inherit from or using functional mixins with a unified lifecycle, for example). Avoid hardcoding and magic formulas as much as possible, in both client/server logic and UI components.













I want to avoid muddying up the existing websocket server's code with the intense amount of new logic for rmhbox, so we are moving to a separate process and separate websocket server.

Give detailed architecture and implementation details for a new WebSocket server that listens for upgrades on ws://rmhstudios.com/rmhbox, running internally on port 7676. Place the files in the /server/rmhbox/ directory. Consider all code logic and all possible code logic, safety considerations, etc. Use relevant packages when it makes sense.

Detail how to update the package.json scripts to add a "rmhbox-server" script and allow the server to start up in dev and prod environments correctly. Similarly we need to update deploy.sh to correctly start up and tear down the server.

Avoid hardcoding and magic formulas. Be very thorough, specific, and detailed. Leave no detail unmentioned regarding mechanics, server logic, state manipulation, and communication.

Code design should be as modular as possible, (reusable UI components, having a minigame class that all minigames inherit from or using functional mixins with a unified lifecycle, for example). Avoid hardcoding and magic formulas as much as possible, in both client/server logic and UI components.

Read through docs/rmhbox/design-spec/core.md and adjust all the relevant details to add all of the above details.
















I want you to write up checklist-based comprehensive implementation plans for RMHbox in accordance with the design docs in the /docs/rmhbox/design-spec/ directory. This should take the form of 8 phases:

For phases 1-4, split the core logic and common APIs (lobby system, database schemas, WebSocket protocols, reconnection handlers, and state-masking utilities, etc.) detailed in /docs/rmhbox/design-spec/core.md into 4 relatively even-sized and mostly self-contained phases consisting of tasks. Every task must include a 'Verification' step to ensure the logic is functional before moving to the next phase. Parts of the RMHbox WebSocket server code are already implemented, but ignore these and outline the implementation details anyways so that we can check all the existing code and verify its details correctly.

For phases 5-8, implement the minigames in sets of 4. Make sure to include full details for each minigame in the plan. Each minigame plan must specify the necessary WebSocket events, specific NPM packages to be installed, and the unique State Schema required for that game.

Phase 5 (/docs/design-spec/minigames-1.md): Rhyme Time, Undercover Agent, Category Crash, Wiki-Race
Phase 6 (/docs/design-spec/minigames-2.md): Fact or Friction, Undercover Editor, Minimalist Masterpiece, Emoji Cinema
Phase 7 (/docs/design-spec/minigames-3.md): Sequence Sam, Human Keyboard, Cursor Curling, Human Tetris
Phase 8 (/docs/design-spec/minigames-4.md): Identity Crisis, Ranking File, Pixel Pushers, Scroll Soul

Detail the implementation plan for all in /docs/rmhbox/implementation/phase-1.md, ..., /docs/rmhbox/implementation/phase-8.md.

Do not miss any details mentioned in the design specs (cross-reference as needed), and adhere to the system design and code quality principles as much as possible. Avoid 'Shortcut' implementations; if a game requires physics (like Cursor Curling), the plan must include the setup of the physics engine (e.g., Matter.js) and its integration into the server's update tick.

Code design should be as modular as possible, (reusable UI components, having a minigame class that all minigames inherit from or using functional mixins with a unified lifecycle, for example). Avoid hardcoding and magic formulas as much as possible, in both client/server logic and UI components.

Every phase must be broken down into highly granular tasks and subtasks, each with complete details. A task should never be as broad as just "Implement Lobby Logic"; instead, it must be subdivided into steps like "Create Room Code generator utility," "Implement 'Join Room' socket handler," and "Write 'Player Ready' toggle logic," all with specific implementation details.



















Current phase is PHASE 1.

Read through /docs/rmhbox/design-spec/core.md (for phases 1-4) and/or /docs/rmhbox/design-spec/minigames-[1-4].md (for phases 5-8) and /docs/rmhbox/implementation/phase-[#].md.

Review the code implemented in all previous phases to ensure compatibility and consistent naming conventions. If you detect a structural error in previous work or the design spec, pause and suggest a fix before proceeding.

Adhere to the design spec and implementation plan as much as possible, unless there is some error in either, in which case use your best judgement. Add comment headers to all files to detail their contents, and comment code that is not readily understandable, or that require more context.

For all testing tasks, write out the test and test cases in the /testing/rmhbox/phase-[#]/ directory with files named by section number and label with informatively named functions. Make sure to use test cases beyond just the suggested specific test cases; write enough test cases to get a good sample. All tests should pass before moving onto the next section. 

Ensure all tests in /testing/rmhbox/ are environment-agnostic. Use mocks for the Prisma database and a virtual WebSocket client (like socket.io-client in a test runner) to simulate multi-user interactions. The implementation must include a setup script to populate the test database with necessary mock users/auth sessions. Ensure that all state-masking logic is verified by a dedicated security test case (e.g. verifying Player A cannot see Player B's hidden data).

Implement structured logging for all server-side state transitions to facilitate debugging. Every state transition, lobby lifecycle event, and critical WebSocket action must include structured logging (e.g., logger.info({ event, roomId, userId, data })). 

Follow the modular principles of the spec strictly; as you build the reusable UI components (Buttons, Modals, Timer Bars), document their API and Props in the /docs/rmhbox/ui-components.md file. This ensures that in later phases, the minigames can reuse UI patterns.

Now implement the current phase.