/** PF2e Remaster ancestry feats (Player Core, Player Core 2), summarised. */
import type { Pf2eFeat } from '../../types';
import { feats } from './dsl';

const a = (owner: string, trait: string, src: string) => feats('ancestry', owner, [trait], src);

export const PF2E_ANCESTRY_FEATS: Pf2eFeat[] = [
  ...a('dwarf', 'Dwarf', `
1|Dwarven Doughtiness|||The frightened condition you have decreases by 2 at the end of your turn instead of 1.
1|Dwarven Lore|||Trained in Crafting and Religion, and in Dwarven Lore.
1|Dwarven Weapon Familiarity|||Trained in battle axe, pick and warhammer; dwarf weapons are simple or martial for you; critical specialization effects with them.
1|Mountain’s Stoutness|||Increase your maximum HP by your level, and the DC of recovery checks is 9 + dying value.
1|Rock Runner|||Ignore difficult terrain from rubble and uneven stone, and you are not off-guard when Balancing on stone.
1|Stonecunning|||+2 circumstance bonus to notice unusual stonework, and you automatically Seek for it.
1|Unburdened Iron|||Ignore the Speed reduction from armor and reduce other Speed penalties by 5 feet.
5|Boulder Roll|2|Rock Runner|Roll like a boulder into a foe’s space, pushing it back or dealing bludgeoning damage on a failed Fortitude save.
5|Defy the Darkness|||Gain darkvision if you lack it; you will not cast darkness spells.
5|Dwarven Weapon Cunning||Dwarven Weapon Familiarity|Critical specialization effects with dwarf weapons and the favored weapons of your ancestry.
9|Echoes in Stone|3|Stonecunning|Sense vibrations through stone as imprecise tremorsense within 20 feet until your next turn.
9|Mountain’s Endurance||Mountain’s Stoutness|You regain HP equal to your level when you are reduced to dying and recover.
9|Stonewalker|||Cast meld into stone as a 3rd-rank divine innate spell once per day.
13|Dwarven Weapon Expertise||Dwarven Weapon Familiarity|When your class grants expert or better in weapons, gain it in dwarf weapons too.
13|Telluric Power|||Once per day you can stomp to create difficult terrain around you.
`),
  ...a('elf', 'Elf', `
1|Ancestral Longevity|||During daily preparations, become trained in a skill of your choice until your next preparations.
1|Elven Lore|||Trained in Arcana and Nature, and in Elven Lore.
1|Elven Weapon Familiarity|||Trained in longbow, composite longbow, longsword, rapier, shortbow and composite shortbow; elf weapons are simpler for you.
1|Forlorn|||+1 circumstance bonus to saves against emotion effects; successes are critical successes.
1|Nimble Elf|||Your Speed increases by 5 feet.
1|Otherworldly Magic|||Gain one arcane cantrip as an innate spell.
1|Unwavering Mien|||Mental effects that last more than 1 round end sooner, and you treat sleep effects better.
5|Ageless Patience|||Spend twice as long on a check to gain a +2 circumstance bonus.
5|Elven Weapon Elegance||Elven Weapon Familiarity|Critical specialization effects with elf weapons.
9|Elf Step|1||Step 5 feet twice.
9|Expert Longevity||Ancestral Longevity|Ancestral Longevity can make you expert in a trained skill.
13|Elven Weapon Expertise||Elven Weapon Familiarity|When your class grants expert or better in weapons, gain it in elf weapons too.
13|Universal Longevity|1|Expert Longevity|Once per day, reassign your Ancestral Longevity skills.
`),
  ...a('gnome', 'Gnome', `
1|Animal Accomplice|||Gain a familiar that is an animal.
1|Burrow Elocutionist|||You can speak with burrowing animals.
1|Fey Fellowship|||+2 circumstance bonus to Perception and saves against fey, and recover faster from Make an Impression failures with them.
1|First World Magic|||Gain one primal cantrip as an innate spell.
1|Gnome Obsession|||Gain a Lore subcategory that becomes expert at 2nd, master at 7th and legendary at 15th.
1|Gnome Weapon Familiarity|||Trained in glaive and kukri; gnome weapons are simpler for you.
1|Illusion Sense|||+1 circumstance bonus to Perception and Will against illusions, with an automatic check to disbelieve.
5|Energized Font|1||Once per day, regain 1 Focus Point.
5|Gnome Weapon Innovator||Gnome Weapon Familiarity|Critical specialization effects with gnome weapons.
9|First World Adept||First World Magic or wellspring gnome|Cast faerie fire and invisibility as 2nd-rank primal innate spells once per day.
9|Vivacious Conduit|||After a 10-minute rest you regain extra HP equal to your Constitution modifier times half your level.
13|Gnome Weapon Expertise||Gnome Weapon Familiarity|When your class grants expert or better in weapons, gain it in gnome weapons too.
`),
  ...a('goblin', 'Goblin', `
1|Burn It!|||Fire spells and alchemical items deal extra damage equal to half their rank or level, and persistent fire damage you deal increases by 1.
1|City Scavenger|||+1 circumstance bonus to Subsist in a settlement, and you can Earn Income scavenging.
1|Goblin Lore|||Trained in Nature and Stealth, and in Goblin Lore.
1|Goblin Scuttle|r||When an ally ends a move adjacent to you, Step.
1|Goblin Song|1||Sing to give a foe a -1 status penalty to Perception and Will.
1|Goblin Weapon Familiarity|||Trained in dogslicer and horsechopper; goblin weapons are simpler for you.
1|Junk Tinker|||Craft useful items from junk, and craft shoddy weapons without penalty.
1|Rough Rider|||Gain Ride, and a +1 bonus to Command an Animal that is a goblin dog or wolf.
1|Very Sneaky|||Move 5 feet farther when you Sneak, and stay undetected at the end of turns if you were.
5|Goblin Weapon Frenzy||Goblin Weapon Familiarity|Critical specialization effects with goblin weapons.
9|Cave Climber|||Gain a climb Speed of 10 feet.
9|Skittering Scuttle||Goblin Scuttle|Goblin Scuttle lets you Stride up to half your Speed instead of Stepping.
13|Goblin Weapon Expertise||Goblin Weapon Familiarity|When your class grants expert or better in weapons, gain it in goblin weapons too.
13|Very, Very Sneaky||Very Sneaky|Move at full Speed when you Sneak and Hide without cover or concealment.
`),
  ...a('halfling', 'Halfling', `
1|Distracting Shadows|||You can use larger creatures as cover to Hide and Sneak.
1|Halfling Lore|||Trained in Acrobatics and Stealth, and in Halfling Lore.
1|Halfling Luck|f||Once per day, reroll a failed skill check or save and take the new result.
1|Halfling Weapon Familiarity|||Trained in sling, halfling sling staff and shortsword; halfling weapons are simpler for you.
1|Sure Feet|||A success to Balance or Climb is a critical success, and you are not off-guard while doing so.
1|Unfettered Halfling|||A success to Escape or resist grabbed is a critical success, and you get a bonus against restraint.
1|Watchful Halfling|||+2 circumstance bonus to Sense Motive and to notice enchantment or possession on others.
5|Cultural Adaptability|||Gain the Adopted Ancestry feat and a 1st-level ancestry feat of that ancestry.
5|Halfling Weapon Trickster||Halfling Weapon Familiarity|Critical specialization effects with halfling weapons.
9|Guiding Luck||Halfling Luck|Halfling Luck can be used once more per day on attack rolls or Perception.
9|Irrepressible|||A success against emotion effects is a critical success, and fear effects reduce sooner.
13|Ceaseless Shadows||Distracting Shadows|Take Cover behind creatures and no longer need cover or concealment to Hide or Sneak.
13|Halfling Weapon Expertise||Halfling Weapon Familiarity|When your class grants expert or better in weapons, gain it in halfling weapons too.
`),
  ...a('human', 'Human', `
1|Adapted Cantrip||Spellcasting class feature|Gain one cantrip from a tradition other than your own, cast as your class’s spells.
1|Cooperative Nature|||+4 circumstance bonus to Aid checks.
1|General Training|||Gain a 1st-level general feat. Repeatable.
1|Haughty Obstinacy|||Successes against mental effects that would control you are critical successes, and Coerce against you is harder.
1|Natural Ambition|||Gain a 1st-level class feat for your class.
1|Natural Skill|||Become trained in two skills.
1|Unconventional Weaponry|||Become trained in one uncommon simple or martial weapon and treat it as simpler.
5|Adaptive Adept||Adapted Cantrip|Gain a 1st-rank or 3rd-rank spell from the other tradition.
5|Clever Improviser|||Gain Untrained Improvisation and attempt actions that require trained proficiency.
9|Cooperative Soul||Cooperative Nature|Aid failures are successes when you are expert in the skill.
9|Incredible Improvisation|f|Clever Improviser|Once per day, add +4 to an untrained skill check.
9|Multitalented|||Gain a 2nd-level multiclass dedication feat, ignoring attribute prerequisites.
13|Unconventional Expertise||Unconventional Weaponry|When your class grants expert or better in weapons, gain it with your chosen weapon too.
`),
  ...a('leshy', 'Leshy', `
1|Grasping Reach|||Your arms can stretch; a weapon held in two hands gains reach 10 feet but deals one die size less damage.
1|Harmlessly Cute|||+1 circumstance bonus to Deception for initiative and to appear harmless.
1|Leshy Lore|||Trained in Nature and Stealth, and in Leshy Lore.
1|Leshy Superstition|r||+1 circumstance bonus to a save against a spell or magical effect, but you cannot use some spells that round.
1|Seedpod|||Gain a seedpod ranged unarmed attack (1d4 bludgeoning) that makes the target clumsy by slowing it.
1|Undaunted|||+1 circumstance bonus to saves against emotion effects; successes become critical successes.
5|Leshy Glide|||Glide when you fall, descending 5 feet per foot moved horizontally.
5|Ritual Reversion|||Revert to a small plant form to rest unnoticed among plants.
9|Bark and Tendril|||Cast entangling flora and oaken resilience as 2nd-rank primal innate spells once per day.
9|Solar Rejuvenation|||Rest in sunlight to regain extra HP equal to your Constitution modifier times your level.
13|Thorned Seedpod||Seedpod|Your seedpod deals more damage and causes persistent piercing damage on a critical hit.
13|Rooted Guardian|||While on soil, you resist being moved and gain resistance against forced movement damage.
`),
  ...a('orc', 'Orc', `
1|Beast Trainer|||Become trained in Nature and gain the Train Animal feat.
1|Iron Fists|||Your fists lose the nonlethal trait and gain the shove trait.
1|Orc Ferocity|r||Once per day, when reduced to 0 HP, stay at 1 HP and become wounded 1 more.
1|Orc Lore|||Trained in Athletics and Survival, and in Orc Lore.
1|Orc Superstition|r||+1 circumstance bonus to a save against a spell or magical effect.
1|Orc Weapon Familiarity|||Trained in falchion and greataxe; orc weapons are simpler for you.
1|Tusks|||Gain a tusks unarmed attack: 1d6 piercing, finesse.
5|Orc Weapon Carnage||Orc Weapon Familiarity|Critical specialization effects with orc weapons.
5|Victorious Vigor|r||When you reduce a foe to 0 HP, gain temporary HP equal to your Constitution modifier.
9|Pervasive Superstition||Orc Superstition|Gain a constant +1 circumstance bonus to saves against magic.
9|Undying Ferocity||Orc Ferocity|When you use Orc Ferocity, gain temporary HP equal to your level.
13|Incredible Ferocity||Orc Ferocity|Use Orc Ferocity once per hour instead of once per day.
13|Orc Weapon Expertise||Orc Weapon Familiarity|When your class grants expert or better in weapons, gain it in orc weapons too.
`),
  ...a('catfolk', 'Catfolk', `
1|Cat Nap|||Once per hour, take a 10-minute nap to gain temporary HP.
1|Catfolk Lore|||Trained in Acrobatics and Survival, and in Catfolk Lore.
1|Catfolk Weapon Familiarity|||Trained in kukri and scimitar; catfolk weapons are simpler for you.
1|Cat’s Luck|f||Once per day, reroll a failed Reflex save.
1|Well-Met Traveler|||+1 circumstance bonus to Make an Impression on travellers and those from other cultures.
5|Catfolk Weapon Rake||Catfolk Weapon Familiarity|Critical specialization effects with catfolk weapons and claws.
5|Light Paws|2||Stride and then Step, or Step and then Stride, without triggering reactions from difficult terrain.
9|Lucky Break||Cat’s Luck|Cat’s Luck can also reroll a failed Acrobatics or Athletics check.
9|Expanded Luck||Cat’s Luck|Cat’s Luck can be used once more per day.
13|Catfolk Weapon Expertise||Catfolk Weapon Familiarity|When your class grants expert or better in weapons, gain it in catfolk weapons too.
13|Black Cat Curse|r||Curse a creature that rolls a success against you to roll again and take the lower result.
`),
  ...a('hobgoblin', 'Hobgoblin', `
1|Alchemical Scholar|||Learn four common 1st-level alchemical formulas and more as you level.
1|Hobgoblin Lore|||Trained in Crafting and Intimidation, and in Hobgoblin Lore.
1|Hobgoblin Weapon Familiarity|||Trained in composite longbow, composite shortbow, glaive, longbow, longsword and shortbow.
1|Leech-Clip|||When you hit with a polearm or flail, you can hold a foe tight, making it harder for it to move away.
1|Remorseless Lash|||After you hit a foe that is frightened, it cannot reduce its frightened value below 1 until your next turn.
5|Agonizing Rebuke|||When you Demoralize a foe, it takes mental damage while frightened.
5|Hobgoblin Weapon Discipline||Hobgoblin Weapon Familiarity|Critical specialization effects with hobgoblin weapons.
9|Pride in Arms|r||When an ally is reduced to 0 HP, it gains temporary HP to keep fighting.
9|Squad Tactics|||Foes adjacent to you and at least one ally are off-guard to you.
13|Hobgoblin Weapon Expertise||Hobgoblin Weapon Familiarity|When your class grants expert or better in weapons, gain it in those weapons too.
13|Can’t Fall Here|r||Prevent an ally from dying by sharing your resilience.
`),
  ...a('kholo', 'Kholo', `
1|Ask the Bones|||Once per day, consult a bone you carry for guidance, casting a spell like augury.
1|Crunch|||Your jaws gain the grapple trait and deal more damage to grabbed creatures.
1|Hyena Familiar|||Gain a hyena familiar.
1|Kholo Lore|||Trained in Survival and Intimidation, and in Kholo Lore.
1|Kholo Weapon Familiarity|||Trained in flail, khopesh, mambele and war flail.
1|Pack Hunter|||+2 circumstance bonus to Aid allies on checks against a foe.
5|Distant Cackle|||Cast ventriloquism as an occult innate spell once per day.
5|Pack Stalker|||Gain Terrain Stalker and move with allies while Avoiding Notice.
9|Breath Like Honey|||Your sweet breath gives a bonus to Diplomacy and Deception.
9|Rabid Sprint|2||Stride three times as two actions once per day.
13|Kholo Weapon Expertise||Kholo Weapon Familiarity|When your class grants expert or better in weapons, gain it in kholo weapons too.
`),
  ...a('kobold', 'Kobold', `
1|Cringe|r||When a foe hits you, look pitiful to impose a circumstance penalty on its damage.
1|Kobold Breath|2||Exhale a line or cone of your exemplar’s damage type (1d4 per two levels, basic Reflex).
1|Kobold Lore|||Trained in Crafting and Stealth, and in Kobold Lore.
1|Kobold Weapon Familiarity|||Trained in crossbow, greatpick, light pick, pick and spear.
1|Scamper|1||Stride, and gain +2 AC against reactions triggered by the move.
1|Snare Setter|||Become trained in Crafting and gain Snare Crafting.
5|Winglets|||Leap farther and fall slower thanks to small wings.
5|Ally’s Shelter|r||Once per day, use an ally’s save bonus instead of your own.
9|Close Quarters|||You can end your move in the space of a Small or larger ally.
9|Grovel|||Grovel before a foe to make it treat you as harmless.
13|Kobold Weapon Expertise||Kobold Weapon Familiarity|When your class grants expert or better in weapons, gain it in kobold weapons too.
13|Resplendent Spellhorn|||Your horns are spell foci that improve your innate spells.
`),
  ...a('lizardfolk', 'Lizardfolk', `
1|Bone Magic|||Gain one occult or primal cantrip as an innate spell.
1|Iruxi Armaments|||Your claws gain versatile P, or you gain a tail attack (1d6 bludgeoning, sweep) or fangs (1d8 piercing).
1|Lizardfolk Lore|||Trained in Nature and Survival, and in Lizardfolk Lore.
1|Marsh Runner|||Ignore difficult terrain from swamps and marshes.
1|Parthenogenic Hatchling|||+1 circumstance bonus to Fortitude saves against diseases and poisons; successes are critical successes.
1|Reptile Speaker|||You can speak with reptiles.
5|Gecko’s Grip|||Gain a climb Speed of 15 feet.
5|Shed Tail|r||When grabbed or restrained, shed your tail to escape automatically.
9|Swift Swimmer|||Gain a swim Speed of 25 feet.
9|Fossil Rider|||Animate a skeleton mount once per day.
13|Primal Rampage|||Once per day, gain extra damage and resistance as your ancestors rage through you.
`),
  ...a('ratfolk', 'Ratfolk', `
1|Cheek Pouches|||Store up to four light items in your cheeks.
1|Pack Rat|||Your carrying capacity improves and you can retrieve stored items faster.
1|Rat Familiar|||Gain a rat familiar.
1|Ratfolk Lore|||Trained in Society and Survival, and in Ratfolk Lore.
1|Ratspeak|||You can speak with rats and rodents.
1|Tinkering Fingers|||Repair items without a toolkit with no penalty.
1|Vandal|||Gain bonuses to damage objects and Disable Devices by breaking them.
5|Lab Rat|||+1 circumstance bonus to saves against alchemical effects and poisons.
5|Shinstabber|||Your Strikes against larger foes deal extra damage when you are adjacent.
9|Overcrowd|||Share squares with allies of your size.
9|Rat Magic|||Cast a 2nd-rank occult innate spell once per day.
13|Uncanny Cheeks||Cheek Pouches|Retrieve any item from your cheeks as a free action.
`),
  ...a('tengu', 'Tengu', `
1|Avenge Ally|f||When an ally is reduced to 0 HP, take a +1 to Strikes against the foe.
1|One-Toed Hop|||Your Step and Leap ignore difficult terrain.
1|Scavenger’s Search|||+2 circumstance bonus to Seek objects and Search for valuables.
1|Squawk!|r||When you critically fail a social check, squawk to improve the result.
1|Storm’s Lash|||Gain electric arc as a primal innate cantrip.
1|Tengu Lore|||Trained in Society and Survival, and in Tengu Lore.
1|Tengu Weapon Familiarity|||Trained in khakkara and temple sword; choose one sword to treat as simpler.
5|Eat Fortune|r||Once per day, eat a fortune or misfortune effect targeting someone within 30 feet to counteract it.
5|Long-Nosed Form|1||Polymorph into a specific humanoid form.
5|Tengu Weapon Study||Tengu Weapon Familiarity|Critical specialization effects with tengu weapons.
9|Soaring Flight|||Gain a fly Speed once per day for 10 minutes.
9|Wing Buffet|2||Batter foes with wings to push them back.
13|Tengu Weapon Expertise||Tengu Weapon Familiarity|When your class grants expert or better in weapons, gain it in tengu weapons too.
`),
];
