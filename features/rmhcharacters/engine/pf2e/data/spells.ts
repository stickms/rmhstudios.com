/**
 * PF2e Remaster spells: cantrips, a core set for ranks 1-10, and focus spells
 * for the focus-casting classes. Line format in `./dsl.ts`:
 * rank|Name|traditions|actions|traits|range|area|targets|defense|duration|text|heightened
 */
import type { Pf2eSpell } from '../../types';
import { spells, uniqueIds } from './dsl';

const CANTRIPS = spells(`
0|Caustic Blast|a|2|Acid, Cantrip, Concentrate, Manipulate|30 feet|5-foot burst||basic Reflex||A ball of acid deals 2d8 acid damage; on a critical failure, also 1 persistent acid damage.|+2: damage increases by 1d8 and persistent damage by 1.
0|Daze|ado|2|Cantrip, Concentrate, Manipulate, Mental, Nonlethal|60 feet||1 creature|basic Will||Cloud a mind for 1d6 mental damage; a critical failure leaves it stunned 1.|+2: damage increases by 1d6.
0|Detect Magic|adop|2|Cantrip, Concentrate, Detection, Manipulate||30-foot emanation||||Sense whether magic is present nearby and, with higher rank, its location and power.|3rd: learn the school-like nature; 4th: pinpoint the source.
0|Divine Lance|d|2|Cantrip, Concentrate, Manipulate, Sanctified, Spirit|30 feet||1 creature|||Spell attack: deal 2d4 spirit damage (double on a critical hit).|+1: damage increases by 1d4.
0|Electric Arc|ap|2|Cantrip, Concentrate, Electricity, Manipulate|30 feet||1 or 2 creatures|basic Reflex||An arc of lightning deals 2d4 electricity damage.|+1: damage increases by 1d4.
0|Figment|ao|2|Auditory, Cantrip, Concentrate, Illusion, Manipulate, Visual|30 feet||||sustained|Create a simple illusory sound or image.|
0|Forbidding Ward|do|2|Cantrip, Concentrate, Manipulate|30 feet||1 ally and 1 enemy||sustained up to 1 minute|The ally gains a +1 status bonus to AC and saves against the chosen enemy.|6th: bonus becomes +2.
0|Frostbite|ap|2|Cantrip, Cold, Concentrate, Manipulate|60 feet||1 creature|basic Fortitude||Frost deals 2d4 cold damage; on a failure, the target gets weakness 1 to bludgeoning.|+1: damage increases by 1d4 and weakness by 1.
0|Gale Blast|ap|2|Air, Cantrip, Concentrate, Manipulate||5-foot emanation||basic Fortitude||Wind deals 2 + spellcasting modifier bludgeoning damage and can push creatures 5 feet.|+1: damage increases by 1.
0|Gouging Claw|ap|2|Cantrip, Concentrate, Manipulate, Morph|touch||1 creature|||Spell attack with a claw for 2d6 slashing or piercing damage plus persistent bleed on a critical.|+1: damage increases by 1d6.
0|Guidance|dop|1|Cantrip, Concentrate|30 feet||1 creature||until the start of your next turn|The target gains a +1 status bonus to one attack roll, Perception check, save or skill check.|
0|Ignition|ap|2|Cantrip, Concentrate, Fire, Manipulate|30 feet or touch||1 creature|||Spell attack: 2d4 fire damage (more if you touch), with persistent fire on a critical.|+1: damage increases by 1d4.
0|Know the Way|op|1|Cantrip, Concentrate, Detection||||||You know true north and the way back to a place you have been.|
0|Light|adop|2|Cantrip, Concentrate, Light, Manipulate|120 feet||1 object||until your next daily preparations|An object sheds bright light in a 20-foot radius.|4th: can be thrown onto a creature or two lights.
0|Message|ado|1|Auditory, Cantrip, Concentrate, Illusion, Linguistic, Mental|120 feet||1 creature|||Whisper a message that only the target hears; it can reply.|3rd: range 500 feet.
0|Needle Darts|a|2|Cantrip, Concentrate, Manipulate, Metal|60 feet||1 creature|||Spell attack with metal needles for 3d4 piercing damage, with bleed on a critical.|+1: damage increases by 1d4.
0|Prestidigitation|adop|2|Cantrip, Concentrate, Manipulate|10 feet||||sustained|Perform minor magical tricks: clean, chill, warm, flavour or make small illusions.|
0|Read Aura|adop|1 minute|Cantrip, Concentrate, Detection, Manipulate|30 feet||1 object||| Learn whether an object is magical and its tradition.|3rd: up to 10 objects.
0|Scatter Scree|ap|2|Cantrip, Concentrate, Earth, Manipulate|30 feet|two contiguous 5-foot cubes||basic Reflex||Rocks deal 2d4 bludgeoning damage and make the area difficult terrain.|+2: damage increases by 1d4.
0|Shield|ado|1|Cantrip, Concentrate, Force||||||A force shield gives +1 circumstance bonus to AC; you can Shield Block with it (Hardness 5), then cannot cast it for 10 minutes.|+2: Hardness increases by 5.
0|Sigil|adop|2|Cantrip, Concentrate, Manipulate|touch||1 creature or object||unlimited|Inscribe a harmless magical mark.|
0|Spout|ap|2|Cantrip, Concentrate, Manipulate, Water|30 feet||1 or 2 creatures|basic Reflex||A jet of water deals 2d4 bludgeoning damage.|+1: damage increases by 1d4.
0|Stabilize|dp|2|Cantrip, Concentrate, Healing, Manipulate, Vitality|30 feet||1 dying creature|||The target loses the dying condition but stays unconscious at 0 HP.|
0|Tangle Vine|p|1|Cantrip, Concentrate, Plant, Wood|30 feet||1 creature||1 round|Spell attack: vines make the target clumsy or immobilized briefly.|2nd: on a hit, immobilized.
0|Telekinetic Hand|ao|2|Cantrip, Concentrate, Manipulate|30 feet||1 unattended object of light Bulk||sustained|Move an object at 20 feet per action.|
0|Telekinetic Projectile|ao|2|Cantrip, Concentrate, Manipulate|30 feet||1 creature|||Spell attack hurling an object for 2d6 bludgeoning, piercing or slashing damage.|+1: damage increases by 1d6.
0|Timber|p|2|Cantrip, Concentrate, Manipulate, Plant, Wood|30 feet|15-foot line||basic Reflex||A log rolls along a line for 2d4 bludgeoning damage.|+1: damage increases by 1d4.
0|Vitality Lash|dp|2|Cantrip, Concentrate, Manipulate, Vitality|30 feet||1 undead creature|basic Fortitude||Vital energy deals 2d6 vitality damage to undead; on a critical failure it is enfeebled 1.|+1: damage increases by 1d6.
0|Void Warp|ado|2|Cantrip, Concentrate, Manipulate, Void|30 feet||1 living creature|basic Fortitude||Void energy deals 2d4 void damage; on a critical failure the target is enfeebled 1.|+1: damage increases by 1d4.
0|Puff of Poison|a|2|Cantrip, Concentrate, Manipulate, Poison|10 feet||1 creature|Fortitude||Poison deals 1d4 poison damage and 1d4 persistent poison damage.|+2: both damages increase by 1d4.
0|Bullhorn|ao|1|Auditory, Cantrip, Concentrate||||||Your voice carries to every creature within hearing range.|
`);

