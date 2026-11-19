/**
 * PF2e Remaster backgrounds (Player Core). Each grants one boost from a pair and
 * one free boost, training in a skill and a Lore, and a skill feat.
 */
import type { Ability, Pf2eBackground } from '../../types';

const bg = (
  id: string,
  name: string,
  pair: [Ability, Ability],
  skills: string[],
  lore: string,
  featId: string,
  text: string,
): Pf2eBackground => ({ id, name, boosts: [pair, 'free'], skills, lore, featId, text });

export const PF2E_BACKGROUNDS: Pf2eBackground[] = [
  bg('acolyte', 'Acolyte', ['int', 'wis'], ['religion'], 'Scribing Lore', 'student-of-the-canon', 'You spent your early days in a temple or monastery, studying scripture and serving the faithful.'),
  bg('acrobat', 'Acrobat', ['str', 'dex'], ['acrobatics'], 'Circus Lore', 'steady-balance', 'You performed feats of balance and tumbling in a circus or on the streets.'),
  bg('animal-whisperer', 'Animal Whisperer', ['wis', 'cha'], ['nature'], 'Plains Lore', 'train-animal', 'You have always felt a bond with animals and can calm and teach them. Choose a Lore for a terrain the animals you love live in.'),
  bg('artisan', 'Artisan', ['str', 'int'], ['crafting'], 'Guild Lore', 'specialty-crafting', 'You trained as an apprentice under a master crafter and know your trade.'),
  bg('artist', 'Artist', ['dex', 'cha'], ['crafting'], 'Art Lore', 'specialty-crafting', 'Your art is your way of making sense of the world, and adventure is new material.'),
  bg('barkeep', 'Barkeep', ['con', 'cha'], ['diplomacy'], 'Alcohol Lore', 'hobnobber', 'You have poured drinks and heard every story, and know how to keep a room calm.'),
  bg('barrister', 'Barrister', ['int', 'cha'], ['diplomacy'], 'Legal Lore', 'group-impression', 'You argued cases before magistrates and know the law and how to sway a crowd.'),
  bg('bounty-hunter', 'Bounty Hunter', ['str', 'wis'], ['survival'], 'Legal Lore', 'experienced-tracker', 'You brought fugitives to justice for coin and learned to follow any trail.'),
  bg('charlatan', 'Charlatan', ['int', 'cha'], ['deception'], 'Underworld Lore', 'charming-liar', 'You travelled from place to place selling fake cures and false fortunes.'),
  bg('criminal', 'Criminal', ['dex', 'int'], ['stealth'], 'Underworld Lore', 'experienced-smuggler', 'You were part of a gang or worked alone outside the law.'),
  bg('cultist', 'Cultist', ['int', 'cha'], ['occultism'], 'Lore of your cult’s patron', 'schooled-in-secrets', 'You were raised in, or fell into, a secretive faith whose rites taught you hidden lore.'),
  bg('detective', 'Detective', ['int', 'wis'], ['society'], 'Underworld Lore', 'streetwise', 'You solved crimes as a watch investigator or a private agent.'),
  bg('emissary', 'Emissary', ['int', 'cha'], ['society'], 'Lore of a city you have visited', 'multilingual', 'You carried messages and negotiated between peoples as a diplomat or envoy.'),
  bg('entertainer', 'Entertainer', ['dex', 'cha'], ['performance'], 'Theater Lore', 'fascinating-performance', 'You performed as an actor, musician or storyteller and know how to hold an audience.'),
  bg('farmhand', 'Farmhand', ['con', 'wis'], ['athletics'], 'Farming Lore', 'assurance', 'You worked the fields from dawn to dusk. You gain Assurance with Athletics.'),
  bg('field-medic', 'Field Medic', ['con', 'wis'], ['medicine'], 'Warfare Lore', 'battle-medicine', 'You patched up soldiers under fire and learned to work fast.'),
  bg('fortune-teller', 'Fortune Teller', ['int', 'cha'], ['occultism'], 'Fortune-Telling Lore', 'oddity-identification', 'You read cards, palms or stars for those who wished to know their future.'),
  bg('gambler', 'Gambler', ['dex', 'cha'], ['deception'], 'Games Lore', 'lie-to-me', 'You made your living at cards and dice, reading tells and bluffing.'),
  bg('gladiator', 'Gladiator', ['str', 'cha'], ['performance'], 'Gladiatorial Lore', 'impressive-performance', 'You fought in the arena for the roar of the crowd.'),
  bg('guard', 'Guard', ['str', 'cha'], ['intimidation'], 'Legal Lore', 'quick-coercion', 'You kept order as a city watch member, caravan guard or bodyguard. You may take Warfare Lore instead.'),
  bg('herbalist', 'Herbalist', ['con', 'wis'], ['nature'], 'Herbalism Lore', 'natural-medicine', 'You gathered and prepared herbs as a healer in a village or on the road.'),
  bg('hermit', 'Hermit', ['con', 'int'], ['nature'], 'Lore of the terrain you lived in', 'dubious-knowledge', 'You lived apart from others, reflecting and studying. You may train Occultism instead of Nature.'),
  bg('hunter', 'Hunter', ['dex', 'wis'], ['survival'], 'Tanning Lore', 'survey-wildlife', 'You stalked and trapped game to feed yourself and your family.'),
  bg('laborer', 'Laborer', ['str', 'con'], ['athletics'], 'Labor Lore', 'hefty-hauler', 'You worked with your back and hands, carrying, digging and building.'),
  bg('martial-disciple', 'Martial Disciple', ['str', 'dex'], ['acrobatics'], 'Warfare Lore', 'cat-fall', 'You trained in a martial school. Train Acrobatics with Cat Fall, or Athletics with Quick Jump.'),
  bg('merchant', 'Merchant', ['int', 'cha'], ['diplomacy'], 'Mercantile Lore', 'bargain-hunter', 'You ran a stall, a shop or a trading company and know the value of everything.'),
  bg('miner', 'Miner', ['str', 'wis'], ['survival'], 'Mining Lore', 'terrain-expertise', 'You dug ore and gems from the earth. Your Terrain Expertise is underground.'),
  bg('noble', 'Noble', ['int', 'cha'], ['society'], 'Genealogy Lore', 'courtly-graces', 'You were born to privilege and know the ways of the court. You may take Heraldry Lore instead.'),
  bg('nomad', 'Nomad', ['con', 'wis'], ['survival'], 'Lore of a terrain you travelled', 'assurance', 'You travelled the land with your people, never staying long. You gain Assurance with Survival.'),
  bg('prisoner', 'Prisoner', ['str', 'con'], ['stealth'], 'Underworld Lore', 'experienced-smuggler', 'You spent time behind bars, justly or not, and learned to survive and hide things.'),
  bg('sailor', 'Sailor', ['str', 'dex'], ['athletics'], 'Sailing Lore', 'underwater-marauder', 'You worked aboard a ship and know rope, rigging and the water.'),
  bg('scholar', 'Scholar', ['int', 'wis'], ['arcana'], 'Academia Lore', 'assurance', 'You studied at an academy. Train Arcana, Nature, Occultism or Religion, and gain Assurance with it.'),
  bg('scout', 'Scout', ['dex', 'wis'], ['survival'], 'Lore of a terrain you scouted', 'forager', 'You ranged ahead of armies or caravans, finding paths and danger.'),
  bg('street-urchin', 'Street Urchin', ['dex', 'con'], ['thievery'], 'Lore of the city you grew up in', 'pickpocket', 'You grew up on the streets, stealing to survive.'),
  bg('teacher', 'Teacher', ['int', 'wis'], ['performance'], 'Academia Lore', 'experienced-professional', 'You taught children or apprentices. Train Performance or Society.'),
  bg('tinker', 'Tinker', ['dex', 'int'], ['crafting'], 'Engineering Lore', 'specialty-crafting', 'You built and repaired gadgets and machines.'),
  bg('warrior', 'Warrior', ['str', 'con'], ['intimidation'], 'Warfare Lore', 'intimidating-glare', 'You fought as a mercenary, soldier or militia member.'),
];
