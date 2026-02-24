# 🎮 Minigame Platform: Game Design Documentations

This document outlines the mechanics, logic, and technical considerations for the initial 16 minigames on the platform.

---

## ✍️ Word & Language Games

### 1. Rhyme Time
* **Overview**: A high-speed linguistic "shoot 'em up" where speed and vocabulary depth are key.
* **How to Play**: The server displays a "Root Word" (e.g., *Power*). Players have 45 seconds to type as many rhymes as possible (*Flower, Sour, Tower*).
* **The Twist**: Common rhymes are worth 1 point. "Rare" rhymes (submitted by only 1-2 players) are worth 5 points. Multi-syllable rhymes trigger a combo multiplier.
* **Tech Notes**: Requires a rhyming dictionary API or a pre-loaded local JSON dictionary for instant validation.

### 2. Undercover Agent
* **Overview**: A team-based grid game of association (inspired by *Codenames*).
* **How to Play**: A $5 \times 5$ grid of words is shown. "Spymasters" give a one-word clue and a number (e.g., "Animal: 3"). "Operatives" must click the correct tiles.
* **The Twist**: The WebSocket must manage two distinct views: Spymasters see the color-coded "Key," while Operatives see a plain grid.
* **Win Condition**: First team to find all their agents wins. Clicking the "Assassin" tile is an instant loss.

### 3. Emoji Cinema
* **Overview**: "Reverse Charades" using only icons.
* **How to Play**: One player (The Producer) gets a movie title. They must use a restricted emoji-only keyboard to describe it.
* **The Twist**: The Producer’s points are tied to *how fast* the group guesses. If no one guesses in 30 seconds, the Producer loses points.
* **Tech Notes**: Implement a "Type-ahead" or "Fuzzy Match" system to handle slight misspellings in movie titles.

### 4. Identity Crisis
* **Overview**: Social deduction where the only person who doesn't know who you are is *you*.
* **How to Play**: Every player is assigned a famous person. You see everyone else's name, but yours is hidden. You take turns asking "Yes/No" questions.
* **The Twist**: The server doesn't answer; the other players vote "Yes," "No," or "Maybe" on your question via a UI popup.
* **Win Condition**: Identify yourself in the fewest number of questions.

---

## 🧠 Trivia & Logic

### 5. Fact or Friction
* **Overview**: High-stakes trivia where the "friction" comes from point loss.
* **How to Play**: A question appears. A "Point Pot" starts at 1,000 and rapidly ticks down.
* **The Twist**: If you answer incorrectly, the current value of the pot is *subtracted* from your total score. You can "Pass" to avoid the penalty.
* **Tech Notes**: Use a centralized server-side timer to ensure the "Point Pot" value is identical for all players regardless of latency.

### 6. Wiki-Race
* **Overview**: A scavenger hunt through the world's largest encyclopedia.
* **How to Play**: Players start on a random Wikipedia page. They must reach a "Target Page" (e.g., *The Industrial Revolution*) using only internal blue links.
* **The Twist**: The "Back" button and "Search" bar are disabled. 
* **Tech Notes**: Render Wikipedia through an `iframe` or a proxy that strips external links and monitors URL changes to notify the WebSocket server.

### 7. Sequence Sam
* **Overview**: A "Simon Says" memory game that scales in complexity.
* **How to Play**: A $3 \times 3$ grid flashes a pattern. Players must repeat it perfectly. Every round adds one more step.
* **The Twist**: "Chaos Rounds" rotate the grid 90 degrees *after* the pattern is shown, forcing players to track the physical location, not just the button ID.

### 8. Category Crash
* **Overview**: Fast-paced brainstorming under pressure.
* **How to Play**: A letter (e.g., "S") and 5 categories (e.g., *Pizza Topping, Country, 80s Band*) are shown. Players have 60 seconds to fill all five.
* **The Twist**: A "Peer Review" phase follows. Players can "Crash" (downvote) answers that are fake or misspelled.
* **Win Condition**: Most unique, non-crashed answers.

---

## 🕹️ Coordination & Action

### 9. Pixel Pushers
* **Overview**: Collaborative physics-based navigation.
* **How to Play**: Players control colored circles. They must physically bump into a "Physics Ball" to move it through a maze.
* **The Twist**: Every 10 seconds, one player's "Polarity" flips—they begin *attracting* the ball like a magnet, forcing a change in formation.

### 10. Human Keyboard
* **Overview**: Chaotic spelling through distributed responsibility.
* **How to Play**: A sentence appears. Each player is randomly assigned a set of keys (e.g., Player 1 has A-G). The sentence must be typed in sequence.
* **The Twist**: The "Keyboard" reshuffles every 5 seconds. You must look at your UI to see which letters you are currently responsible for.

### 11. Cursor Curling
* **Overview**: Momentum-based accuracy game.
* **How to Play**: Players "flick" their cursor to launch a stone toward a target "House." 
* **The Twist**: While the stone is moving, wiggling your cursor fast in front of it acts as "Sweeping," reducing friction and increasing distance.

### 12. Scroll Soul
* **Overview**: A vertical "Flappy Bird" style race through a webpage.
* **How to Play**: Players must scroll up/down to stay within "Safe Zones" as the viewport automatically scrolls.
* **The Twist**: The page generates "Fake Ads." You must click the "X" to close them before they push your avatar into the "Lava" at the edge of the screen.

### 13. Human Tetris
* **Overview**: Spatial awareness and real-time team positioning.
* **How to Play**: A wall with a specific hole shape moves toward the players. Players must move their avatars to form that exact shape.
* **The Twist**: Only a specific number of players can be part of the shape. Extra players must hide in "Dead Zones" or the whole team fails.

---

## 🎭 Creative & Meta

### 14. Undercover Editor
* **Overview**: Collaborative storytelling with a saboteur.
* **How to Play**: Players write a story one sentence at a time. The "Editor" can secretly change *one* word in any previous sentence per turn.
* **The Twist**: The Editor wins if they successfully lead the story to include a secret "Keyword" without being caught.

### 15. Minimalist Masterpiece
* **Overview**: Restricted drawing and art valuation.
* **How to Play**: Players have **exactly 5 strokes** to draw a prompt.
* **The Twist**: An "Auction" phase follows where players use fake currency to bid on the pieces they think are the best.
* **Win Condition**: The artist with the highest "Market Value" wins.

### 16. Ranking File
* **Overview**: A game of finding the "Common Ground."
* **How to Play**: Rank 5 items (e.g., *Fast Food Chains*) from 1–5.
* **The Twist**: You get points based on how closely your ranking matches the **Global Average** of the lobby.
* **Win Condition**: The player with the most "Average" (consensus) taste wins.