const RANK_1 = spells(`
1|Alarm|adop|10 minutes|Concentrate, Manipulate|touch|20-foot burst|||8 hours|A ward warns you when a creature enters the area.|3rd: can be set to ignore creatures.
1|Bless|do|2|Aura, Concentrate, Manipulate, Mental||15-foot emanation|||1 minute|You and allies gain a +1 status bonus to attack rolls; you can grow the aura.|
1|Breathe Fire|ap|2|Concentrate, Fire, Manipulate||15-foot cone||basic Reflex||A gout of flame deals 2d6 fire damage.|+1: damage increases by 2d6.
1|Charm|aop|2|Concentrate, Emotion, Incapacitation, Manipulate, Mental, Subtle|30 feet||1 creature|Will|1 hour|The target becomes friendly toward you (helpful on a critical failure).|4th: duration 1 day; 8th: duration 1 week and up to 10 targets.
1|Command|ado|2|Auditory, Concentrate, Linguistic, Manipulate, Mental|30 feet||1 creature|Will|until the end of the target’s next turn|Order a creature to approach, run, release, or drop prone.|5th: up to 10 creatures.
1|Dizzying Colors|ao|2|Concentrate, Illusion, Incapacitation, Manipulate, Visual||15-foot cone||Will|1 or more rounds|Swirling colours dazzle, blind or stun creatures.|
1|Enfeeble|ado|2|Concentrate, Manipulate|30 feet||1 creature|Fortitude|varies|Sap a creature’s strength, making it enfeebled 1 to 3.|
1|Fear|adop|2|Concentrate, Emotion, Fear, Manipulate, Mental|30 feet||1 creature|Will|varies|The target becomes frightened 1, 2 or 3 and may flee.|3rd: up to five targets.
1|Force Barrage|ao|1 to 3|Concentrate, Force, Manipulate|120 feet||1 or more creatures|||Fire one force shard per action spent, each dealing 1d4+1 force damage.|+2: one more shard per action.
1|Gentle Landing|adop|r|Concentrate|60 feet||1 falling creature||until it lands|The target falls slowly, taking no damage from the fall.|
1|Grease|ap|2|Concentrate, Manipulate|30 feet|4 contiguous 5-foot squares or 1 object||Reflex|1 minute|Coat an area or item in slippery grease that knocks creatures prone.|
1|Grim Tendrils|ao|2|Concentrate, Manipulate, Void|30 feet|30-foot line||basic Fortitude||Shadowy tendrils deal 2d4 void damage and 1 persistent bleed.|+1: damage increases by 2d4 and bleed by 1.
1|Gust of Wind|ap|2|Air, Concentrate, Manipulate||60-foot line||Fortitude||A blast of wind knocks creatures back and extinguishes flames.|
1|Harm|do|1 to 3|Manipulate, Void|touch or 30 feet||1 creature, or all in 30 feet with 3 actions|basic Fortitude||Void energy deals 1d8 void damage to the living or heals undead; 2 actions add +8, 3 actions an area.|+1: increases by 1d8 (and +8 for the 2-action version).
1|Heal|dp|1 to 3|Healing, Manipulate, Vitality|touch or 30 feet||1 creature, or all in 30 feet with 3 actions|||Vital energy heals the living 1d8 HP or damages undead; 2 actions add +8, 3 actions an area.|+1: increases by 1d8 (and +8 for the 2-action version).
1|Illusory Disguise|ao|2|Concentrate, Illusion, Manipulate, Visual||||| 1 hour|Change your appearance with an illusion.|3rd: you can also appear as a creature of a different form.
1|Illusory Object|ao|2|Concentrate, Illusion, Manipulate, Visual|500 feet|20-foot burst|||10 minutes|Create a convincing illusion of an object.|2nd: can add sound and smell.
1|Jump|ap|1|Move||||||Jump up to 30 feet.|3rd: you can jump each turn for a minute.
1|Leaden Steps|a|2|Concentrate, Manipulate, Metal|30 feet||1 creature|Fortitude|1 round|The target’s feet become heavy, slowing it and making it clumsy.|
1|Mystic Armor|ado|2|Concentrate, Manipulate|touch||1 creature||until your next daily preparations|Gain a +1 item bonus to AC and a maximum Dexterity cap of +5.|4th: also +1 to saves; 6th: +2 AC; 8th: +2 saves; 10th: +3 AC.
1|Phantom Pain|o|2|Concentrate, Illusion, Manipulate, Mental, Nonlethal|30 feet||1 creature|Will|1 minute|Deal 2d4 mental damage plus persistent mental damage; the target is sickened on a failure.|+1: damage increases by 2d4.
1|Runic Weapon|ao|1|Concentrate|touch||1 weapon||1 minute|The weapon becomes +1 striking.|
1|Sanctuary|do|2|Concentrate, Manipulate|touch||1 creature||1 minute|Creatures must succeed at a Will save to attack the target.|
1|Sleep|ao|2|Concentrate, Incapacitation, Manipulate, Mental, Sleep|30 feet|5-foot burst||Will||Creatures fall asleep or drowsy.|4th: more creatures, longer sleep.
1|Summon Animal|p|3|Concentrate, Manipulate, Summon|30 feet||||sustained up to 1 minute|Summon an animal of level -1 to fight for you.|+1: maximum creature level increases.
1|Sure Strike|ao|1|Concentrate, Fortune||||||Your next Strike this turn rolls twice and takes the higher result, ignoring concealment.|
1|Thunderstrike|ap|2|Concentrate, Electricity, Manipulate, Sonic|120 feet||1 creature|basic Reflex||A lightning bolt deals 1d12 electricity and 1d4 sonic damage.|+1: damage increases by 1d12 and 1d4.
1|Ventriloquism|ao|1|Auditory, Concentrate, Illusion||||| 10 minutes|Throw your voice anywhere you can see.|2nd: you can mimic other voices.
1|Pet Cache|aop|1|Concentrate, Manipulate|touch||1 animal companion or familiar||8 hours|Your companion hides in a pocket dimension.|
1|Soothe|do|2|Concentrate, Emotion, Healing, Manipulate, Mental|30 feet||1 willing living creature||1 minute|The target regains 1d10+4 HP and gains a +2 bonus against mental effects.|+1: healing increases by 1d10+4.
1|Tailwind|p|1|Concentrate, Manipulate|touch||1 creature||8 hours|The target gains a +10-foot status bonus to Speed.|2nd: duration 8 hours and more targets.
1|Animate Dead|ado|3|Concentrate, Manipulate|30 feet||||sustained up to 1 minute|Summon an undead creature of level -1.|+1: maximum level increases.
`);

