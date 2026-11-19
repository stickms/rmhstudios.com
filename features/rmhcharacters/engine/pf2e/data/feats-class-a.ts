/** PF2e Remaster class feats for the Player Core classes, summarised. */
import type { Pf2eFeat } from '../../types';
import { feats } from './dsl';

const c = (owner: string, trait: string, src: string) => feats('class', owner, [trait], src);

export const PF2E_CLASS_FEATS_A: Pf2eFeat[] = [
  ...c('bard', 'Bard', `
1|Bardic Lore|||Gain Bardic Lore, a Lore that covers all topics, rising with your Occultism proficiency.
1|Hymn of Healing|||Learn the hymn of healing composition spell, granting fast healing to an ally.
1|Lingering Composition|||Learn the lingering composition focus spell to extend a cantrip composition.
1|Martial Performance|||Train in martial weapons; your weapon proficiency follows your class.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Versatile Performance|||Use Performance instead of Diplomacy, Intimidation or Deception for some actions.
2|Cantrip Expansion|||Add two more cantrips to your repertoire.
2|Esoteric Polymath|||Keep a book of occult spells and swap one into your repertoire each day.
2|Uplifting Overture|||Learn the uplifting overture composition cantrip, granting an ally a bonus to a skill check.
2|Well-Versed|||+1 circumstance bonus to saves against auditory, illusion, linguistic, sonic and visual effects.
4|Courageous Advance|||Courageous anthem can let one ally Stride as a reaction.
4|Melodious Spell|1||Spellshape: your next spell is harder to notice, hiding its casting in your performance.
4|Triple Time|||Learn the triple time composition cantrip, granting allies +10 feet Speed.
4|Versatile Signature|||Swap one signature spell each day.
6|Defensive Coordination|||When you cast courageous anthem, also Raise a Shield for an ally.
6|Dirge of Doom|||Learn the dirge of doom composition cantrip, making foes frightened 1.
6|Harmonize|1||Spellshape: sustain two compositions at once.
6|Song of Marching|||Learn the song of marching composition cantrip for long overland travel.
8|Accompany|r||Use a reaction to help an ally cast a spell, paying the cost from your focus or slots.
8|Call and Response|1||Spellshape: your composition can be Sustained by an ally’s action.
8|Eclectic Skill|||Add your level to untrained checks and attempt checks that require training.
8|Fortissimo Composition|||Learn fortissimo composition, raising courageous anthem’s bonus.
8|Know-It-All|||Successful Recall Knowledge gives extra information.
10|House of Imaginary Walls|||Learn the house of imaginary walls composition cantrip to create an invisible wall.
10|Quickened Casting|f||Once per day, reduce the actions to cast a cantrip or spell 2 ranks lower than your highest by 1.
10|Unusual Composition|1||Spellshape: change a composition’s sense requirement between auditory and visual.
12|Eclectic Polymath||Esoteric Polymath|Keep a spell from your book in your repertoire permanently by swapping one out.
12|Inspirational Focus|||Refocus to regain 2 Focus Points instead of 1.
12|Allegro|||Learn the allegro composition cantrip, granting an ally the quickened condition.
14|Soothing Ballad|||Learn the soothing ballad composition spell to heal and remove fear.
14|True Hypercognition|||Recall Knowledge up to five times with a single action.
14|Courageous Onslaught|||Courageous anthem’s bonus increases for your allies’ next Strike.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Studious Capacity|||Once per day, cast a spell even with no slots of that rank left.
16|Deep Lore|||Add one more spell of each rank to your repertoire.
18|Eternal Composition|||Cast a composition cantrip each turn as a free action.
18|Impossible Polymath|||Add spells from other traditions to your Esoteric Polymath book.
18|Discordant Voice|||Courageous anthem makes allies’ Strikes deal extra sonic damage.
20|Fatal Aria|||Learn the fatal aria composition spell, slaying or wounding a foe.
20|Perfect Encore|||Gain an extra spell slot of your highest rank for a composition.
20|Symphony of the Muse|||Have multiple compositions active at once.
`),
  ...c('cleric', 'Cleric', `
1|Deadly Simplicity|||Your deity’s simple favored weapon gains a larger damage die.
1|Divine Castigation|||Your harm or heal spells deal extra spirit damage to holy or unholy foes.
1|Domain Initiate|||Learn the initial domain spell for one of your deity’s domains and gain a focus pool.
1|Harming Hands|||Your harm spells use d10s instead of d8s.
1|Healing Hands|||Your heal spells use d10s instead of d8s.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
2|Cantrip Expansion|||Prepare two more cantrips each day.
2|Communal Healing|||When you heal another creature with a heal spell, you also regain HP equal to the spell rank.
2|Emblazon Armament|||Mark a weapon or shield with your deity’s symbol for a bonus.
2|Panic the Dead|||Your vitality heal spells also make undead frightened.
2|Rapid Response|r||When an ally is reduced to 0 HP or knocked prone, Stride toward them.
2|Sap Life|||When you damage a living creature with harm, regain HP equal to the spell rank.
2|Versatile Font|||Use your divine font for either heal or harm.
4|Channel Smite|2||Expend a heal or harm to deliver its damage through a melee Strike.
4|Directed Channel|||Cast heal or harm in a 60-foot cone instead of an emanation.
4|Raise Symbol|1||Raise your religious symbol for a +2 circumstance bonus to saves.
4|Restorative Strike|1||Cast a 1-action heal on yourself and Strike in one action.
4|Sacred Ground|||Spend 1 minute to sanctify an area that heals allies within it.
6|Cast Down|1||Spellshape: a damaging heal or harm also knocks the target prone.
6|Divine Rebuttal|r||Spend a slot to grant an ally a bonus to a save or AC.
6|Divine Weapon|f||After casting a slot spell, your weapon deals extra spirit damage.
6|Selective Energy|||Exclude creatures from your heal or harm area.
8|Advanced Domain||Domain Initiate|Learn the advanced domain spell for one of your domains.
8|Emblazon Energy||Emblazon Armament|Your emblazoned item deals or resists energy damage.
8|Martyr|1||Spellshape: transfer damage or a condition from an ally to yourself when you heal.
8|Restorative Channel|||Divine font heal spells can also remove a condition.
10|Castigating Weapon|||After damaging a foe with a holy or unholy spell, your weapon deals extra spirit damage.
10|Heroic Recovery|1||Spellshape: a heal on one target also lets it Stride or Stand.
10|Shield of Faith|||Casting a spell grants a +1 status bonus to AC.
12|Defensive Recovery|1||Spellshape: a heal on one target also grants a bonus to AC and saves.
12|Domain Focus||Domain Initiate|Refocus to regain 2 Focus Points instead of 1.
12|Emblazon Antimagic||Emblazon Armament|Your emblazoned item can counteract spells.
14|Deity’s Protection||Advanced Domain|After casting a domain spell, gain resistance to all damage.
14|Fast Channel|||Cast a heal or harm with one fewer action.
14|Lasting Armament||Emblazon Armament|Your emblazoned item’s effect lasts longer.
16|Eternal Bane|||Your aura makes nearby foes take penalties.
16|Eternal Blessing|||Your aura grants a permanent bless effect to allies.
16|Resurrectionist|||Creatures you return to life gain fast healing.
18|Domain Wellspring||Domain Focus|Refocus to regain 3 Focus Points instead of 2.
18|Echoing Channel|1||Spellshape: a 2-action heal or harm also affects a creature adjacent to a target.
18|Swift Banishment|r||When you critically hit a summoned or extraplanar foe, banish it.
20|Maker of Miracles|||Gain an extra 10th-rank spell slot.
20|Spellshape Channel|f||Use a spellshape action with heal or harm as a free action.
20|Avatar’s Audience|||Your deity hears you and can intervene once per day.
`),
  ...c('druid', 'Druid', `
1|Animal Companion|||Gain a young animal companion.
1|Leshy Familiar|||Gain a plant or fungus familiar.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Storm Born|||Weather does not penalise your Perception or ranged attacks, and you ignore wind and rain difficult terrain.
1|Untamed Form|||Learn the untamed form order spell to polymorph into animal battle forms.
1|Verdant Weapon|||Spend 10 minutes to make a seed into a staff or weapon of your choice.
1|Widen Spell|1||Spellshape: increase the area of a burst, cone or line spell.
2|Call of the Wild|||Prepare summon animal or summon plant or fungus in place of another spell.
2|Enhanced Familiar|||Select four familiar abilities per day instead of two.
2|Order Explorer|||Join another druidic order and gain its feat and benefits.
2|Poison Resistance|||Gain poison resistance and a bonus to saves against poison.
4|Anthropomorphic Shape||Untamed Form|Untamed form can transform you into humanoid forms.
4|Forest Passage|||Ignore difficult terrain from plants and fungi.
4|Form Control|1|Untamed Form|Spellshape: your untamed form lasts longer at a lower rank.
4|Mature Animal Companion||Animal Companion|Your animal companion becomes mature.
4|Order Magic||Order Explorer|Learn the initial order spell of another order.
4|Snowdrift Spell|1|Storm Order|Spellshape: your cold or water spell creates difficult terrain of snow.
6|Current Spell|1||Spellshape: surround yourself with air or water, gaining AC against ranged attacks.
6|Grown of Oak|||Cast oaken resilience on yourself as a focus spell.
6|Insect Shape||Untamed Form|Untamed form can become insects and spiders.
6|Instinctive Support||Animal Companion|When you cast a support spell, your companion gains a benefit.
6|Steady Spellcasting|||A reaction that would disrupt your spell is resisted with a flat check.
8|Deimatic Display|1||Frighten nearby animals and plants with a startling display.
8|Ferocious Shape||Untamed Form|Untamed form can become dinosaurs.
8|Incredible Companion||Mature Animal Companion|Your companion becomes nimble or savage.
8|Soaring Shape||Untamed Form|Untamed form can become flying animals.
8|Wind Caller||Storm Order|Learn the stormwind flight order spell.
10|Elemental Shape||Untamed Form|Untamed form can become elementals.
10|Healing Transformation|1||Spellshape: a non-cantrip polymorph spell also restores HP.
10|Overwhelming Energy|1||Spellshape: your next spell ignores energy resistance.
10|Plant Shape||Untamed Form or Leaf Order|Untamed form can become plants.
12|Dragon Shape||Soaring Shape|Untamed form can become dragons.
12|Garland Spell|1|Leaf Order|Spellshape: your spell leaves behind harmful flowers.
12|Primal Focus|||Refocus to regain 2 Focus Points instead of 1.
12|Primal Summons||Call of the Wild|Summoned creatures gain an elemental power.
14|Pristine Weapon||Verdant Weapon|Your verdant weapon counts as cold iron and silver.
14|Specialized Companion||Incredible Companion|Your companion gains a specialization.
14|Timeless Nature|||You no longer age and gain a bonus against disease and primal magic.
14|Verdant Metamorphosis|||Become a plant creature that can root to recover.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Impaling Briars|||Learn the impaling briars order spell.
16|Monstrosity Shape||Untamed Form|Untamed form can become huge monsters.
18|Invoke Disaster||Storm Order|Learn the storm lord order spell or similar devastating weather.
18|Perfect Form Control||Form Control|Untamed form becomes permanent until you end it.
18|Primal Wellspring||Primal Focus|Refocus to regain 3 Focus Points instead of 2.
20|Hierophant’s Power|||Gain an extra 10th-rank spell slot.
20|Leyline Conduit|f||Once per minute, cast a spell of 5th rank or lower without spending a slot.
20|True Shapeshifter||Dragon Shape|Change between untamed forms while transformed.
`),
  ...c('fighter', 'Fighter', `
1|Combat Assessment|1||Strike, and on a hit Recall Knowledge about the target with a bonus.
1|Double Slice|2||Strike with two melee weapons, combining damage for resistance.
1|Exacting Strike|1||Press: a miss does not count toward your multiple attack penalty.
1|Point Blank Stance|1||Stance: no volley penalty and +2 damage with ranged weapons in close range.
1|Reactive Shield|r||When an enemy hits you, Raise a Shield as a reaction.
1|Snagging Strike|1||Strike with one hand free; a hit makes the target off-guard.
1|Sudden Charge|2||Stride twice and make a melee Strike.
1|Vicious Swing|2||Make a Strike that deals an extra die of weapon damage.
2|Aggressive Block|f||After Shield Block, push or make off-guard the attacker.
2|Assisting Shot|1||Make a ranged Strike to Aid an ally’s attack.
2|Brutish Shove|1||Press: Strike with a two-handed weapon, and on a hit Shove the target.
2|Combat Grab|1||Press: Strike with one hand free; on a hit grab the target.
2|Dueling Parry|1||Gain a +2 circumstance bonus to AC while wielding one one-handed weapon.
2|Intimidating Strike|2||Strike, and on a hit make the target frightened.
2|Lunge|2||Strike with an extra 5 feet of reach.
4|Barreling Charge|2||Stride through enemies’ spaces with Athletics, then Strike.
4|Double Shot|2||Make two ranged Strikes against different targets.
4|Dual-Handed Assault|1||Strike with a one-handed weapon held in two hands for extra damage.
4|Parting Shot|2||Step and then make a ranged Strike against an off-guard foe.
4|Powerful Shove|||Shove creatures larger than you and deal damage when they hit a surface.
4|Quick Reversal|1||Press: when flanked, Strike two flanking foes.
4|Swipe|2||Strike two adjacent foes with one swing.
4|Twin Parry|1||Gain a +1 circumstance bonus to AC while wielding two weapons.
6|Advanced Weapon Training|||Treat one group of advanced weapons as martial.
6|Advantageous Assault|1||Press: Strike a grabbed, prone or restrained foe for extra damage.
6|Disarming Stance|1||Stance: bonus to Disarm and to resist disarm.
6|Furious Focus|||Vicious Swing and Power Attack count as one attack for your multiple attack penalty.
6|Guardian’s Deflection|r||Use your weapon to give an adjacent ally +2 AC against an attack.
6|Reflexive Shield|||Add your shield bonus to Reflex saves.
6|Shatter Defenses|1||Press: Strike a frightened foe to make it off-guard.
6|Shield Warden|||Use Shield Block to protect an adjacent ally.
6|Triple Shot||Double Shot|Make Double Shot against one target, or three ranged Strikes.
8|Blind-Fight|||You don’t need to see creatures to attack them well.
8|Dueling Riposte|r|Dueling Parry|When a foe critically fails against you, Strike or Disarm it.
8|Felling Strike|2||Strike a flying foe and make it fall.
8|Incredible Aim|2||Make a ranged Strike with a +2 bonus that ignores concealment.
8|Mobile Shot Stance|1||Stance: your ranged Strikes don’t trigger reactions.
8|Positioning Assault|2||Strike and move the target 5 feet.
8|Sudden Leap|2||Leap and Strike during the jump.
10|Agile Grace|||Your multiple attack penalty with agile weapons is -3/-6.
10|Certain Strike|1||Press: a miss still deals damage from the weapon’s non-dice bonuses.
10|Combat Reflexes|||Gain an extra reaction per round for Reactive Strike.
10|Debilitating Shot|2||Ranged Strike that slows the target.
10|Disruptive Stance|1||Stance: Reactive Strike against concentrate actions.
10|Fearsome Brute|||Gain bonus damage against frightened foes.
10|Mirror Shield|r||Reflect a spell attack with your shield.
10|Twin Riposte|r|Twin Parry|When a foe critically fails against you, Strike or Disarm it.
12|Brutal Finish|1||Press: a last Strike with extra damage dice.
12|Dueling Dance|1|Dueling Parry|Stance: constant Dueling Parry.
12|Flinging Shove|||Shove creatures farther and into others.
12|Improved Dueling Riposte||Dueling Riposte|Use Dueling Riposte once per round as a free reaction.
12|Lunging Stance||Lunge|Stance: Reactive Strike with extended reach.
12|Paragon’s Guard|1||Stance: always have your shield raised.
12|Spring Attack|1||Stride and Strike without triggering reactions from the target.
14|Desperate Finisher|r||Use a press action as a reaction at the end of your turn.
14|Determination|1||Once per day, end a non-permanent condition or spell affecting you.
14|Guiding Finish|1||Press: Strike and move the target with your weapon.
14|Guiding Riposte||Dueling Riposte|Riposte also moves the foe.
14|Stance Savant|f||When you roll initiative, enter a stance as a free action.
14|Two-Weapon Flurry|1||Strike once with each of two weapons.
14|Whirlwind Strike|3||Strike every enemy within reach.
16|Graceful Poise|1||Stance: agile one-handed attacks deal more damage.
16|Improved Reflexive Shield||Reflexive Shield|Shield Block protects allies from area damage.
16|Multishot Stance|1|Triple Shot|Stance: Triple Shot with a reduced penalty.
16|Overwhelming Blow|1||Strike with a crushing blow that counts as three attacks.
16|Twinned Defense|1||Stance: always benefit from Twin Parry.
18|Impossible Volley|3||Ranged Strike against every foe in a 10-foot burst.
18|Savage Critical|||You critically hit on a 19 with your chosen weapon group.
18|Smash from the Air|||Use Reactive Strike to destroy projectiles aimed at you or allies.
20|Boundless Reprisals|||Gain an extra reaction on each enemy’s turn.
20|Ultimate Flexibility||Improved Flexibility|Combat Flexibility grants a feat of 18th level or lower and can be swapped.
20|Weapon Supremacy|||You are permanently quickened, usable only to Strike.
`),
  ...c('ranger', 'Ranger', `
1|Animal Companion|||Gain a young animal companion that hunts with you.
1|Crossbow Ace|||Hunt Prey or Reload grants a bonus to crossbow damage.
1|Hunted Shot|1||Make two ranged Strikes against your prey.
1|Monster Hunter|||Recall Knowledge about prey gives allies a bonus to attacks.
1|Twin Takedown|1||Make two melee Strikes against your prey with two weapons.
2|Favored Prey|||Choose a creature type; Hunt Prey against it as a free action.
2|Hunter’s Aim|2||Ranged Strike against prey with +2 that ignores concealment.
2|Monster Warden||Monster Hunter|Your Monster Hunter bonus also grants AC and saves.
2|Quick Draw|1||Draw a weapon and Strike with it.
4|Mature Animal Companion||Animal Companion|Your animal companion becomes mature.
4|Running Reload|1||Stride, Step or Sneak and then Interact to reload.
4|Scout’s Warning|f||Grant allies a bonus to initiative when you roll Perception.
4|Snare Specialist|||Prepare snares quickly and daily.
4|Twin Parry|1||Gain a +1 circumstance bonus to AC while wielding two weapons.
6|Quick Snares||Snare Specialist|Set a snare in 3 actions.
6|Skirmish Strike|1||Step and Strike, or Strike and Step.
6|Swift Tracker|||Track at full Speed and Seek while tracking.
6|Warden’s Boon|1||Share your hunter’s edge with an ally against your prey.
8|Blind-Fight|||You don’t need to see creatures to attack them well.
8|Deadly Aim|1||Ranged Strike with a penalty for extra precision damage.
8|Hazard Finder|||Bonus to find and avoid traps and hazards.
8|Powerful Snares||Snare Specialist|Your snares use your class DC.
8|Terrain Master|||Change your favored terrain daily.
10|Camouflage|||Hide and Sneak in natural terrain without cover.
10|Incredible Companion||Mature Animal Companion|Your companion becomes nimble or savage.
10|Master Monster Hunter||Monster Hunter|Use Nature for all Recall Knowledge about creatures.
10|Penetrating Shot|2||A ranged Strike hits your target and the creature behind it.
10|Twin Riposte|r|Twin Parry|When a foe critically fails against you, Strike or Disarm it.
12|Distracting Shot|||A critical hit with a ranged Strike makes the target off-guard.
12|Double Prey|||Hunt Prey against two creatures.
12|Sense the Unseen|r||When you Seek, find undetected creatures more easily.
12|Shared Prey||Double Prey|Share your prey with an ally.
14|Greater Distracting Shot||Distracting Shot|A ranged hit makes the target off-guard.
14|Specialized Companion||Incredible Companion|Your companion gains a specialization.
14|Targeting Shot|2||Ranged Strike against prey that ignores cover and concealment.
16|Impossible Flurry|3||Make three melee Strikes with each weapon.
16|Manifold Edge|||Use a different hunter’s edge for a minute.
16|Masterful Companion||Animal Companion|Your companion gains your hunter’s edge.
16|Perfect Shot|3||A ranged Strike against prey that deals maximum damage.
18|Impossible Volley|3||Ranged Strike against every foe in a 10-foot burst.
18|Legendary Monster Hunter||Master Monster Hunter|Your Monster Hunter bonuses increase.
18|Lightning Snares||Quick Snares|Set a snare as a single action.
20|Legendary Shot|||Ignore range increment penalties up to five increments.
20|To the Ends of the Earth|||Follow your prey across any distance and planes.
20|Triple Threat|||Hunt Prey against three creatures.
20|Ultimate Skirmisher|||Ignore difficult terrain and gain bonuses against reactions.
`),
  ...c('rogue', 'Rogue', `
1|Nimble Dodge|r||+2 circumstance bonus to AC against one attack.
1|Overextending Feint|||A successful Feint makes the foe take a penalty to its next attack.
1|Plant Evidence|1||Slip an item onto a creature with Thievery.
1|Trap Finder|||Bonuses to find and disable traps.
1|Tumble Behind|||After Tumbling Through a foe, it is off-guard to your next attack.
1|Twin Feint|1||Strike twice with two weapons, the second making the target off-guard.
1|You’re Next|r||After reducing a foe to 0 HP, Demoralize another.
2|Brutal Beating|||A critical hit makes the target frightened 1.
2|Distracting Feint|||A successful Feint gives the foe a penalty to Perception and Reflex.
2|Mobility|||Move half your Speed without triggering reactions.
2|Strong Arm|||Thrown weapon range increments increase by 10 feet.
2|Unbalancing Blow|||A critical hit makes the target off-guard.
2|Underhanded Assault|2||Sneak, then Strike a foe from hiding.
4|Head Stomp|1||Strike a prone foe to make it stupefied.
4|Mug|1||Strike and Steal from the target.
4|Nimble Roll|||Nimble Dodge works against Reflex saves and lets you Stride.
4|Predictable!|1||Sense Motive to learn and counter a foe’s next move.
4|Sabotage|1||Damage an item a foe holds using Thievery.
4|Scoundrel’s Surprise|1||Remove a disguise to make foes off-guard.
4|The Harder They Fall|||Trip deals sneak attack damage to off-guard foes.
4|Twin Distraction||Twin Feint|Twin Feint can make the target stupefied.
6|Analyze Weakness|1||Increase your next sneak attack damage after Recall Knowledge.
6|Anticipate Ambush|||Gain a bonus to find hidden dangers during exploration.
6|Far Throw|||Reduce penalties for thrown range increments.
6|Gang Up|||Foes are off-guard to you if adjacent to an ally and you.
6|Light Step|||Ignore difficult terrain when you Stride or Step.
6|Shove Down|1||Knock a foe prone after Shoving it.
6|Skirmish Strike|1||Step and Strike, or Strike and Step.
6|Twist the Knife|1||After a sneak attack, deal persistent bleed damage.
8|Delay Trap|r||Delay a trap’s activation with Thievery.
8|Nimble Strike|||Strike as part of Nimble Dodge.
8|Opportune Backstab|r||When an ally hits a foe adjacent to you, Strike it.
8|Predictive Purchase|||Produce an item you had planned to buy.
8|Ricochet Stance|1||Stance: your thrown weapons return to your hand.
8|Sidestep|r||Redirect a missed attack to another creature.
8|Sly Striker|||Deal some sneak attack damage even without precision.
10|Precise Debilitations||Debilitating Strike|Add extra precision damage or off-guard as debilitations.
10|Sneak Savant|||A success to Sneak is a critical success.
10|Tactical Debilitations||Debilitating Strike|Add debilitations that stop flanking or reactions.
10|Vicious Debilitations||Debilitating Strike|Add debilitations that grant weakness or clumsy.
12|Bloody Debilitation||Debilitating Strike|Add persistent bleed as a debilitation.
12|Critical Debilitation||Debilitating Strike|A critical hit can slow or paralyze.
12|Fantastic Leap|2||Leap and Strike a foe during the jump.
12|Felling Shot|2||Ranged Strike that grounds a flying foe.
12|Preparation|1||Gain an extra reaction this round.
12|Reactive Interference|r||Disrupt a foe’s reaction.
12|Spring from the Shadows|1||Stride to a foe and Strike while undetected.
14|Defensive Roll|f||Once per day, halve damage that would reduce you to 0 HP.
14|Instant Opening|1||Make a foe off-guard with a quip or distraction.
14|Leave an Opening|||When a foe critically misses you, an ally can Strike it.
14|Sense the Unseen|r||When you Seek, find undetected creatures more easily.
14|Stay Down!|r||Prevent a prone foe from Standing.
16|Blank Slate|||Detection and mind-reading magic against you fails.
16|Cloud Step|||Walk on water, air and surfaces that can’t hold you.
16|Cognitive Loophole|r||Ignore a mental effect for one round.
16|Dispelling Slice|2||Sneak attack that attempts to counteract a spell.
16|Perfect Distraction|||Create a decoy to Sneak away.
18|Implausible Infiltration|||Move through walls and floors briefly.
18|Implausible Purchase|||Produce an item of greater value with Predictive Purchase.
18|Powerful Sneak|||Sneak attack deals more damage.
20|Everyone’s a Suspect|||You sense disguised or invisible creatures around you.
20|Hidden Paragon|||Become invisible once per day after Hiding.
20|Reactive Distraction|r||Redirect an attack to a decoy.
`),
  ...c('witch', 'Witch', `
1|Cackle|||Learn the cackle hex to Sustain a hex as a free action.
1|Cauldron|||Brew oils and potions during your preparations.
1|Counterspell|r||Use a prepared spell to counteract an identical spell.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Widen Spell|1||Spellshape: increase the area of a burst, cone or line spell.
1|Witch’s Armaments|||Grow claws, teeth or hair as natural weapons.
2|Basic Lesson|||Learn a lesson that grants a hex and adds a spell to your familiar.
2|Cantrip Expansion|||Prepare two more cantrips each day.
2|Conceal Spell|1||Spellshape: hide the casting of your next spell.
2|Enhanced Familiar|||Select four familiar abilities per day instead of two.
4|Ceremonial Knife|||Create a knife that holds a spell slot.
4|Living Hair|||Your hair becomes a weapon and can manipulate objects.
4|Steady Spellcasting|||A reaction that would disrupt your spell is resisted with a flat check.
4|Witch’s Charge|||Sense a willing creature you bind and cast spells through it.
6|Greater Lesson||Basic Lesson|Learn a greater lesson.
6|Spirit Familiar|||Your familiar can harm foes or heal allies by flying through them.
6|Murksight|||Ignore concealment from fog and mist.
8|Cursed Effigy|||Make an effigy that makes a foe take a penalty against your hexes.
8|Double, Double|||Prepare two weaker potions at once.
8|Witch’s Bottle|||Store a hex in a bottle for later.
10|Major Lesson||Greater Lesson|Learn a major lesson.
10|Quickened Casting|f||Once per day, reduce the actions to cast a cantrip or spell 2 ranks lower than your highest by 1.
10|Ritual Researcher|||Bonus to primary and secondary checks for rituals.
12|Hex Focus|||Refocus to regain 2 Focus Points instead of 1.
12|Patron’s Grace|||When you cast a hex, an ally regains HP or a save bonus.
12|Witch’s Broom|||Enchant a broom to fly.
14|Lifeblood’s Call|||Your hexes drain foes to restore you.
14|Reflect Harm|r||When a foe hits you, it takes damage.
14|Sympathetic Vulnerabilities|||Your hexes reduce a foe’s resistances.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Patron’s Claim|1||Once per day, inflict a debilitating curse on a foe.
16|Siphon Power|||Cast a spell from your familiar without a slot.
18|Hex Wellspring||Hex Focus|Refocus to regain 3 Focus Points instead of 2.
18|Patron’s Truth|||Gain an extra 10th-rank spell slot.
18|Coven Spell|1||Spellshape: allies in your coven enhance your spell.
20|Hex Master|||Cast more than one hex per turn.
20|Patron’s Avatar|||Become an avatar of your patron for a minute.
20|Witch’s Hut|||Animate your home to protect you.
`),
  ...c('wizard', 'Wizard', `
1|Counterspell|r||Use a prepared spell to counteract an identical spell.
1|Familiar|||Gain a familiar.
1|Reach Spell|1||Spellshape: increase the range of your next spell by 30 feet.
1|Spellbook Prodigy|||Learn spells for your spellbook more easily and cheaply.
1|Widen Spell|1||Spellshape: increase the area of a burst, cone or line spell.
2|Cantrip Expansion|||Prepare two more cantrips each day.
2|Conceal Spell|1||Spellshape: hide the casting of your next spell.
2|Energy Ablation|||Casting an energy spell grants you resistance to that energy.
2|Enhanced Familiar|||Select four familiar abilities per day instead of two.
2|Nonlethal Spell|1||Spellshape: make a damaging spell nonlethal.
4|Bespell Strikes|f||After casting a spell, your next Strike deals extra force damage.
4|Linked Focus|||When you Drain Bonded Item for a school spell, regain 1 Focus Point.
4|Silent Spell|1||Spellshape: cast a spell without verbal components.
6|Spell Penetration|||Targets take a penalty to saves against your spells if they have a status bonus.
6|Steady Spellcasting|||A reaction that would disrupt your spell is resisted with a flat check.
6|Split Slot|||Prepare two spells in one slot and choose which to cast.
8|Advanced School Spell|||Learn your school’s advanced spell.
8|Bond Conservation|1||Spellshape: Drain Bonded Item without losing it for a lower-rank spell.
8|Universal Versatility|||Learn several schools’ school spells.
10|Forcible Energy|1||Spellshape: your energy spell weakens the target to that energy.
10|Overwhelming Energy|1||Spellshape: your next spell ignores energy resistance.
10|Quickened Casting|f||Once per day, reduce the actions to cast a cantrip or spell 2 ranks lower than your highest by 1.
10|Scroll Savant|||Create free scrolls each day.
12|Clever Counterspell||Counterspell|Counter a spell with any spell you know of the right rank.
12|Magic Sense|||You constantly detect magic.
12|Spell Tinker|||Alter the effects of a spell you cast.
14|Infinite Possibilities|||Prepare a slot to cast any spell two ranks lower.
14|Reflect Spell||Counterspell|When you counteract a spell, turn it back on its caster.
14|Superior Bond|||Drain Bonded Item one additional time per day.
16|Effortless Concentration|f||Sustain a spell as a free action at the start of your turn.
16|Spell Combination|||Combine two spells into one slot.
16|Scintillating Spell|1||Spellshape: your spell dazzles or blinds foes.
18|Echoing Spell|1||Spellshape: cast a spell a second time without a slot.
18|Reprepare Spell|||Spend 10 minutes to prepare a spell again.
18|Infinite Eye|||Gain a permanent see-invisibility style sense.
20|Archwizard’s Might|||Gain an extra 10th-rank spell slot.
20|Spell Mastery|||Prepare four spells permanently.
20|Spellshape Mastery|||Use a spellshape action as a free action.
`),
];
