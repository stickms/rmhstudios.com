/** PF2e Remaster general and skill feats (Player Core), summarised. */
import type { Pf2eFeat } from '../../types';
import { feats } from './dsl';

const GENERAL = feats('general', undefined, ['General'], `
1|Adopted Ancestry|||Choose another common ancestry; you can take its ancestry feats if they do not depend on physiology.
1|Armor Proficiency|||Become trained in the next heavier armor category (light, then medium, then heavy); expert when your class makes you expert in armor. Repeatable.
1|Breath Control|||Hold your breath 25 times as long and gain a +1 circumstance bonus to saves against inhaled threats; a success against them is a critical success.
1|Canny Acumen|||Become an expert in Fortitude, Reflex, Will or Perception; master at 17th level.
1|Diehard|||You die at dying 5 instead of dying 4.
1|Fast Recovery|||Regain twice as many HP from resting and reduce drained and afflictions faster.
1|Feather Step|||Step into difficult terrain as if it were normal terrain.
1|Fleet|||Your Speed increases by 5 feet.
1|Incredible Initiative|||+2 circumstance bonus to initiative rolls.
1|Ride|||Commanding a mount you ride always succeeds, and the mount acts on your turn.
1|Shield Block|r||When you take physical damage with your shield raised, reduce the damage by the shield’s Hardness; you and the shield take the rest.
1|Toughness|||Increase your maximum HP by your level, and the DC of recovery checks is 9 + your dying value.
1|Weapon Proficiency|||Become trained in all martial weapons (or one advanced weapon if already trained in martial). Expert when your class grants expert in weapons.
3|Ancestral Paragon|||Gain a 1st-level ancestry feat.
3|Improvised Repair|3||Quickly patch a broken item so it can be used as a shoddy item until it is fully Repaired.
3|Keen Follower|||When you Follow the Expert, your bonus is +3 if the expert is expert and +4 if master.
3|Pick Up the Pace|||You and your allies can Hustle for as long as the one with the highest Constitution modifier could.
3|Prescient Planner|1||Once per day, pull a common item from your pack that you could have bought, paying its price.
3|Skitter|||Crawl at half your Speed, and Stand from prone without provoking.
3|Thorough Search|||Search takes twice as long but you gain a +2 circumstance bonus and critical success is easier.
3|Untrained Improvisation|||Add half your level (your full level at 7th) to untrained skill checks.
7|Numb to Death|||The first time each day you recover from dying, you are not wounded.
7|Prescient Consumable|1|Prescient Planner|Prescient Planner can also produce a consumable item of your level or lower minus half.
7|Supertaster|||Detect poisons and ingredients by taste, and gain a +2 bonus to related checks.
11|A Home in Every Port|||Downtime in a settlement lets you find free lodging for you and up to six allies.
11|Caravan Leader||Pick Up the Pace|Your group can Hustle for an extra 20 minutes longer than any of you could.
11|Incredible Investiture|||You can invest up to 12 magic items instead of 10.
19|True Perception|||You are always under the effects of a 6th-rank truesight using your Perception.
`);