const RANK_2 = spells(`
2|Acid Grip|ap|2|Acid, Concentrate, Manipulate|120 feet||1 creature|Reflex||An acid hand grabs a creature, dealing 2d8 acid damage and persistent acid.|+2: damage increases by 2d8.
2|Blur|ao|2|Concentrate, Illusion, Manipulate, Visual|touch||1 creature||1 minute|The target becomes concealed.|
2|Calm|dop|2|Concentrate, Emotion, Incapacitation, Manipulate, Mental|30 feet|10-foot burst||Will|1 minute|Suppress hostility and emotion effects.|
2|Cleanse Affliction|dop|2|Concentrate, Healing, Manipulate|touch||1 creature|||Reduce an affliction stage and suppress its effects.|3rd: attempt to counteract.
2|Darkness|adop|3|Concentrate, Darkness, Manipulate|120 feet|20-foot burst|||1 minute|Suppress all light in an area.|4th: even creatures with darkvision cannot see.
2|Darkvision|adop|2|Concentrate, Manipulate|touch||1 creature||1 hour|See in darkness.|3rd: duration 8 hours; 5th: until your next preparations.
2|Dispel Magic|adop|2|Concentrate, Manipulate|120 feet||1 spell effect or unattended item|||Attempt to counteract a spell or suppress a magic item.|
2|Embed Message|adop|1 minute|Concentrate, Manipulate|touch||1 object||unlimited|Store a message in an object that triggers on a condition.|
2|Enlarge|ap|2|Concentrate, Manipulate, Polymorph|30 feet||1 willing creature||5 minutes|The target becomes Large, gaining reach and +2 damage but clumsy 1.|4th: Huge size.
2|Entangling Flora|p|3|Concentrate, Manipulate, Plant|120 feet|all squares in a 20-foot burst||Reflex|1 minute|Plants grow, making difficult terrain and immobilizing creatures.|
2|Humanoid Form|aop|2|Concentrate, Manipulate, Polymorph|||||10 minutes|Take the form of a Small or Medium humanoid.|3rd: you can become Tiny or Large.
2|Invisibility|ao|2|Concentrate, Illusion, Manipulate, Subtle|touch||1 creature||10 minutes|The target becomes invisible until it uses a hostile action.|4th: 1 minute, but remains invisible after hostile actions.
2|Laughing Fit|ao|2|Concentrate, Emotion, Manipulate, Mental|30 feet||1 creature|Will|sustained up to 1 minute|The target is slowed 1 by uncontrollable laughter.|
2|Mirror Image|ao|2|Concentrate, Illusion, Manipulate, Visual|||||1 minute|Three illusory images make attacks against you likely to miss.|
2|Noise Blast|aop|2|Concentrate, Manipulate, Sonic|30 feet|10-foot burst||Fortitude||A burst of sound deals 2d10 sonic damage and can deafen.|+1: damage increases by 1d10.
2|Oaken Resilience|p|2|Concentrate, Manipulate, Plant, Wood|touch||1 creature||10 minutes|Gain resistance 2 to bludgeoning and piercing, but weakness 3 to fire.|+2: resistance and weakness increase.
2|Paranoia|ao|2|Concentrate, Emotion, Illusion, Manipulate, Mental|30 feet||1 creature|Will|1 minute|The target treats everyone as an enemy.|6th: up to five targets.
2|Peaceful Rest|ado|2|Concentrate, Manipulate|touch||1 corpse||1 week|Preserve a corpse from decay.|
2|Resist Energy|adop|2|Concentrate, Manipulate|touch||1 creature||10 minutes|Gain resistance 5 to one energy type.|4th: resistance 10 and two targets.
2|Revealing Light|adop|2|Concentrate, Light, Manipulate|120 feet|10-foot burst||Reflex|1 minute|Light reveals invisible creatures and makes them dazzled.|
2|See the Unseen|ado|2|Concentrate, Detection, Manipulate, Revelation|||||10 minutes|See invisible creatures as translucent shapes.|5th: emanation that reveals for allies.
2|Shrink|ap|2|Concentrate, Manipulate, Polymorph|30 feet||1 willing creature||5 minutes|The target becomes Tiny.|6th: up to 10 targets.
2|Silence|do|2|Concentrate, Illusion, Manipulate|touch||1 creature||1 minute|The target makes no sound.|4th: it creates a 10-foot emanation of silence.
2|Spiritual Armament|do|2|Concentrate, Manipulate, Sanctified, Spirit|120 feet||||sustained up to 1 minute|Create a spectral weapon that Strikes for 2d8 spirit damage.|+2: damage increases by 1d8.
2|Telekinetic Maneuver|ao|2|Concentrate, Force, Manipulate|60 feet||1 creature|||Disarm, Reposition, Shove or Trip a creature with your spell attack.|
2|Translate|ado|1|Concentrate, Manipulate|touch||1 creature||1 hour|Understand one language.|3rd: also speak it.
2|Water Breathing|adop|2|Concentrate, Manipulate|30 feet||up to 5 creatures||1 hour|Targets can breathe underwater.|3rd: duration 8 hours.
2|Web|ap|2|Concentrate, Manipulate|30 feet|10-foot burst||Reflex|1 minute|Sticky webs immobilize creatures and make difficult terrain.|4th: larger area.
`);

