/** PF2e Remaster class feats for the Player Core 2 classes and the kineticist, summarised. */
import type { Pf2eFeat } from '../../types';
import { feats } from './dsl';

const c = (owner: string, trait: string, src: string) => feats('class', owner, [trait], src);

export const PF2E_CLASS_FEATS_B: Pf2eFeat[] = [
  ...c('alchemist', 'Alchemist', `
1|Alchemical Familiar|||Gain a familiar made of alchemy.
1|Alchemical Savant|||Identify alchemical items quickly with Crafting.
1|Far Lobber|||Your thrown bombs have a range increment of 30 feet.
1|Quick Bomber|1||Draw a bomb and Strike with it.
1|Soothing Vials|||Your versatile vials can heal as an elixir.
2|Healing Bomb|||Throw an elixir of life as a bomb to heal.
2|Revivifying Mutagen|1||End a mutagen early to regain HP.
2|Smoke Bomb|f||Your next bomb also creates a cloud of smoke.
2|Efficient Alchemy|||Make twice as many items in downtime.
4|Combine Elixirs|f||Combine two elixirs into one.
4|Debilitating Bomb|f||Your next bomb also makes the target dazzled, deafened, off-guard or slowed.
4|Directional Bombs|||Your bombs splash in a cone away from you.
4|Sticky Bomb|f||Your next bomb’s splash deals persistent damage.
6|Elastic Mutagen|||While under a quicksilver mutagen, Step 10 feet and Squeeze faster.
6|Expanded Splash|||Your bombs splash in a 10-foot area and deal more splash damage.
6|Feral Mutagen|||While under a bestial mutagen, gain claws and a bonus to Intimidation.
8|Greater Debilitating Bomb||Debilitating Bomb|More debilitations including clumsy and stupefied.
8|Merciful Elixir|f||Your next elixir of life also counteracts a fear or paralysis effect.
8|Potent Poisoner|||Your poisons use your class DC with a bonus.
10|Extend Elixir|||Your elixirs last twice as long.
10|Invigorating Elixir|f||Your next elixir also lets a creature make a new save against a condition.
10|Uncanny Bombs|||Your bombs ignore cover and have a longer range.
12|Mutant Physique|||Your mutagens grant extra benefits.
12|Pinpoint Poisoner|||Off-guard foes take a penalty against your poisons.
12|Glib Mutagen|||While under a silvertongue mutagen, ignore penalties to Deception and Diplomacy.
14|Exploitive Bomb|f||Your next bomb reduces the target’s resistance.
14|Genius Mutagen|||While under a cognitive mutagen, gain bonuses to Deception, Diplomacy and Intimidation.
14|Persistent Mutagen|||Once per day, a mutagen lasts until your next preparations.
16|Improbable Elixirs|||Craft elixirs that duplicate potion effects.
16|Mindblank Mutagen|||While under a serene mutagen, you are protected against detection.
16|Miracle Worker|||Once every 10 minutes, revive a creature that has just died with an elixir.
18|Craft Philosopher’s Stone|||Learn the formula for the philosopher’s stone.
18|Perfect Debilitation|||Foes critically fail saves against your debilitations more often.
18|Mega Bomb|3||Throw a huge bomb that affects a wide area.
20|Perfect Mutagen|||Your mutagens no longer have drawbacks.
20|Alchemical Tide|||Flood an area with your alchemy.
20|Supreme Formula|||Gain the ability to make any alchemical item quickly.
`),
  ...c('barbarian', 'Barbarian', `
1|Acute Vision|||While raging, gain darkvision.
1|Adrenaline Rush|||While raging, carry more and gain bonuses to Athletics.
1|Moment of Clarity|1||Use concentrate actions for the rest of your turn while raging.
1|Raging Intimidation|||Demoralize gains the rage trait; gain Intimidating Glare.
1|Raging Thrower|||Your rage damage bonus applies to thrown weapons.
1|Sudden Charge|2||Stride twice and make a melee Strike.
2|Acute Scent|||While raging, gain imprecise scent.
2|Furious Finish|1||Strike for maximum damage, then end your rage and become fatigued.
2|No Escape|r||Stride after a foe that moves away from you.
2|Second Wind|||Rage again immediately after ending a rage, becoming fatigued afterwards.
2|Shake It Off|1||Reduce frightened and sickened while raging.
4|Fast Movement|||While raging, gain +10 feet Speed.
4|Raging Athlete|||While raging, gain climb and swim Speeds and jump farther.
4|Swipe|2||Strike two adjacent foes with one swing.
4|Wounded Rage|r||Rage when you take damage.
6|Animal Skin||Animal instinct|While raging, gain an item bonus to AC.
6|Bashing Charge|2||Stride twice, Force Open a door or wall, and Strike.
6|Dragon’s Rage Breath|2|Dragon instinct|Breathe energy in a cone or line.
6|Giant’s Stature|1|Giant instinct|Grow to Large size while raging, gaining reach.
6|Spirits’ Interference|1|Spirit instinct|Ranged attacks against you have a flat check.
6|Cleave|r||When you drop a foe, Strike an adjacent creature.
8|Animal Rage|1|Animal instinct|Transform into your animal while raging.
8|Furious Bully|||Gain bonuses to Athletics maneuvers while raging.
8|Renewed Vigor|1||Gain temporary HP while raging.
8|Share Rage|1||An ally gains the benefits of Rage.
8|Sudden Leap|2||Leap and Strike during the jump.
8|Thrash|1||Damage a grabbed foe.
10|Come and Get Me|1||Make foes target you, gaining temporary HP when they hit.
10|Fearsome Brute|||Gain bonus damage against frightened foes.
10|Furious Sprint|2||Stride up to five times your Speed in a line.
10|Giant’s Lunge|1|Giant instinct|Gain reach with all melee weapons for a turn.
10|Knockback|1||After a hit, Shove the target.
10|Terrifying Howl|1||Demoralize all foes within 30 feet.
10|Dragon’s Rage Wings|1|Dragon instinct|Sprout wings and fly while raging.
12|Dragon Transformation|1|Dragon’s Rage Wings|Transform into a dragon.
12|Furious Grab|1||Strike and grab the target.
12|Predator’s Pounce|1|Animal instinct|Stride and Strike as one action.
12|Spirit’s Wrath|1|Spirit instinct|Release a spirit that strikes a foe.
12|Titan’s Stature|1|Giant’s Stature|Grow to Huge size.
14|Awesome Blow||Knockback|Knock a foe prone and push it farther.
14|Unbalancing Sweep|3||Shove or Trip every adjacent foe.
14|Whirlwind Strike|3||Strike every enemy within reach.
16|Collateral Thrash||Thrash|Thrash also damages an adjacent creature.
16|Furious Vengeance|r||Strike a foe that critically hits you.
16|Penetrating Blow|||Your Strikes ignore some resistance.
16|Reckless Abandon|f||Gain bonuses to saves and AC penalties while at low HP.
18|Brutal Critical|||Critical hits deal an extra die of damage.
18|Perfect Clarity|f||Reroll a failed attack or Will save, ending your rage.
18|Vicious Evisceration|2||Strike to make the foe drained.
20|Contagious Rage||Share Rage|Share Rage affects all allies.
20|Quaking Stomp|1||Stomp to cause an earthquake.
20|Rampaging Form|||Become nearly unstoppable while raging.
`),
  ...c('champion', 'Champion', `
1|Deity’s Domain|||Gain an initial domain spell as a devotion spell.
1|Desperate Prayer|r||Once per day, regain 1 Focus Point when you have none.
1|Ranged Reprisal|||Your champion’s reaction works at range with a ranged weapon.
1|Unimpeded Step|||Your champion’s reaction lets an ally move freely.
1|Weight of Guilt|||Your champion’s reaction can make the foe stupefied instead.
2|Divine Grace|r||Gain a bonus to a save against a spell.
2|Divine Health|||Gain a bonus to Fortitude against disease and poison.
2|Aura of Courage|||You and allies in your aura reduce frightened faster.
4|Aura of Despair|||Foes in your aura cannot reduce frightened below 1.
4|Mercy|1||Lay on hands can also counteract fear or paralysis.
4|Blessed Strike|1||Strike with your blessed armament for extra spirit damage.
6|Reactive Strike|r||Make a melee Strike against a foe that moves or uses a manipulate action within reach.
6|Loyal Warhorse|||Your mount companion is mature and never turns on you.
6|Shield Warden|||Use Shield Block to protect an adjacent ally.
6|Smite|1||Strike a foe that harmed an ally, making it take extra spirit damage.
8|Advanced Deity’s Domain||Deity’s Domain|Gain an advanced domain spell.
8|Greater Mercy||Mercy|Lay on hands can also counteract blinded, deafened, sickened or slowed.
8|Heal Mount|||Lay on hands heals your mount more.
8|Quick Shield Block|||Gain an extra reaction for Shield Block.
10|Affliction Mercy||Mercy|Lay on hands can counteract curses and diseases.
10|Aura of Faith|||Your Strikes and allies’ deal extra spirit damage to opposing foes.
10|Imposing Destrier||Loyal Warhorse|Your mount becomes nimble or savage.
10|Radiant Armament|||Your blessed armament deals more damage.
12|Aura of Preservation|||Allies in your aura gain resistance.
12|Shield of Reckoning|r||Shield Block for an ally and use your champion’s reaction.
12|Wyrmbane Aura|||Allies in your aura gain resistance to dragon breath energy.
14|Aura of Life|||Allies in your aura gain resistance to void damage.
14|Aura of Righteousness|||Allies in your aura gain resistance to unholy damage.
14|Divine Reflexes|||Gain an extra reaction for your champion’s reaction.
16|Celestial Mount||Loyal Warhorse|Your mount gains wings and flight.
16|Instrument of Zeal||Blessed armament|Your blessed armament deals extra damage.
16|Shield of Grace|||Shield Block reduces damage to an ally further.
18|Celestial Form|||Gain wings and darkvision.
18|Ultimate Mercy||Mercy|Lay on hands can return a creature to life.
18|Shield Paragon|||Your shield is always raised and harder to break.
20|Sacred Defender|||Gain resistance and immunity against powerful foes.
20|Avatar of Faith|||Become an avatar of your deity’s power.
20|Bound in Faith|||Gain an extra reaction each round for champion abilities.
`),
  ...c('investigator', 'Investigator', `
1|Flexible Studier|||Gain a skill feat when you Pursue a Lead.
1|Known Weaknesses|||Recall Knowledge when you Devise a Stratagem.
1|Takedown Expert|||Devise a Stratagem with a sap or unarmed attack.
1|That’s Odd|||Notice anomalies when entering a new location.
1|Trap Finder|||Bonuses to find and disable traps.
1|Underworld Investigator|||Use Thievery and Society in investigations.
2|Athletic Strategist|||Devise a Stratagem with Athletics maneuvers.
2|Clue Them All In|1||Share Clue In with all allies.
2|Detective’s Readiness|||Gain a bonus to saves against your lead.
2|Lie Detector|||Gain a bonus to Sense Motive.
4|Ongoing Investigation|||Investigate while exploring.
4|Scalpel’s Point|||Devise a Stratagem causes bleed damage.
4|Strategic Assessment|||Learn a foe’s weaknesses when you Devise a Stratagem.
6|Connect the Dots|1||Connect clues about your lead for insight.
6|Whodunnit?|||Learn about a crime from its scene.
6|Thorough Search|||Search takes twice as long but you gain a +2 circumstance bonus.
8|Blind-Fight|||You don’t need to see creatures to attack them well.
8|Ongoing Strategy|||Strategic strike damage on Strikes without Devise a Stratagem.
8|Suspect of Opportunity|r||Gain a new lead when a foe attacks you.
10|Deduce Traps|||Find traps more easily.
10|Plot the Future|||Predict events.
10|Sense the Unseen|r||When you Seek, find undetected creatures more easily.
12|Detective’s Advance|||Move toward your lead.
12|Just as Planned|||Prepare for any situation.
12|Foresee Danger|r||Avoid an attack by anticipating it.
14|Didactic Strike|||Share the benefits of your stratagem.
14|Reason Rapidly|||Recall Knowledge quickly.
14|Pinpoint Lead|||Track your lead’s location.
16|Reconstruct the Scene|||Recreate a scene to learn what happened.
16|Lead Investigator|||Allies benefit from your leads.
16|Strategic Bypass|||Ignore resistance with stratagems.
18|Trickster’s Ace|||Prepare a contingency.
18|Everyone’s a Suspect|||You sense disguised or invisible creatures around you.
18|Implausible Infiltration|||Move through walls briefly.
20|Just One More Thing|||Ask one more question in an investigation.
20|Superior Sight|||Sense invisible creatures.
20|Unrivaled Analysis|||Learn everything about a foe.
`),
  ...c('monk', 'Monk', `
1|Crane Stance|1||Stance: +1 AC and crane wing attacks.
1|Dragon Stance|1||Stance: dragon tail attacks and ignore difficult terrain when Striding.
1|Mountain Stance|1||Stance: +4 AC from your mountain defense with a low Dexterity cap.
1|Qi Spells|||Learn qi rush or inner upheaval and gain a focus pool.
1|Tiger Stance|1||Stance: tiger claw attacks that cause bleed.
1|Wolf Stance|1||Stance: wolf jaw attacks that trip when flanking.
2|Crushing Grab|||Grab deals damage.
2|Dancing Leaf|||Jump farther and take less falling damage.
2|Elemental Fist|||Inner upheaval can deal elemental damage.
2|Flurry of Maneuvers|||Use maneuvers in Flurry of Blows.
4|Deflect Projectile|r||Deflect a ranged attack.
4|Flying Kick|2||Leap and Strike.
4|Guarded Movement|||Gain a bonus to AC against reactions.
4|Stand Still|r||Strike a foe that moves.
4|Stunning Blows|||Flurry of Blows can stun.
6|Abundant Step|||Learn the abundant step qi spell.
6|Crane Flutter|r|Crane Stance|Gain AC against an attack.
6|Dragon Roar|1|Dragon Stance|Frighten foes.
6|Mountain Stronghold|1|Mountain Stance|Gain more AC.
6|Tiger Slash|2|Tiger Stance|Strike with extra damage and push.
6|Whirling Throw|1||Throw a grabbed foe.
6|Wolf Drag|2|Wolf Stance|Strike and trip.
8|Arrow Snatching||Deflect Projectile|Catch and throw back a projectile.
8|Ironblood Stance|1||Stance: gain resistance.
8|Mixed Maneuver|2||Use two maneuvers at once.
8|Tangled Forest Stance|1||Stance: restrain foes that move.
8|Wall Run|1||Run along walls.
8|Wild Winds Initiate|||Learn wild winds stance.
10|Knockback Strike|2||Strike and Shove.
10|Sleeper Hold|1||Make a grabbed foe unconscious.
10|Wind Jump|||Learn the wind jump qi spell.
10|Winding Flow|1||Stride and Strike with flowing movement.
12|Diamond Fists|||Your unarmed attacks gain forceful.
12|Shattering Strike|2||Strike that ignores Hardness and resistance.
12|Wild Winds Gust||Wild Winds Initiate|A gust that damages foes in a cone.
14|Ironblood Surge|1|Ironblood Stance|Gain more resistance.
14|Tangled Forest Rake|1|Tangled Forest Stance|Strike and reposition.
14|Timeless Body|||You stop aging and gain resistance.
16|Enduring Quickness|||Gain a permanent quickened condition.
16|Fuse Stance|||Combine two stances.
16|Master of Many Styles|f||Change stances freely.
18|Empty Body|||Learn the empty body qi spell.
18|Meditative Focus|||Refocus to regain 2 Focus Points.
18|Swift River|f||End effects that slow you.
20|Impossible Technique|r||Reroll a foe’s success.
20|Enlightened Presence|||Allies are protected against mental effects.
20|Qi Center|||Cast qi spells more freely.
`),
  ...c('oracle', 'Oracle', `
1|Divine Access|||Add spells from your mystery’s domains to your list.
1|Foretell Harm|||Your damaging spells foretell additional harm.
1|Glean Lore|||Use Religion to Recall Knowledge with insight.
1|Oracular Warning|||Warn allies of danger, granting them initiative bonuses.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Widen Spell|1||Spellshape: increase the area of a burst, cone or line spell.
2|Cantrip Expansion|||Add two more cantrips to your repertoire.
2|Knowledge of Shapes|||Add polymorph spells to your repertoire.
2|Mysterious Breadth|||Gain an extra spell slot of each rank.
4|Bespell Strikes|f||After casting a spell, your next Strike deals extra force damage.
4|Domain Acumen|||Learn a domain spell.
4|Thousand Visions|||See through invisibility and darkness briefly.
6|Advanced Revelation|||Learn your mystery’s advanced revelation spell.
6|Steady Spellcasting|||A reaction that would disrupt your spell is resisted with a flat check.
6|Whispers of Weakness|1||Learn a foe’s weaknesses.
8|Domain Fluency|||Refocus to regain 2 Focus Points.
8|Epiphany at the Crossroads|||Change your curse’s effects.
8|Lifelink Surge|||Heal yourself when you heal others.
10|Diverse Mystery|||Learn another mystery’s revelation spell.
10|Quickened Casting|f||Once per day, reduce the actions to cast a cantrip or spell 2 ranks lower than your highest by 1.
10|Soul Siphon|||Gain temporary HP when you damage foes with spells.
12|Greater Revelation|||Learn your mystery’s greater revelation spell.
12|Forestall Curse|||Delay your curse’s effects.
12|Magic Sense|||You constantly detect magic.
14|Divine Effusion|||Your healing spells heal more.
14|Mysterious Repertoire|||Add spells from other traditions to your repertoire.
14|Reflective Ripple|r||Reflect a spell back.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Domain Embodiment|||Embody your domain for a minute.
16|Mysterious Exaltation|||Gain bonuses from your mystery.
18|Divine Wellspring|||Refocus to regain 3 Focus Points.
18|Extreme Clarity|||Your curse’s penalties are reduced.
18|Echoing Spell|1||Spellshape: cast a spell a second time without a slot.
20|Oracular Providence|||Gain an extra 10th-rank spell slot.
20|Paradoxical Mystery|||Change your mystery each day.
20|Spellshape Mastery|||Use a spellshape action as a free action.
`),
  ...c('sorcerer', 'Sorcerer', `
1|Blessed Blood|||Add heal spells to your repertoire from divine blood.
1|Counterspell|r||Use a spell you know to counteract an identical spell.
1|Dangerous Sorcery|||Your damaging spells deal extra damage equal to their rank.
1|Familiar|||Gain a familiar.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Widen Spell|1||Spellshape: increase the area of a burst, cone or line spell.
2|Cantrip Expansion|||Add two more cantrips to your repertoire.
2|Conceal Spell|1||Spellshape: hide the casting of your next spell.
2|Enhanced Familiar|||Select four familiar abilities per day instead of two.
4|Arcane Evolution|||Gain a trained skill and add a spell to your repertoire daily.
4|Bespell Strikes|f||After casting a spell, your next Strike deals extra force damage.
4|Divine Evolution|||Gain an extra heal or harm slot.
4|Occult Evolution|||Gain a trained skill and add a mental spell daily.
4|Primal Evolution|||Cast summon animal or summon plant or fungus once per day.
6|Advanced Bloodline|||Learn your bloodline’s advanced spell.
6|Diverting Vortex|1||Gain AC against ranged attacks.
6|Steady Spellcasting|||A reaction that would disrupt your spell is resisted with a flat check.
8|Bloodline Resistance|||Gain a bonus to saves against spells.
8|Crossblooded Evolution|||Add a spell from another tradition to your repertoire.
8|Energy Fusion|1||Spellshape: combine two energy spells.
10|Greater Bloodline|||Learn your bloodline’s greater spell.
10|Overwhelming Energy|1||Spellshape: your next spell ignores energy resistance.
10|Quickened Casting|f||Once per day, reduce the actions to cast a cantrip or spell 2 ranks lower than your highest by 1.
10|Signature Spell Expansion|||Choose two more signature spells.
12|Bloodline Focus|||Refocus to regain 2 Focus Points.
12|Magic Sense|||You constantly detect magic.
12|Blood Component Substitution|||Replace components with your blood.
14|Interweave Dispel|1||Spellshape: your damaging spell also counteracts.
14|Reflect Spell||Counterspell|When you counteract a spell, turn it back on its caster.
14|Greater Physical Evolution|||Cast polymorph spells once per day.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Greater Mental Evolution|||Add a spell of each rank to your repertoire.
16|Greater Vital Evolution|||Cast two extra spells per day.
18|Bloodline Wellspring|||Refocus to regain 3 Focus Points.
18|Greater Crossblooded Evolution|||Add more spells from another tradition.
18|Echoing Spell|1||Spellshape: cast a spell a second time without a slot.
20|Bloodline Conduit|||Cast low-rank bloodline spells without spending Focus Points.
20|Bloodline Perfection|||Gain an extra 10th-rank spell slot.
20|Spellshape Mastery|||Use a spellshape action as a free action.
`),
  ...c('swashbuckler', 'Swashbuckler', `
1|Disarming Flair|||Disarm gains panache and is easier.
1|Elegant Buckler|||Gain a bonus with a buckler.
1|Extravagant Parry|1||Gain a bonus to AC while wielding a parry weapon.
1|Flashy Dodge|r||Gain a bonus to AC against an attack.
1|Focused Fascination|||Fascinate gains panache.
1|Goading Feint|||Feint makes the foe take a penalty to attacks against others.
1|One For All|1||Aid an ally with panache.
1|You’re Next|r||After reducing a foe to 0 HP, Demoralize another.
2|Antagonize|||Your Demoralize lasts longer.
2|Charmed Life|r||Gain a bonus to a save.
2|Finishing Follow-Through|||Gain panache after a finisher drops a foe.
2|Retreating Finisher|2||Finisher: Strike and Step away.
4|Dual Finisher|2||Finisher: Strike two foes.
4|Flamboyant Athlete|||Use Acrobatics or Athletics with panache bonuses.
4|Guardian’s Deflection|r||Use your weapon to give an adjacent ally +2 AC against an attack.
4|Impaling Finisher|1||Finisher: Strike two foes in a line.
4|Leading Dance|1||Move a foe as you move.
4|Twin Parry|1||Gain a +1 circumstance bonus to AC while wielding two weapons.
6|Agile Maneuvers|||Your multiple attack penalty for maneuvers is reduced.
6|Combination Finisher|||Finishers count as one attack.
6|Precise Finisher|||A failed finisher still deals precise strike damage.
8|Bleeding Finisher|1||Finisher: Strike that causes persistent bleed damage.
8|Dueling Dance|1||Stance: constant parry bonus.
8|Flamboyant Leap|2||Leap and Strike as a finisher.
8|Twin Riposte|r|Twin Parry|When a foe critically fails against you, Strike or Disarm it.
8|Vexing Tumble|2||Tumble through foes, making them off-guard.
10|Buckler Dance|1||Stance: parry with a buckler.
10|Derring-Do|||Gain a bonus to skill checks with panache.
10|Reactive Strike|r||Make a melee Strike against a foe that moves or uses a manipulate action within reach.
10|Stumbling Finisher|1||Finisher: Strike that makes the foe clumsy.
10|Targeting Finisher|1||Finisher: Strike that makes the foe off-guard to allies.
12|Cheat Death|r||Once per day, survive a lethal blow.
12|Mobile Finisher|1||Finisher: Stride and Strike.
12|Switcheroo|1||Swap places with a foe.
14|Deadly Grace|||Your finesse weapons gain deadly.
14|Felicitous Riposte|||Your Opportune Riposte deals extra damage.
14|Perfect Finisher|1||Finisher: Strike with a roll at least 10.
16|Leave an Opening|||When a foe critically misses you, an ally can Strike it.
16|Revitalizing Finisher|1||Finisher that heals you and allies.
16|Incredible Luck|||Reroll a failed check once per day.
18|Lethal Finisher|1||Finisher that deals massive precision damage.
18|Parry and Riposte|||Opportune Riposte triggers on more failures.
18|Implausible Purchase|||Produce an item of greater value.
20|Illimitable Finisher|||Use finishers without losing panache.
20|Inexhaustible Countermoves|||Gain an extra reaction each round.
20|Panache Paragon|||Always have panache.
`),
  ...c('kineticist', 'Kineticist', `
1|Armor in Earth|1||Impulse: encase yourself in stone for a bonus to AC at the cost of Speed.
1|Fresh Produce|1||Impulse: grow a fruit that heals a creature that eats it.
1|Hail of Splinters|1||Impulse: a cloud of wood splinters damages creatures that end their turn near you.
1|Ocean\u2019s Balm|1||Impulse: water heals an ally and grants resistance to fire.
1|Scorching Column|2||Impulse: a pillar of flame erupts in an area, damaging creatures within.
1|Tumbling Lumber|2||Impulse: logs roll along a line, knocking creatures prone.
1|Winter Sleet|2||Impulse: sleet makes an area slippery and difficult to cross.
1|Weapon Infusion|1||Impulse: give your elemental blast the reach, range or damage type of a weapon.
2|Aerial Boomerang|2||Impulse: a blade of air flies out and returns, striking creatures along its path.
2|Elemental Familiar|||Gain a familiar made of your element.
2|Kinetic Activation|||Activate magic items using your kinetic power instead of a spellcasting tradition.
2|Lava Leap|2||Impulse: leap through the air on molten rock, burning creatures where you land.
4|Flying Flame|2||Impulse: a blazing bird flies along a path, damaging creatures it passes.
4|Hardwood Armor|1||Impulse: grow wooden armor that you wear until your next preparations.
4|Thermal Nimbus|1||Impulse: your aura deals fire or cold damage to foes that end their turn in it.
4|Timber Sentinel|2||Impulse: raise a protector tree that shields allies with its branches.
`),
];