const SKILL = feats('skill', undefined, ['General', 'Skill'], `
1|Additional Lore||Trained in Lore|Become trained in another Lore subcategory; it rises to expert at 3rd, master at 7th and legendary at 15th.
1|Arcane Sense||Trained in Arcana|Cast detect magic as an arcane innate cantrip at will.
1|Assurance||Trained in at least one skill|Choose a skill; you may forgo rolling and take 10 + your proficiency bonus.
1|Bargain Hunter||Trained in Diplomacy|Earn Income by bargain hunting, and start with 2 gp extra.
1|Cat Fall||Trained in Acrobatics|Treat falls as 10 feet shorter (25 at expert, 50 at master, any at legendary).
1|Charming Liar||Trained in Deception|A critical success on a Lie improves the target’s attitude toward you by one step.
1|Combat Climber||Trained in Athletics|You are not off-guard while Climbing and can Climb with a hand occupied.
1|Courtly Graces||Trained in Society|Use Society to Make an Impression on nobles and to Impersonate a noble.
1|Dubious Knowledge||Trained in a Recall Knowledge skill|On a failed Recall Knowledge, you learn one true and one false fact.
1|Experienced Professional||Trained in Lore|A critical failure to Earn Income with Lore is a failure, and a failure earns twice as much.
1|Experienced Smuggler||Trained in Stealth|Gain bonuses to Conceal an Object, and a better chance to smuggle on success.
1|Experienced Tracker||Trained in Survival|Track at full Speed with a -5 penalty (no penalty at master).
1|Fascinating Performance||Trained in Performance|Perform to fascinate a creature for a round (more at higher proficiency).
1|Forager||Trained in Survival|When Subsisting, a failure is a success and you can feed more creatures.
1|Group Impression||Trained in Diplomacy|Make an Impression on up to 2 targets at once (more as you improve).
1|Hefty Hauler||Trained in Athletics|Your maximum and encumbered Bulk limits increase by 2.
1|Hobnobber||Trained in Diplomacy|Gather Information takes half as long; at master, critical failures become failures.
1|Impressive Performance||Trained in Performance|You can Perform to Make an Impression.
1|Intimidating Glare||Trained in Intimidation|Demoralize with a glare, so it loses the auditory trait and needs no shared language.
1|Lengthy Diversion||Trained in Deception|A critical success to Create a Diversion keeps you hidden past the end of your turn.
1|Lie to Me||Trained in Deception|Use Deception instead of Perception to detect a lie in conversation.
1|Multilingual||Trained in Society|Learn two new languages (more at master and legendary). Repeatable.
1|Natural Medicine||Trained in Nature|Use Nature instead of Medicine to Treat Wounds, with a +2 bonus in the wilderness.
1|Oddity Identification||Trained in Occultism|+2 circumstance bonus to Identify Magic for mental, possession, prediction or scrying effects.
1|Pickpocket||Trained in Thievery|Steal a closely guarded object without penalty; at master, steal in combat with 2 actions.
1|Quick Coercion||Trained in Intimidation|Coerce a creature after 1 round of conversation instead of 1 minute.
1|Quick Identification||Trained in Arcana, Nature, Occultism or Religion|Identify Magic in 1 minute (faster at master and legendary).
1|Quick Jump||Trained in Athletics|High Jump and Long Jump as a single action without the initial Stride.
1|Quick Squeeze||Trained in Acrobatics|Squeeze at 5 feet per round (Speed at legendary).
1|Read Lips||Trained in Society|Read the lips of those you can see clearly.
1|Recognize Spell|r|Trained in Arcana, Nature, Occultism or Religion|Identify a spell as it is cast, automatically for common low-rank spells.
1|Schooled in Secrets||Trained in Occultism|Use Occultism to Gather Information about secret societies and pose as a member of one.
1|Sign Language||Trained in Society|Learn the sign languages of the languages you know.
1|Snare Crafting||Trained in Crafting|Craft snares and gain four common snare formulas.
1|Specialty Crafting||Trained in Crafting|+1 circumstance bonus to Craft items of your specialty (+2 at master).
1|Steady Balance||Trained in Acrobatics|Balance successes are critical successes and you are not off-guard while Balancing.
1|Streetwise||Trained in Society|Use Society to Gather Information and to Recall Knowledge about a settlement you know.
1|Student of the Canon||Trained in Religion|A critical failure to Recall Knowledge about your faith is a failure, and you learn more on a success.
1|Subtle Theft||Trained in Thievery|After stealing, observers have a -2 penalty to notice, and you stay undetected if you were.
1|Survey Wildlife||Trained in Survival|Spend 10 minutes assessing an area to Recall Knowledge about its creatures.
1|Terrain Expertise||Trained in Survival|+1 circumstance bonus to Survival in one type of terrain. Repeatable.
1|Terrain Stalker||Trained in Stealth|Sneak through one type of difficult terrain without needing a check.
1|Titan Wrestler||Trained in Athletics|Disarm, Grapple, Shove or Trip creatures up to two sizes larger (three at legendary).
1|Train Animal||Trained in Nature|Teach an animal a trick over a week of downtime.
1|Trick Magic Item||Trained in Arcana, Nature, Occultism or Religion|Attempt to activate a magic item meant for another tradition.
1|Underwater Marauder||Trained in Athletics|You are not off-guard while in water and take no penalty with bludgeoning or slashing weapons underwater.
1|Virtuosic Performer||Trained in Performance|+1 circumstance bonus to one type of performance (+2 at master).
2|Assured Identification||Expert in Arcana, Nature, Occultism or Religion|A critical failure to Identify Magic is a failure instead.
2|Battle Medicine|1|Trained in Medicine|Treat Wounds in combat on a creature once per day per target, without a toolkit healing check penalty.
2|Bon Mot|1|Trained in Diplomacy|Quip at a foe; on a success it takes a -2 status penalty to Perception and Will.
2|Confabulator||Expert in Deception|Repeated Lies and Feints against the same target take smaller penalties.
2|Continual Recovery||Expert in Medicine|Treat Wounds immunity lasts 10 minutes instead of 1 hour.
2|Glad-Hand||Expert in Diplomacy|Make an Impression immediately on meeting someone, without the usual minute.
2|Intimidating Prowess||Expert in Intimidation|Add +1 (+2 at legendary) to Demoralize and Coerce if you are physically imposing.
2|Lasting Coercion||Expert in Intimidation|Coercion lasts up to a week (longer at legendary).
2|Magical Crafting||Expert in Crafting|You can Craft magic items and gain four common magic item formulas.
2|Powerful Leap||Expert in Athletics|Jump 5 feet up with a Leap and add 5 feet to horizontal Leaps.
2|Rapid Mantel||Expert in Athletics|Stand up at the top of a Climb or Grab an Edge with a single action.
2|Robust Recovery||Expert in Medicine|Treat Disease and Treat Poison add +4 instead of +2, and a success is a critical success.
2|Unmistakable Lore||Expert in Lore|A critical failure to Recall Knowledge with your Lores is a failure, and you learn more on a critical success.
2|Ward Medic||Expert in Medicine|Treat Wounds or Treat Disease on up to two creatures at once (more at master and legendary).
7|Battle Cry||Master in Intimidation|When you roll initiative, Demoralize a foe as a free action.
7|Bizarre Magic||Master in Arcana, Nature, Occultism or Religion|Your spells are harder to identify and counteract with Recognize Spell.
7|Expeditious Search||Master in Perception|Search at twice your normal Speed during exploration.
7|Foil Senses||Master in Stealth|Your Avoid Notice, Hide and Sneak take precautions against special senses.
7|Kip Up|f|Master in Acrobatics|Stand up without triggering reactions.
7|Quick Climb||Master in Athletics|Climb at full Speed on a critical success and gain a climb Speed at legendary.
7|Quick Recognition||Master in Arcana, Nature, Occultism or Religion|Recognize Spell as a free action once per round.
7|Quick Swim||Master in Athletics|Swim at full Speed on a critical success and gain a swim Speed at legendary.
7|Rapid Affixture||Master in Crafting|Affix a talisman in 1 minute (as a 3-action activity at legendary).
7|Shameless Request||Master in Diplomacy|Reduce the DC of outrageous Requests and avoid hostility on critical failures.
7|Slippery Secrets||Master in Deception|Evade mind-reading and detection magic with Deception.
7|Swift Sneak||Master in Stealth|Sneak at your full Speed.
7|Terrified Retreat||Master in Intimidation|A critically successful Demoralize makes a lower-level foe flee for 1 round.
7|Wall Jump||Master in Athletics|Leap off a wall to extend a jump, up to once per turn.
15|Cloud Jump||Legendary in Athletics|Jump much farther and higher, with Long Jump distance tripled.
15|Craft Anything||Legendary in Crafting|Ignore most special requirements when Crafting.
15|Legendary Codebreaker||Legendary in Society|Decipher Writing quickly, and successes are critical successes.
15|Legendary Linguist||Legendary in Society|Make a basic pidgin to communicate with any creature that has a language.
15|Legendary Medic||Legendary in Medicine|Once per day per target, remove a disease or condition like blinded or drained with an hour of treatment.
15|Legendary Negotiation||Legendary in Diplomacy|Parley with foes in combat to convince them to stop fighting.
15|Legendary Performer||Legendary in Performance|Fascinating performances work on many more creatures and you earn more.
15|Legendary Professional||Legendary in Lore|Earn Income at a higher level and your fame grows.
15|Legendary Sneak||Legendary in Stealth|Hide and Sneak even without cover or concealment.
15|Legendary Survivalist||Legendary in Survival|Survive extreme environments indefinitely without food or water.
15|Legendary Thief||Legendary in Thievery|Steal objects normally impossible to take, such as a held weapon.
15|Scare to Death|1|Legendary in Intimidation|Terrify a foe so badly it may die of fright on a critical failure.
15|Unified Theory||Legendary in Arcana|Use Arcana in place of Nature, Occultism or Religion for Identify Magic and Recall Knowledge about magic.
`);

export const PF2E_GENERAL_FEATS: Pf2eFeat[] = [...GENERAL, ...SKILL];