const RANK_3 = spells(`
3|Aqueous Orb|ap|2|Concentrate, Manipulate, Water|60 feet||||sustained up to 1 minute|Roll a 10-foot orb of water that engulfs creatures.|
3|Blindness|adop|2|Concentrate, Incapacitation, Manipulate|30 feet||1 creature|Fortitude|varies|The target becomes blinded for 1 round, 1 minute or permanently.|
3|Chilling Darkness|ad|2|Cold, Concentrate, Darkness, Manipulate|120 feet||1 creature|||Spell attack for 5d6 cold damage, extra spirit damage to holy creatures, and counteracts light.|+1: damage increases by 2d6.
3|Clairaudience|ado|3|Concentrate, Manipulate, Scrying|500 feet||||10 minutes|Hear through an invisible magical ear.|
3|Cozy Cabin|aop|1 minute|Concentrate, Manipulate|touch|20-foot burst|||12 hours|Create a comfortable shelter.|
3|Earthbind|adp|2|Concentrate, Manipulate|120 feet||1 flying creature|Fortitude|1 round|Pull a flying creature to the ground.|
3|Feet to Fins|ap|2|Concentrate, Manipulate, Morph|touch||1 creature||10 minutes|The target gains a swim Speed but a land Speed of 5 feet.|6th: duration 1 hour.
3|Fireball|ap|2|Concentrate, Fire, Manipulate|500 feet|20-foot burst||basic Reflex||A burst of flame deals 6d6 fire damage.|+1: damage increases by 2d6.
3|Haste|ao|2|Concentrate, Manipulate|30 feet||1 creature||1 minute|The target is quickened, using the action only to Strike or Stride.|7th: up to six targets.
3|Heroism|do|2|Concentrate, Manipulate, Mental|touch||1 creature||10 minutes|The target gains a +1 status bonus to attacks, Perception, saves and skill checks.|6th: +2; 9th: +3.
3|Insect Form|p|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become a Medium insect battle form.|4th: larger forms.
3|Lightning Bolt|ap|2|Concentrate, Electricity, Manipulate||120-foot line||basic Reflex||A bolt deals 4d12 electricity damage.|+1: damage increases by 1d12.
3|Locate|ado|2|Concentrate, Detection, Manipulate|500 feet||1 object||sustained up to 1 hour|Find the direction of an object.|5th: find a creature.
3|Paralyze|ao|2|Concentrate, Incapacitation, Manipulate, Mental|30 feet||1 creature|Will|varies|The target becomes paralyzed.|7th: up to 10 creatures.
3|Slow|ao|2|Concentrate, Manipulate|30 feet||1 creature|Fortitude|1 minute|The target becomes slowed 1 (2 on a critical failure).|6th: up to 10 creatures.
3|Stinking Cloud|ap|2|Concentrate, Manipulate, Poison|60 feet|20-foot burst||Fortitude|1 minute|A noxious cloud makes creatures sickened and slowed.|
3|Wall of Thorns|p|3|Concentrate, Manipulate, Plant|60 feet|60-foot wall|||1 minute|A wall of thorns damages creatures that pass through.|+1: damage increases.
3|Vampiric Feast|ado|2|Concentrate, Death, Manipulate, Void|touch||1 living creature|basic Fortitude||Deal 6d6 void damage and gain temporary HP equal to half.|+1: damage increases by 2d6.
3|Dream Message|ado|1 minute|Concentrate, Manipulate, Mental|planetary||1 creature|||Send a message that arrives in the target’s dreams.|4th: up to 10 targets.
3|Crashing Wave|ap|2|Concentrate, Manipulate, Water||15-foot cone||basic Reflex||A wave deals 6d6 bludgeoning damage and pushes creatures.|+1: damage increases by 2d6.
3|Ghostly Weapon|ao|2|Concentrate, Manipulate|touch||1 weapon||5 minutes|The weapon can affect incorporeal creatures.|
3|Organsight|ao|1|Concentrate, Detection, Revelation|||||sustained up to 1 minute|See weaknesses in organs to deal extra precision damage.|
`);

const RANK_4 = spells(`
4|Clairvoyance|ado|3|Concentrate, Manipulate, Scrying|500 feet||||1 minute|See through an invisible magical eye.|
4|Confusion|ao|2|Concentrate, Emotion, Manipulate, Mental|30 feet||1 creature|Will|1 minute|The target becomes confused.|8th: up to 10 creatures.
4|Containment|ao|3|Concentrate, Force, Manipulate|30 feet||1 creature|Reflex|1 minute|A sphere of force traps the target.|
4|Dimension Door|ao|1|Concentrate, Teleportation|120 feet||||| Teleport yourself to a space you can see.|5th: range 1 mile.
4|Divine Wrath|d|2|Concentrate, Manipulate, Sanctified, Spirit|120 feet|20-foot burst||Fortitude||Deal 4d10 spirit damage to creatures that oppose your sanctification and sicken them.|+1: damage increases by 1d10.
4|Fire Shield|ap|2|Concentrate, Fire, Manipulate|||||1 minute|Flames protect you, granting cold resistance and burning those who hit you.|+2: resistance and damage increase.
4|Fly|ao|2|Concentrate, Manipulate|touch||1 creature||5 minutes|The target gains a fly Speed equal to its land Speed.|7th: 1 hour.
4|Gaseous Form|ao|2|Concentrate, Manipulate, Polymorph|touch||1 willing creature||5 minutes|Become a mist that can fly slowly and is immune to most damage.|
4|Mountain Resilience|ap|2|Concentrate, Earth, Manipulate|touch||1 creature||20 minutes|Gain resistance 5 to physical damage except adamantine, but weakness 3 to sonic.|+2: resistance and weakness increase.
4|Peaceful Bubble|dop|1 minute|Concentrate, Manipulate||10-foot burst|||8 hours|A bubble shields those within, letting them rest safely.|
4|Read Omens|do|10 minutes|Concentrate, Manipulate, Prediction||||||Gain a cryptic piece of advice about an upcoming event.|
4|Shape Stone|aop|2|Concentrate, Earth, Manipulate|touch||cube of stone 10 feet across|||Reshape stone into any shape.|
4|Solid Fog|ap|3|Concentrate, Manipulate, Water|120 feet|20-foot burst|||1 minute|Fog that conceals and slows creatures.|
4|Suggestion|ao|2|Concentrate, Incapacitation, Linguistic, Manipulate, Mental|30 feet||1 creature|Will|varies|The target follows a reasonable suggestion.|8th: up to 10 creatures.
4|Translocate|ao|2|Concentrate, Manipulate, Teleportation|120 feet||||| Teleport yourself to a space within range.|5th: range 1 mile.
4|Unfettered Movement|dop|2|Concentrate, Manipulate|touch||1 creature||10 minutes|The target ignores effects that impede its movement.|
4|Vital Beacon|dop|1 minute|Concentrate, Healing, Manipulate, Vitality||||| until your next daily preparations|Radiate vitality that heals creatures that touch you.|+1: healing increases.
4|Wall of Fire|ap|3|Concentrate, Fire, Manipulate|120 feet|60-foot line or 10-foot ring|||1 minute|A wall of fire deals 4d6 fire damage to creatures that pass through.|+1: damage increases by 1d6.
4|Weapon Storm|ap|2|Concentrate, Manipulate|30 feet|30-foot cone or 10-foot emanation||basic Reflex||A held weapon multiplies to strike all creatures in the area.|+1: damage increases by one weapon die.
4|Variable Gravity|ao|2|Concentrate, Manipulate|30 feet||up to 5 creatures|Fortitude|1 minute|Make gravity heavier or lighter for the targets.|
4|Planar Tether|ado|2|Concentrate, Manipulate|30 feet||1 creature|Will|sustained up to 1 minute|Prevent a creature from teleporting or leaving the plane.|
`);

