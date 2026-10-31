# Harmonic — story bible

Everything here is original to this project. Keep it that way: when you write a line,
a name or a level, it must not echo another game's characters, factions, places or
plot. Ideas as broad as "a ship lost in time" are free; specific beats are ours.

## Premise

In **1971** the research ship **MV _Saint Ilse_** left the Port Calder yards on the White
Sea to test the **Stillwater Drive**, a field engine meant to move a vessel without
crossing the space between. The test fired once. The ship did not arrive anywhere — it
was _stretched_: one moment of 1971 pulled taut across fifty-nine years like a plucked
string. Most of the string is noise. At a few **still points** along it the ship is
almost solid.

In **2030**, one still point sits over the frozen **Kara Sea**. Twice a day an outline of
the _Saint Ilse_ shimmers above the ice for a few seconds. Two parties have noticed:

- the **Calder Trust**, the small heritage foundation that inherited the shipyard's
  archive and wants the crew's fate known and the ship brought home, and
- **Meridian Recovery**, a private salvage-and-security contractor that has built a
  listening post on the ice and wants the Drive.

## Player

**Ines Vahl**, 41, marine salvage engineer, hired by the Calder Trust. Practical, dry,
quietly stubborn. She speaks (subtitled, no voice acting in phase 0–2) — short, literal
lines. Her grandfather **Pavel Vahl** was the _Saint Ilse_'s second engineer.

## Cast

| Name                   | Who                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ines Vahl**          | The player.                                                                                                                                                         |
| **Odile Brandt**       | The Trust's archivist and Ines's radio voice. Warm, precise, never on site. Reads the 1971 logs aloud as Ines finds them.                                           |
| **Sana Kade**          | Meridian's resonance analyst. Has come to believe Meridian will weaponise the Drive. Detained by her own employer when Ines finds her; carries the **tuning keys**. |
| **Commander Teo Voss** | Meridian's site commander. Not a cartoon: he believes a working Drive ends shipping disasters and wars of supply. He will still shoot you.                          |
| **Dr. Halvard Lind**   | The Drive's designer, aboard in 1971. Exists on the ship as many overlapping selves at many ages; the oldest has had fifty-nine years to understand what he did.    |
| **Pavel Vahl**         | Ines's grandfather. Met only as an echo; recognises her before she recognises him.                                                                                  |
| **The Unstrung**       | The rest of the 1971 crew, smeared across the string. Not monsters — people out of phase, hostile because every touch of the present hurts them.                    |

## Factions and enemies (gameplay)

- **Meridian contractors** — rifle squads, a shield-bearer, a sniper on the ice; later
  "tuned" troopers carrying phase lamps that drag Unstrung into the present to fight.
- **The Unstrung** — flicker between _past_ and _present_ layers; can only be hurt while
  in the same layer as you. Variants: the **Drifter** (slow, grabs), the **Stutter**
  (blinks forward in skips), the **Chorus** (several echoes of one person, one is real).

## The Tuner (signature tool)

A hand-built resonance fork from Lind's workshop (found in chapter 4). Primary: **shift**
a tagged object or doorway between the 1971 and 2030 layers. Secondary: **listen** —
briefly reveals the other layer as a translucent overlay. Charge recovers over time. It
never damages directly; it solves rooms and pulls Unstrung into your layer so they can
be fought.

## Chapters (one level each, `lib/harmonic-game/levels/`)

| #   | Id                 | Title             | Beats                                                                                                                                                                                                                                                           |
| --- | ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `h1_whiteout`      | Whiteout          | Trust survey plane loses power near the coordinates; Ines walks out of the wreck into a blizzard. Tutorial: movement, the **cold** meter, shelters, the pry bar. First sight of the ship's outline over the ice. Ends at Meridian's perimeter fence.            |
| 2   | `h2_listening`     | Listening Post    | Infiltrate Meridian's array of antenna masts that predicts the ship's appearances. Pulse pistol. Stealth-or-fight. Find **Sana Kade** in a container cell; she trades the tuning keys for a way out. Learn the next still point is in 40 minutes.               |
| 3   | `h3_still_point`   | Still Point       | Fight across the open ice to the focus of the array while Sana attunes it; Voss's squads converge. The ship becomes solid for ninety seconds — a timed run up a collapsing gangway. Sana is cut off and stays behind. The ship unmoors with Ines aboard.        |
| 4   | `h4_below_decks`   | Below Decks, 1971 | Corridors where 1971 and 2030 overlap (fresh paint over rust). First Unstrung. Lind's workshop: **the Tuner**. Pavel's echo leads Ines toward the engine room, then is lost in a skip.                                                                          |
| 5   | `h5_long_corridor` | The Long Corridor | A corridor that loops — each pass a different year. Tuner puzzles across layers; the Chorus. Odile's radio reaches Ines from 2030 with gaps; at one point Ines hears her own voice on it, an hour ahead.                                                        |
| 6   | `h6_drive_room`    | Drive Room        | Voss boards with tuned troopers. Confrontation in the Drive room; the oldest Lind explains the string. Sana reappears — she came across with the second wave and turned Voss's lamps off. Voss is beaten, not necessarily killed (player's choice, remembered). |
| 7   | `h7_harmonic`      | Harmonic          | The choice at the Drive. Three endings (below).                                                                                                                                                                                                                 |

## Endings (chapter 7)

The player chooses at the Drive console; each ending is its own short playable epilogue.

1. **Anchor** — pull the ship fully into 2030. The crew's echoes resolve into one
   moment each and are gone; the ship sits on the ice, a wreck with fresh paint. The
   Trust gets its ship. Meridian gets nothing. Ines keeps Pavel's watch.
2. **Release** — let the string finish its jump. The _Saint Ilse_ arrives where it was
   aimed in 1971, crew alive, and Ines with it — fifty-nine years early, unknown,
   standing next to a young Pavel. Odile's last log entry finds Ines's name in the 1971
   harbour master's records.
3. **Silence** — shut the Drive down mid-string. Every still point collapses; the ship,
   the crew, the Drive and the listening post's purpose are gone. Ines wakes on the ice
   by the wreck of the survey plane, hours before chapter 1, and walks the other way.

What Voss's fate was (ch. 6) and whether Sana was helped out (ch. 2) change lines in
each epilogue, never which endings are available.

## Tone and writing rules

- Calm, cold, human. Wonder over horror. Short literal lines; no quips.
- No one is evil for its own sake; Meridian is a company, not an empire.
- All dialogue and on-screen text go through `t('harmonic:…')`; each line has a stable
  key `ch<N>.<scene>.<n>` so translations never drift (see `architecture.md` §6).
- No real-world brands. Place names are real geography (Kara Sea, White Sea) or ours
  (Port Calder).