const RANK_5 = spells(`
5|Banishment|ado|2|Concentrate, Incapacitation, Manipulate|30 feet||1 creature|Will||Send an extraplanar creature back to its home plane.|9th: up to 10 creatures.
5|Black Tentacles|ao|3|Concentrate, Manipulate|120 feet|20-foot burst||Reflex|1 minute|Tentacles grab creatures in the area, dealing bludgeoning damage.|
5|Breath of Life|d|r|Healing, Vitality|60 feet||1 creature that just died|||Return a creature that died this round to life.|
5|Cone of Cold|ap|2|Cold, Concentrate, Manipulate||60-foot cone||basic Reflex||Frost deals 12d6 cold damage.|+1: damage increases by 2d6.
5|Control Water|ap|2|Concentrate, Manipulate, Water|500 feet|50-foot by 50-foot area|||1 hour|Raise or lower water in a large area.|
5|Death Ward|dop|2|Concentrate, Manipulate|touch||1 creature||10 minutes|Gain a +2 status bonus against death and void effects and void resistance 10.|
5|Elemental Form|ap|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become an elemental battle form.|6th: larger forms.
5|Hallucination|ao|2|Concentrate, Illusion, Manipulate, Mental|30 feet||1 creature|Will|1 hour|The target sees an illusion you choose.|6th: up to 10 creatures.
5|Howling Blizzard|ap|2|Cold, Concentrate, Manipulate||60-foot cone||basic Reflex||A blizzard deals 10d6 cold damage.|+1: damage increases by 2d6.
5|Illusory Scene|ao|10 minutes|Concentrate, Illusion, Manipulate|500 feet|30-foot burst|||1 hour|Create a convincing illusory scene.|
5|Mariner’s Curse|dop|2|Concentrate, Curse, Manipulate|touch||1 creature|Will|permanent|The target becomes sick at sea and cannot move well in water.|
5|Moon Frenzy|p|2|Concentrate, Manipulate, Morph|30 feet||up to 5 willing creatures||1 minute|Targets gain claws, temporary HP and bonuses but weakness to silver.|
5|Plant Form|p|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become a Large plant battle form.|
5|Resurrect|d|10 minutes|Concentrate, Healing, Manipulate|touch||1 dead creature|||Return a dead creature to life with drawbacks.|
5|Sending|ado|1 minute|Concentrate, Manipulate, Mental|planetary||1 creature|||Send a short message to a creature you know.|
5|Shadow Siphon|ao|r|Concentrate, Illusion, Shadow|60 feet||||| Counteract a spell, reducing its damage by half.|
5|Synesthesia|o|2|Concentrate, Manipulate, Mental|30 feet||1 creature|Will|1 minute|Scramble a creature’s senses, giving it penalties.|9th: up to 5 creatures.
5|Telekinetic Haul|ao|2|Concentrate, Manipulate|120 feet||1 object||sustained up to 1 minute|Move a heavy object.|
5|Toxic Cloud|ap|3|Concentrate, Manipulate, Poison|120 feet|10-foot burst||basic Fortitude|1 minute|A poison cloud deals 6d8 poison damage.|+1: damage increases by 1d8.
5|Wall of Ice|ap|3|Cold, Concentrate, Manipulate, Water|120 feet|60-foot line or 10-foot hemisphere|||1 minute|Create a wall of ice.|
5|Wall of Stone|ap|3|Concentrate, Earth, Manipulate|120 feet|120-foot line|||| Create a permanent wall of stone.|
5|Summon Dragon|a|3|Concentrate, Manipulate, Summon|30 feet||||sustained up to 1 minute|Summon a dragon of level 5 or lower.|+1: maximum level increases.
`);

const RANK_6 = spells(`
6|Chain Lightning|ap|2|Concentrate, Electricity, Manipulate|500 feet||1 creature and others nearby|basic Reflex||Lightning jumps between creatures, dealing 8d12 electricity damage.|+1: damage increases by 1d12.
6|Collective Transposition|ao|2|Concentrate, Manipulate, Teleportation|30 feet||up to 2 creatures|||Teleport creatures to new locations.|+1: one more target.
6|Disintegrate|a|2|Concentrate, Manipulate|120 feet||1 creature or object|basic Fortitude||Spell attack: a ray deals 12d10 damage and can reduce a creature to dust.|+1: damage increases by 2d10.
6|Dragon Form|ap|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become a Large dragon battle form.|8th: Huge form.
6|Field of Life|dp|2|Concentrate, Healing, Manipulate, Vitality|30 feet|20-foot burst|||sustained up to 1 minute|Creatures in the area regain HP each turn.|
6|Petrify|ao|2|Concentrate, Manipulate|30 feet||1 creature|Fortitude|varies|The target turns to stone.|
6|Phantasmal Calamity|ao|2|Concentrate, Illusion, Manipulate, Mental|500 feet|30-foot burst||basic Will||Illusory disaster deals 11d6 mental damage and may stun.|+1: damage increases by 2d6.
6|Repulsion|ado|2|Aura, Concentrate, Manipulate, Mental|20-foot emanation||||1 minute|Creatures cannot approach you.|
6|Spellwrack|ao|2|Concentrate, Curse, Force, Manipulate|30 feet||1 creature|Will|1 minute|Spells on the target cause it force damage.|
6|Teleport|ao|10 minutes|Concentrate, Manipulate, Teleportation|100 miles||you and up to 4 willing creatures|||Teleport to a familiar location.|7th: range 1,000 miles.
6|Truesight|ado|2|Concentrate, Detection, Manipulate, Revelation|||||10 minutes|See through illusions and invisibility.|
6|Vampiric Exsanguination|ado|2|Concentrate, Death, Manipulate, Void||30-foot cone||basic Fortitude||Drain blood from creatures, dealing 12d6 void damage and gaining temporary HP.|+1: damage increases by 2d6.
6|Vibrant Pattern|ao|3|Concentrate, Illusion, Incapacitation, Manipulate, Visual|120 feet|10-foot burst||Will|sustained up to 1 minute|A pattern of colours dazzles and blinds creatures.|
6|Wall of Force|ao|3|Concentrate, Force, Manipulate|30 feet|50-foot line|||1 minute|Create an invisible wall of force.|
6|Zealous Conviction|do|2|Concentrate, Emotion, Manipulate, Mental|30 feet||up to 10 creatures||10 minutes|Allies gain temporary HP and a bonus against mental effects.|
6|Baleful Polymorph|aop|2|Concentrate, Incapacitation, Manipulate, Polymorph|30 feet||1 creature|Will|varies|Transform a creature into a harmless animal.|
`);

const RANK_7 = spells(`
7|Contingency|a|10 minutes|Concentrate, Manipulate|||||1 day|Store a spell that triggers when a condition is met.|
7|Duplicate Foe|a|2|Concentrate, Manipulate|30 feet||1 creature|Fortitude|sustained up to 1 minute|Create a temporary duplicate of an enemy that fights for you.|
7|Eclipse Burst|ado|2|Cold, Concentrate, Darkness, Manipulate|500 feet|60-foot burst||basic Reflex||A sphere of darkness deals 8d10 cold damage and extra spirit damage to holy foes.|+1: damage increases by 1d10.
7|Energy Aegis|adop|2|Concentrate, Manipulate|touch||1 creature||24 hours|Gain resistance 5 to acid, cold, electricity, fire, force, sonic, vitality and void.|9th: resistance 10.
7|Fiery Body|ap|2|Concentrate, Fire, Manipulate, Polymorph|||||1 minute|Your body becomes flame, granting fire immunity and fire attacks.|9th: more damage.
7|Interplanar Teleport|ado|10 minutes|Concentrate, Manipulate, Teleportation|touch||you and up to 4 creatures|||Teleport to another plane.|
7|Mask of Terror|ao|2|Concentrate, Emotion, Fear, Illusion, Manipulate, Mental|30 feet||1 creature||1 minute|The target appears terrifying, frightening foes who attack it.|8th: up to 5 targets.
7|Power Word Blind|ao|1|Concentrate, Linguistic, Manipulate|30 feet||1 creature|||Blind a creature for a duration based on its level.|
7|Prismatic Spray|a|2|Concentrate, Manipulate||60-foot cone||Reflex||Rays of colour deal different damage and effects.|
7|Regenerate|dp|2|Concentrate, Healing, Manipulate|touch||1 creature||1 minute|The target gains fast healing 15 and regrows lost limbs.|9th: fast healing 20.
7|Sunburst|dp|2|Concentrate, Fire, Light, Manipulate, Vitality|500 feet|60-foot burst||Reflex||Sunlight deals 8d10 fire damage and vitality damage to undead.|+1: damage increases by 1d10.
7|Visions of Danger|ao|3|Auditory, Concentrate, Illusion, Manipulate, Visual|500 feet|30-foot burst|||1 minute|Illusory creatures damage those who believe them.|
7|Warp Mind|ao|2|Concentrate, Emotion, Incapacitation, Manipulate, Mental|120 feet||1 creature|Will|varies|Confuse a creature permanently on a critical failure.|
7|Divine Decree|d|2|Concentrate, Manipulate, Sanctified, Spirit|40 feet||all creatures|Fortitude||Deal 7d10 spirit damage and possibly banish foes of opposed sanctification.|+1: damage increases by 1d10.
7|Volcanic Eruption|p|2|Concentrate, Fire, Manipulate|120 feet|5-foot radius, 80-foot tall cylinder||basic Reflex||Lava erupts for 14d6 fire damage.|+1: damage increases by 2d6.
7|Entwined Roots|p|3|Concentrate, Manipulate, Plant, Wood|120 feet|20-foot burst||Reflex|1 minute|Roots restrain creatures and block movement.|
`);

const RANK_8 = spells(`
8|Desiccate|ap|2|Concentrate, Manipulate, Void|500 feet|30-foot burst||basic Fortitude||Draw out moisture to deal 10d10 void damage, more to water and plant creatures.|+1: damage increases by 1d10.
8|Dream Council|ado|10 minutes|Concentrate, Manipulate, Mental|planetary||up to 12 creatures||sustained up to 1 hour|Communicate through dreams with several creatures.|
8|Earthquake|dp|2|Concentrate, Earth, Manipulate|500 feet|60-foot burst|||1 round|The ground shakes, knocking creatures prone and collapsing structures.|10th: larger area.
8|Falling Sky|ap|2|Concentrate, Manipulate|500 feet|30-foot burst||basic Reflex||Lumps of stone crash down for heavy damage.|
8|Mind Blank|ao|2|Concentrate, Manipulate|touch||1 creature||until your next daily preparations|Protect against mental effects and detection.|
8|Moment of Renewal|dop|2|Concentrate, Healing, Manipulate|touch||up to 6 creatures|||Targets gain the benefits of a full day of rest.|
8|Monstrosity Form|ap|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become a Huge monster battle form.|9th: stronger.
8|Polar Ray|ap|2|Cold, Concentrate, Manipulate|500 feet||1 creature|||Spell attack: a ray deals 10d8 cold damage and drains the target.|+1: damage increases by 2d8.
8|Power Word Stun|ao|1|Concentrate, Linguistic, Manipulate|30 feet||1 creature|||Stun a creature based on its level.|
8|Quandary|ao|2|Concentrate, Manipulate|60 feet||1 creature|Will|sustained up to 1 minute|Trap a creature in an extradimensional puzzle.|
8|Scintillating Pattern|ao|3|Concentrate, Illusion, Incapacitation, Manipulate, Visual|120 feet|20-foot burst||Will|sustained up to 1 minute|A pattern of colours confuses and stuns creatures.|
8|Spirit Song|o|2|Concentrate, Manipulate|||60-foot cone|basic Fortitude||A haunting song deals 18d6 spirit damage.|+1: damage increases by 2d6.
8|Unrelenting Observation|ao|1 minute|Concentrate, Manipulate, Scrying|100 feet||1 creature or object||1 hour|Observe a target wherever it moves.|
8|Wind Walk|p|10 minutes|Air, Concentrate, Manipulate|touch||up to 10 creatures||8 hours|Become clouds that move swiftly.|
8|Divine Inspiration|do|3|Concentrate, Manipulate, Mental|touch||1 creature|||The target regains an expended spell slot of 6th rank or lower.|
8|Maze|ao|2|Concentrate, Manipulate|30 feet||1 creature||sustained up to 1 minute|Trap a creature in an extradimensional maze.|
`);

const RANK_9 = spells(`
9|Foresight|ado|1 minute|Concentrate, Manipulate, Prediction|touch||1 creature||1 hour|The target senses danger, gaining a bonus to a roll once per round.|
9|Implosion|a|2|Concentrate, Manipulate|30 feet||1 creature|basic Fortitude|sustained up to 1 minute|Crush a creature for 75 damage.|+1: damage increases by 10.
9|Massacre|ado|2|Concentrate, Death, Manipulate, Void||60-foot line||Fortitude||Slay creatures of 17th level or lower, or deal 100 void damage.|10th: slays up to 19th level.
9|Metamorphosis|ap|2|Concentrate, Manipulate, Polymorph|||||1 minute|Take any battle form of 8th rank or lower.|
9|Overwhelming Presence|do|2|Auditory, Concentrate, Incapacitation, Manipulate, Mental, Visual||40-foot burst||Will|sustained up to 1 minute|Creatures must pay homage to you.|
9|Power Word Kill|ao|1|Concentrate, Death, Linguistic, Manipulate|30 feet||1 creature|||Kill a creature of 14th level or lower.|
9|Prismatic Shield|a|2|Concentrate, Manipulate|||||1 minute|A shield of colours grants resistance and AC.|
9|Telepathic Demand|o|2|Concentrate, Incapacitation, Linguistic, Manipulate, Mental|planetary||1 creature|Will|varies|Send a mental command that the target must obey.|
9|Storm of Vengeance|dp|2|Air, Concentrate, Electricity, Manipulate|800 feet|360-foot burst|||sustained up to 1 minute|A storm unleashes destructive effects.|
9|Unfathomable Song|o|2|Auditory, Concentrate, Manipulate, Mental|120 feet||up to 5 creatures|Will|sustained up to 1 minute|A song causes random negative effects.|
9|Voracious Gestalt|a|2|Concentrate, Manipulate|120 feet||1 creature|basic Fortitude||Create a hungry swarm that devours a creature.|
9|Wails of the Damned|do|2|Auditory, Concentrate, Death, Manipulate, Void||40-foot emanation||basic Fortitude||Unearthly wails deal 10d10 void damage and drain foes.|+1: damage increases by 1d10.
9|Wrathful Storm|p|2|Air, Concentrate, Manipulate|500 feet|60-foot burst|||sustained up to 1 minute|A storm strikes foes with wind and lightning.|
`);

const RANK_10 = spells(`
10|Alter Reality|o|3|Concentrate, Manipulate|||||| Duplicate any occult spell of 9th rank or lower, or rewrite reality on a smaller scale.|
10|Cataclysm|ap|3|Concentrate, Manipulate|1,000 feet|60-foot burst||basic Reflex||Unleash a disaster dealing 3d10 damage of many types.|
10|Fabricated Truth|o|3|Concentrate, Incapacitation, Manipulate, Mental|100 feet||up to 5 creatures|Will|varies|Convince creatures of a falsehood permanently.|
10|Gate|adop|3|Concentrate, Manipulate, Teleportation|120 feet||||sustained up to 1 minute|Open a portal to another plane.|
10|Manifestation|o|3|Concentrate, Manipulate|||||| Duplicate any occult spell of 9th rank or lower.|
10|Miracle|d|3|Concentrate, Manipulate|||||| Duplicate any divine spell of 9th rank or lower, or ask your deity for aid.|
10|Primal Phenomenon|p|3|Concentrate, Manipulate|||||| Duplicate any primal spell of 9th rank or lower.|
10|Remake|adop|1 hour|Concentrate, Manipulate|5 feet||||| Recreate a destroyed object.|
10|Revival|dop|3|Concentrate, Healing, Manipulate, Vitality|60 feet||any number of creatures|||Restore HP and raise recently dead creatures.|
10|Time Stop|ao|3|Concentrate, Manipulate|||||| Stop time for 3 rounds for everyone but you.|
10|Wish|a|3|Concentrate, Manipulate|||||| Duplicate any arcane spell of 9th rank or lower, or alter reality.|
10|Avatar|d|2|Concentrate, Manipulate, Polymorph|||||1 minute|Become an avatar of your deity.|
10|Indestructibility|adop|1|Concentrate|||||until the end of your next turn|You are immune to all damage and harm.|
`);

/* ------------------------------------------------------------- Focus spells */

const FOCUS = [
  ...spells(`
0|Courageous Anthem|o|1|Bard, Cantrip, Composition, Concentrate, Emotion, Mental||60-foot emanation|||1 round|You and allies gain a +1 status bonus to attacks, damage and saves against fear.|
0|Counter Performance|o|r|Bard, Composition, Concentrate, Fortune, Mental||60-foot emanation|||| Roll Performance in place of a save against an auditory or visual effect for allies.|
1|Rallying Anthem|o|1|Bard, Cantrip, Composition, Concentrate, Emotion, Mental||60-foot emanation|||1 round|Allies gain a +1 status bonus to AC and saves.|
1|Hymn of Healing|o|2|Bard, Composition, Concentrate, Healing, Manipulate|30 feet||1 creature||sustained up to 4 rounds|An ally gains fast healing 2 and temporary HP.|+1: fast healing and temporary HP increase by 2.
1|Lingering Composition|o|f|Bard, Concentrate, Spellshape||||| | Your next composition cantrip lasts 3 rounds (4 on a critical success).|
0|Uplifting Overture|o|1|Bard, Cantrip, Composition, Concentrate, Emotion, Mental|60 feet||1 ally||1 round|The ally gains a bonus to a skill check.|
0|Dirge of Doom|o|1|Bard, Cantrip, Composition, Concentrate, Emotion, Fear, Mental||30-foot emanation|||1 round|Foes become frightened 1.|
0|Triple Time|o|1|Bard, Cantrip, Composition, Concentrate, Emotion, Mental||60-foot emanation|||1 round|Allies gain a +10-foot status bonus to Speed.|
0|Song of Marching|o|1 minute|Bard, Cantrip, Composition, Concentrate||||||Allies Hustle as long as you can.|
4|Fortissimo Composition|o|f|Bard, Concentrate, Spellshape||||||Your courageous anthem grants a higher bonus.|
`, 'bard'),
  ...spells(`
1|Fire Ray|d|2|Cleric, Concentrate, Fire, Manipulate|60 feet||1 creature|||Spell attack: a ray deals 2d6 fire damage and persistent fire on a critical.|+1: damage increases by 2d6.
1|Healer’s Blessing|d|1|Cleric, Concentrate, Healing|30 feet||1 willing living creature||1 minute|Your healing spells heal the target more.|
1|Cry of Destruction|d|2|Cleric, Concentrate, Manipulate, Sonic||15-foot cone||basic Fortitude||A shout deals 1d8 sonic damage, more if you damaged a foe this turn.|+1: damage increases by 1d8.
1|Death’s Call|d|f|Cleric, Concentrate, Healing|||||| When a creature dies near you, gain temporary HP.|
1|Agile Feet|d|1|Cleric, Concentrate|||||| Gain a +5 status bonus to Speed and ignore difficult terrain.|
1|Bit of Luck|d|1|Cleric, Concentrate, Fortune|30 feet||1 creature||1 minute|The target rolls twice on one save and takes the better result.|
1|Moonbeam|d|2|Cleric, Concentrate, Fire, Light, Manipulate|120 feet||1 creature|||Spell attack: moonlight deals 1d6 fire damage and dazzles.|+1: damage increases by 1d6.
1|Word of Truth|d|1|Cleric, Concentrate, Linguistic||||||Glow to prove you speak the truth.|
1|Tidal Surge|d|1|Cleric, Concentrate, Manipulate, Water|60 feet||1 creature|||Water moves a creature 5 feet.|
`, 'cleric'),
  ...spells(`
1|Lay on Hands|d|1|Champion, Healing, Manipulate, Vitality|touch||1 willing living creature or 1 undead|basic Fortitude||Heal an ally 6 HP (and give +1 AC) or deal 1d6 vitality damage to undead.|+1: healing increases by 6, damage by 1d6.
1|Touch of the Void|d|1|Champion, Manipulate, Void|touch||1 creature|basic Fortitude||Deal 1d6 void damage to a living creature or heal undead.|+1: damage increases by 1d6.
1|Shields of the Spirit|d|1|Aura, Champion, Concentrate|||||1 minute|Allies in your aura gain a +1 status bonus to AC.|
4|Champion’s Sacrifice|d|r|Champion, Concentrate|30 feet||1 ally|||Take the damage or effect an ally would suffer instead.|
`, 'champion'),
  ...spells(`
1|Heal Animal|p|1 to 2|Druid, Healing, Manipulate, Vitality|30 feet||1 animal|||Heal an animal 1d8 HP (+8 with 2 actions).|+1: increases by 1d8 and 8.
1|Cornucopia|p|2|Druid, Concentrate, Manipulate, Plant|touch||||10 minutes|Grow fruit that heals 1d6+4 HP when eaten.|+2: healing increases.
1|Tempest Surge|p|2|Druid, Concentrate, Electricity, Manipulate|30 feet||1 creature|basic Reflex||Lightning deals 1d12 electricity damage and makes the target clumsy.|+1: damage increases by 1d12.
1|Untamed Shift|p|1|Druid, Concentrate, Morph|||||1 minute|Gain claws or another bestial feature.|
2|Untamed Form|p|2|Druid, Concentrate, Manipulate, Polymorph|||||1 minute|Transform into an animal battle form.|+1: more forms.
2|Wildfire|p|2|Druid, Concentrate, Fire, Manipulate|30 feet|10-foot burst||basic Reflex||A wildfire burns creatures, leaving difficult terrain.|+1: damage increases.
3|Stormwind Flight|p|2|Druid, Air, Concentrate, Manipulate|||||1 minute|Gain a fly Speed.|
`, 'druid'),
  ...spells(`
1|Qi Rush|d|1|Monk, Concentrate||||||Move up to twice and gain concealment.|
1|Inner Upheaval|d|1|Monk, Concentrate|||||| Make a Flurry of Blows that deals extra damage.|+1: damage increases.
1|Wholeness of Body|d|1|Healing, Monk, Concentrate||||||Regain 8 HP or attempt to counteract a poison.|+1: healing increases by 8.
3|Abundant Step|d|1|Monk, Concentrate, Teleportation||||||Teleport up to your Speed.|
3|Qi Blast|d|2|Force, Monk, Concentrate||15-foot cone||basic Fortitude||Unleash force that deals 2d6 force damage.|+1: damage increases by 1d6.
4|Wind Jump|d|1|Air, Monk, Concentrate||||||Leap through the air.|
`, 'monk'),
  ...spells(`
1|Dragon Claws|a|1|Concentrate, Morph, Sorcerer|||||1 minute|Grow claws and resist energy.|
1|Angelic Halo|d|1|Aura, Concentrate, Sorcerer||15-foot emanation|||1 minute|Allies regain more HP from healing.|
1|Glutton’s Jaw|d|1|Concentrate, Morph, Sorcerer|||||1 minute|Grow a hungry maw.|
1|Faerie Dust|p|2|Concentrate, Manipulate, Sorcerer|30 feet|10-foot burst||Will|1 round|Dust makes creatures unable to react and gives a penalty.|
1|Elemental Toss|p|1|Concentrate, Manipulate, Sorcerer|30 feet||1 creature|||Spell attack: hurl an element for 1d8 damage.|+1: damage increases by 1d8.
1|Tentacular Limbs|o|1|Concentrate, Morph, Sorcerer|||||1 minute|Your arms become tentacles.|
1|Jealous Hex|o|1|Concentrate, Curse, Manipulate, Sorcerer|30 feet||1 creature|Will|1 round|Curse a creature with a weakness to your foes.|
1|Undeath’s Blessing|d|1|Concentrate, Sorcerer|||||1 minute|Gain undead-like resilience.|
1|Ancestral Memories|a|1|Concentrate, Sorcerer||||||Become trained in a skill.|
1|Diabolic Edict|d|1|Concentrate, Linguistic, Mental, Sorcerer|30 feet||1 creature||1 round|Command a creature to perform a task.|
`, 'sorcerer'),
  ...spells(`
1|Force Bolt|a|1|Concentrate, Force, Manipulate, Wizard|30 feet||1 creature|||A bolt of force deals 1d4+1 force damage.|+2: damage increases by 1d4+1.
1|Charming Push|a|1|Concentrate, Incapacitation, Manipulate, Mental, Wizard|30 feet||1 creature|Will|1 round|The target cannot attack you.|
1|Protective Wards|a|1|Aura, Concentrate, Manipulate, Wizard||5-foot emanation|||1 minute|You and allies gain a bonus to AC.|
1|Fortify Summoning|a|1|Concentrate, Manipulate, Wizard|||||| A summoned creature gains bonuses.|
1|Earthworks|a|1|Concentrate, Earth, Manipulate, Wizard|60 feet|5-foot burst|||1 minute|Create difficult terrain.|
1|Scramble Body|a|1|Concentrate, Manipulate, Wizard|30 feet||1 creature|Fortitude|1 round|The target becomes sickened.|
1|Hand of the Apprentice|a|1|Concentrate, Manipulate, Wizard|500 feet||1 creature|||Throw your weapon with a spell attack.|
`, 'wizard'),
  ...spells(`
0|Evil Eye|o|1|Cantrip, Curse, Hex, Manipulate, Mental, Witch|30 feet||1 creature|Will|sustained|The target becomes frightened 1.|
0|Clinging Ice|p|1|Cantrip, Cold, Hex, Manipulate, Witch|30 feet||1 creature|Reflex|sustained|Ice slows the target and deals cold damage.|
0|Nudge Fate|o|1|Cantrip, Hex, Manipulate, Witch|30 feet||1 creature|||Grant a bonus to a check.|
0|Shroud of Night|o|1|Cantrip, Darkness, Hex, Manipulate, Witch|30 feet||1 creature|Will|sustained|Make a creature unable to see.|
0|Stoke the Heart|d|1|Cantrip, Emotion, Hex, Manipulate, Mental, Witch|30 feet||1 creature||sustained|Grant an ally a bonus to damage.|
0|Discern Secrets|a|1|Cantrip, Hex, Manipulate, Witch|30 feet||1 creature||sustained|Gain a bonus to Recall Knowledge or Seek.|
0|Wilding Word|p|1|Cantrip, Hex, Manipulate, Witch|30 feet||1 creature||sustained|Prevent animals or plants from attacking.|
1|Cackle|o|f|Hex, Witch||||||Sustain a hex as a free action.|
1|Phase Familiar|o|r|Hex, Manipulate, Witch|60 feet||1 familiar|||Make your familiar incorporeal to avoid damage.|
1|Patron’s Puppet|o|r|Hex, Witch|30 feet||1 familiar|||Command your familiar to move.|
`, 'witch'),
  ...spells(`
1|Ancestral Touch|d|1|Oracle, Cursebound, Concentrate|||||1 minute|Your unarmed attacks deal mental damage.|
1|Call to Arms|d|1|Oracle, Cursebound, Concentrate|||||1 minute|Gain bonuses to attacks.|
1|Soul Siphon|d|1|Oracle, Cursebound, Manipulate, Void|30 feet||1 creature|||Drain a creature’s soul.|
1|Interstellar Void|d|2|Oracle, Cold, Cursebound, Manipulate|30 feet||1 creature|basic Fortitude||Cold void energy deals 3d6 cold damage.|+1: damage increases by 2d6.
1|Incendiary Aura|d|1|Oracle, Aura, Cursebound, Fire||10-foot emanation|||1 minute|Foes take fire damage.|
1|Life Link|d|1|Oracle, Cursebound, Healing, Manipulate|30 feet||1 creature||10 minutes|Heal an ally over time.|
1|Brain Drain|d|1|Oracle, Cursebound, Manipulate|30 feet||1 creature|Will||Drain knowledge from a creature.|
1|Tempest Touch|d|1|Oracle, Cold, Cursebound, Manipulate, Water|touch||1 creature|||Deal cold damage and make the target clumsy.|
`, 'oracle'),
  ...spells(`
1|Ephemeral Tracking|p|1|Ranger, Concentrate||||||Track a creature through any terrain.|
1|Heal Companion|p|1 to 2|Ranger, Healing, Manipulate, Vitality|30 feet||1 animal companion|||Heal your companion.|+1: healing increases.
`, 'ranger'),
];

export const PF2E_SPELLS: Pf2eSpell[] = uniqueIds([
  ...CANTRIPS,
  ...RANK_1,
  ...RANK_2,
  ...RANK_3,
  ...RANK_4,
  ...RANK_5,
  ...RANK_6,
  ...RANK_7,
  ...RANK_8,
  ...RANK_9,
  ...RANK_10,
  ...FOCUS,
]);
