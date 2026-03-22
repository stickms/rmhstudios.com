/**
 * Alibi — Daily Puzzle
 * A short crime scenario. Four suspects. One contradiction. Find the liar.
 */

import { createSeededRng, getDateSeed, seededShuffle } from './seed';

export interface AlibiSuspect {
    name: string;
    emoji: string;
    alibi: string;
    isGuilty: boolean;
}

export interface AlibiContradiction {
    explanation: string;
    highlights: { text: string; source: 'scenario' | 'suspect'; suspectName?: string }[];
}

export interface AlibiPuzzle {
    scenario: string;
    suspects: Omit<AlibiSuspect, 'isGuilty'>[];
    difficulty: 'simple' | 'tricky' | 'devious';
    /** Only available after solving */
    _solution?: {
        guiltyName: string;
        contradiction: AlibiContradiction;
    };
}

interface AlibiTemplate {
    scenario: string;
    suspects: AlibiSuspect[];
    contradiction: AlibiContradiction;
    difficulty: 'simple' | 'tricky' | 'devious';
    tags: string[];
}

const ALIBI_POOL: AlibiTemplate[] = [
    // ──────────────────────────────────────────────
    //  SIMPLE (1–10)
    // ──────────────────────────────────────────────
    {
        scenario: 'A priceless painting was stolen from the Northside Gallery at 9 PM on a rainy Tuesday night. The security cameras were disabled exactly 10 minutes before the theft. The gallery was locked from the inside and the storm had been raging since noon.',
        suspects: [
            { name: 'Marcus Cole', emoji: '👨‍💼', alibi: 'I was at a dinner party across town. We didn\'t finish until 11 PM.', isGuilty: false },
            { name: 'Elena Voss', emoji: '👩‍🎨', alibi: 'I was in my studio painting all evening. My neighbor heard music from my apartment until midnight.', isGuilty: false },
            { name: 'Derek Huang', emoji: '🧑‍🔧', alibi: 'I was fixing the gallery\'s backup generator outside. I remember the stars were beautiful that clear night.', isGuilty: true },
            { name: 'Sofia Reyes', emoji: '👩‍⚕️', alibi: 'I was on a night shift at the hospital. The ER was packed and I didn\'t leave until 2 AM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Derek claims the stars were beautiful on a "clear night," but the scenario states the storm had been raging since noon on a rainy Tuesday night.',
            highlights: [
                { text: 'rainy Tuesday night', source: 'scenario' },
                { text: 'storm had been raging since noon', source: 'scenario' },
                { text: 'stars were beautiful that clear night', source: 'suspect', suspectName: 'Derek Huang' },
            ],
        },
        difficulty: 'simple',
        tags: ['art-theft', 'gallery', 'night', 'weather'],
    },
    {
        scenario: 'A vintage wine bottle worth $50,000 was swapped with a forgery at a private tasting event on Sunday afternoon. The swap happened between 1 PM (when the bottle was authenticated) and 4 PM (when the forgery was discovered). The cellar was locked and only the sommelier Henri Dubois had the key.',
        suspects: [
            { name: 'Henri Dubois', emoji: '🧑‍🍳', alibi: 'I, the sommelier, was leading the tasting from 1 to 3:30 PM. Thirty guests watched me the entire time. I locked the cellar at 1 PM and didn\'t reopen it until 4.', isGuilty: false },
            { name: 'Margaret Hale', emoji: '👩‍🦳', alibi: 'I was attending the tasting as a guest. I never left the main hall. Several people can vouch for me.', isGuilty: false },
            { name: 'Oscar Rinaldi', emoji: '🤵', alibi: 'I was working the bar upstairs. I went down to the cellar at 3:45 PM to grab more champagne and noticed the bottle looked different.', isGuilty: true },
            { name: 'Sylvia Tran', emoji: '👩‍🎤', alibi: 'I was performing live music in the garden from noon until 5 PM. I never went inside the building.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Oscar claims he went down to the cellar at 3:45 PM, but the scenario states the cellar was locked and only the sommelier had the key. Oscar had no way to access the cellar.',
            highlights: [
                { text: 'only the sommelier Henri Dubois had the key', source: 'scenario' },
                { text: 'cellar was locked', source: 'scenario' },
                { text: 'went down to the cellar at 3:45 PM to grab more champagne', source: 'suspect', suspectName: 'Oscar Rinaldi' },
            ],
        },
        difficulty: 'simple',
        tags: ['wine', 'theft', 'afternoon', 'restaurant'],
    },
    {
        scenario: 'A jewelry store on Elm Street was robbed at 3 AM on Saturday. The thief smashed through the front window. The store is located on a one-way street with a single surveillance camera at the north entrance. Police confirmed the street was completely deserted from 2 AM to 4 AM — no vehicles or pedestrians were recorded.',
        suspects: [
            { name: 'Tony Vargas', emoji: '🧑‍🦱', alibi: 'I was at a 24-hour diner two blocks away. The waitress knows me — I was there from 1 AM to 5 AM.', isGuilty: false },
            { name: 'Beth Nguyen', emoji: '👩‍🦰', alibi: 'I was driving home from a party. I passed by Elm Street around 2:30 AM and saw the store was fine — the window was still intact.', isGuilty: true },
            { name: 'Roger Klein', emoji: '👴', alibi: 'I live above the bakery next door. I was asleep and heard the crash at 3 AM. I called the police immediately.', isGuilty: false },
            { name: 'Danielle Ford', emoji: '👩‍💼', alibi: 'I was at a hotel downtown for a conference. I checked in at 10 PM and didn\'t leave until morning.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Beth claims she drove past Elm Street at 2:30 AM, but the surveillance camera confirmed the street was completely deserted from 2 AM to 4 AM with no vehicles recorded.',
            highlights: [
                { text: 'street was completely deserted from 2 AM to 4 AM — no vehicles or pedestrians were recorded', source: 'scenario' },
                { text: 'driving home from a party. I passed by Elm Street around 2:30 AM', source: 'suspect', suspectName: 'Beth Nguyen' },
            ],
        },
        difficulty: 'simple',
        tags: ['jewelry', 'robbery', 'night', 'surveillance'],
    },
    {
        scenario: 'The main server room at Pinnacle Corp was broken into at 11 PM on a Wednesday. The intruder entered through a window on the 12th floor. The building elevator logs show no elevator trips to the 12th floor after 8 PM. The only stairwell access to floors above 10 requires a keycard held exclusively by C-suite executives.',
        suspects: [
            { name: 'Janet Yoo', emoji: '👩‍💻', alibi: 'I was at home watching the season finale of my show. My husband can confirm I was on the couch all night.', isGuilty: false },
            { name: 'Martin Hale', emoji: '👨‍💼', alibi: 'I was working late on the 8th floor until midnight. I took the stairs up to the 12th floor around 10:30 to grab a file from my office, then went back down.', isGuilty: true },
            { name: 'Lucy Kim', emoji: '👩‍🔬', alibi: 'I left the building at 6 PM. My badge-out swipe confirms it. I went straight to my yoga class.', isGuilty: false },
            { name: 'Dennis Cho', emoji: '🧑‍💼', alibi: 'I was on a business trip in Dallas. My hotel receipt and flight records confirm I wasn\'t in town.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Martin claims he took the stairs to the 12th floor, but stairwell access above the 10th floor requires a C-suite keycard. Martin works on the 8th floor and is not identified as a C-suite executive — he couldn\'t have accessed the stairwell to reach the 12th floor.',
            highlights: [
                { text: 'stairwell access to floors above 10 requires a keycard held exclusively by C-suite executives', source: 'scenario' },
                { text: 'took the stairs up to the 12th floor around 10:30', source: 'suspect', suspectName: 'Martin Hale' },
            ],
        },
        difficulty: 'simple',
        tags: ['corporate', 'break-in', 'night', 'tech'],
    },
    {
        scenario: 'A fire was deliberately set in the stockroom of a department store at 6 AM on Monday morning, before the store opened at 9 AM. Investigators confirmed the fire was started with a lighter and accelerant. The stockroom is in the basement and can only be reached through a locked interior door — the only key is kept in a lockbox at the security desk.',
        suspects: [
            { name: 'Gail Withers', emoji: '👩‍🦳', alibi: 'I\'m the opening manager. I arrived at 7 AM and smelled the smoke. I called 911 immediately.', isGuilty: false },
            { name: 'Hector Ruiz', emoji: '🧑‍🔧', alibi: 'I\'m the overnight janitor. I finished my shift at 5 AM and went straight home. My bus pass shows I tapped on at 5:12 AM.', isGuilty: false },
            { name: 'Priya Sharma', emoji: '👩‍💼', alibi: 'I\'m a sales associate. I arrived early at 5:45 AM to do inventory. I went down to the stockroom through the loading dock entrance and was counting boxes when I smelled smoke.', isGuilty: true },
            { name: 'Kyle Jensen', emoji: '👨‍🚒', alibi: 'I\'m the security guard. I was at my desk all night. Nobody signed out the stockroom key during my shift.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Priya claims she entered the stockroom through "the loading dock entrance," but the scenario states the stockroom can only be reached through a locked interior door with a key kept at the security desk. There is no loading dock entrance to the stockroom.',
            highlights: [
                { text: 'can only be reached through a locked interior door', source: 'scenario' },
                { text: 'went down to the stockroom through the loading dock entrance', source: 'suspect', suspectName: 'Priya Sharma' },
            ],
        },
        difficulty: 'simple',
        tags: ['arson', 'retail', 'morning', 'indoor'],
    },
    {
        scenario: 'A laptop containing classified research was stolen from a university lab on Thursday. The lab is on the 3rd floor of Kepler Hall. The building was locked down for asbestos removal from Monday through Friday — the only entrance open was the south door, monitored by a sign-in sheet. The sign-in sheet shows no visitors on Thursday.',
        suspects: [
            { name: 'Professor Allan Reed', emoji: '👨‍🏫', alibi: 'I was teaching a lecture in Copernicus Hall across campus from 9 AM to noon. Then I had office hours until 3 PM.', isGuilty: false },
            { name: 'Grace Okafor', emoji: '👩‍🔬', alibi: 'I was in the lab on Wednesday finishing an experiment. I signed in at the south door at 8 AM and left at 6 PM. I didn\'t go back Thursday.', isGuilty: false },
            { name: 'Nathan Briggs', emoji: '🧑‍🎓', alibi: 'I was studying in the Kepler Hall library on the 1st floor all day Thursday. I entered through the north door around 9 AM.', isGuilty: true },
            { name: 'Dr. Mei Chen', emoji: '👩‍⚕️', alibi: 'I was at a medical conference in another city on Thursday. My flight didn\'t get back until Friday evening.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Nathan claims he entered Kepler Hall through the north door, but the building was locked down for asbestos removal and the only entrance open was the south door. The north door would have been inaccessible.',
            highlights: [
                { text: 'only entrance open was the south door', source: 'scenario' },
                { text: 'entered through the north door around 9 AM', source: 'suspect', suspectName: 'Nathan Briggs' },
            ],
        },
        difficulty: 'simple',
        tags: ['theft', 'university', 'day', 'tech'],
    },
    {
        scenario: 'A priceless Stradivarius violin was stolen from the Grandview Concert Hall during intermission at 8:30 PM on Saturday. The violin was kept in a locked backstage room. The concert hall has no windows backstage, and the only backstage entrance is through a door next to the stage that is visible to the entire audience.',
        suspects: [
            { name: 'Conductor Elias Brandt', emoji: '🎵', alibi: 'I was in the audience seating area chatting with patrons during intermission. Dozens of people spoke with me.', isGuilty: false },
            { name: 'Violinist Seo-Yun Park', emoji: '🎻', alibi: 'I was backstage tuning my own instrument in the dressing room. The stage manager saw me the entire time.', isGuilty: false },
            { name: 'Patron Richard Avery', emoji: '🤵', alibi: 'I stepped outside for fresh air during intermission and had a cigarette. I came back in through the backstage fire exit when I heard the commotion.', isGuilty: true },
            { name: 'Usher Maria Santos', emoji: '👩‍💼', alibi: 'I was directing audience members to the restrooms during intermission. I was in the main lobby the whole time.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Richard claims he came back in through the "backstage fire exit," but the scenario states the only backstage entrance is the door next to the stage. He would have no way to enter backstage from outside — meaning he must have already been backstage.',
            highlights: [
                { text: 'only backstage entrance is through a door next to the stage', source: 'scenario' },
                { text: 'came back in through the backstage fire exit', source: 'suspect', suspectName: 'Richard Avery' },
            ],
        },
        difficulty: 'simple',
        tags: ['music', 'theft', 'night', 'indoor'],
    },
    {
        scenario: 'A delivery truck carrying electronics was hijacked on Route 9 at 2 PM on Wednesday. The driver was found tied up at the scene. Route 9 is a rural highway with no cell phone coverage for a 30-mile stretch between the towns of Millbrook and Ashton. Police confirmed the hijacking occurred within this dead zone.',
        suspects: [
            { name: 'Earl Benson', emoji: '🧔', alibi: 'I was at my farm in Millbrook all day. My farmhand and I were repairing a fence from noon to 4 PM.', isGuilty: false },
            { name: 'Tina Marsh', emoji: '👩‍🌾', alibi: 'I was driving on Route 9 around that time heading to Ashton. I called my sister at 2:15 PM to tell her I was running late — she can confirm.', isGuilty: true },
            { name: 'Sam Delgado', emoji: '🧑‍🔧', alibi: 'I was at my auto shop in Ashton. I have three customers who were waiting for their cars that afternoon.', isGuilty: false },
            { name: 'Wendy Torres', emoji: '👩‍💻', alibi: 'I was working from home in the city, 80 miles away. My VPN login records show I was online from 9 AM to 5 PM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Tina claims she called her sister at 2:15 PM while driving on Route 9, but the scenario states there is no cell phone coverage on the 30-mile stretch of Route 9 between Millbrook and Ashton. She could not have made a phone call from Route 9 at that time.',
            highlights: [
                { text: 'no cell phone coverage for a 30-mile stretch', source: 'scenario' },
                { text: 'called my sister at 2:15 PM to tell her I was running late', source: 'suspect', suspectName: 'Tina Marsh' },
            ],
        },
        difficulty: 'simple',
        tags: ['hijacking', 'rural', 'day', 'outdoor'],
    },
    {
        scenario: 'A safe containing $200,000 in cash was cracked open at the Riverside Casino between 4 AM and 5 AM on Sunday. The casino had closed at 3 AM and the last patron left at 3:15 AM. All exterior doors were alarmed and none triggered. The only people inside after closing were the four staff members on cleanup duty.',
        suspects: [
            { name: 'Dealer Marco Rossi', emoji: '🃏', alibi: 'I was vacuuming the main floor from 3:15 AM onward. The pit boss saw me the whole time.', isGuilty: false },
            { name: 'Bartender Jess Calloway', emoji: '🍸', alibi: 'I was restocking the bar and cleaning glasses. I finished up around 4:30 AM and clocked out.', isGuilty: false },
            { name: 'Bouncer Darnell Thompson', emoji: '💪', alibi: 'I was checking all the exits and doing my security round. I stepped outside for a smoke at 4:15 AM and came back in through the south entrance.', isGuilty: true },
            { name: 'Cashier Yuki Ando', emoji: '💰', alibi: 'I was counting and reconciling the night\'s register totals in the counting room. It took me until almost 5 AM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Darnell claims he stepped outside and came back in through the south entrance, but the scenario states all exterior doors were alarmed and none triggered. He could not have gone outside and re-entered without setting off an alarm.',
            highlights: [
                { text: 'All exterior doors were alarmed and none triggered', source: 'scenario' },
                { text: 'stepped outside for a smoke at 4:15 AM and came back in through the south entrance', source: 'suspect', suspectName: 'Darnell Thompson' },
            ],
        },
        difficulty: 'simple',
        tags: ['casino', 'theft', 'night', 'indoor'],
    },
    {
        scenario: 'A rare orchid worth $15,000 was stolen from the Botanical Society greenhouse overnight on Monday. The greenhouse has a single entrance that is locked with a numeric keypad. The code was changed on Sunday evening, and only the head gardener and the society president were told the new code.',
        suspects: [
            { name: 'Head Gardener Rosa Flores', emoji: '🌺', alibi: 'I set the new code on Sunday evening and went home. I arrived Monday morning at 6 AM and discovered the orchid missing. I didn\'t share the code with anyone.', isGuilty: false },
            { name: 'Volunteer Tom Whitley', emoji: '🌿', alibi: 'I was at home all night. I don\'t have the code — I always wait for Rosa to let me in on my volunteer mornings.', isGuilty: false },
            { name: 'Board Member Claire Dumont', emoji: '👩‍💼', alibi: 'I stopped by the greenhouse at 10 PM Monday to check on my orchid entry for the upcoming show. I punched in the code and spent about 20 minutes inside, then locked up and left.', isGuilty: true },
            { name: 'Society President Harold Vance', emoji: '🎩', alibi: 'I was at a dinner event until midnight. I have the new code but I haven\'t visited the greenhouse since Saturday.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Claire claims she "punched in the code" to enter the greenhouse, but only the head gardener and the society president were given the new code. As a board member, Claire should not have known the code that was changed on Sunday evening.',
            highlights: [
                { text: 'only the head gardener and the society president were told the new code', source: 'scenario' },
                { text: 'punched in the code and spent about 20 minutes inside', source: 'suspect', suspectName: 'Claire Dumont' },
            ],
        },
        difficulty: 'simple',
        tags: ['botanical', 'theft', 'night', 'outdoor'],
    },

    // ──────────────────────────────────────────────
    //  TRICKY (11–20)
    // ──────────────────────────────────────────────
    {
        scenario: 'A diamond necklace vanished from a hotel safe during a charity gala on Saturday evening. The safe required two keys simultaneously — one held by the hotel manager and one by the guest who rented it. Power went out at 8:30 PM for exactly 5 minutes. The safe is a mechanical model that does not depend on electricity.',
        suspects: [
            { name: 'Victor Lane', emoji: '🤵', alibi: 'I was giving my keynote speech on stage when the power went out. Hundreds of people saw me.', isGuilty: false },
            { name: 'Nina Ashford', emoji: '👸', alibi: 'I was in the powder room with two other guests. We used our phone flashlights during the blackout.', isGuilty: false },
            { name: 'Raymond Kirk', emoji: '👨‍🍳', alibi: 'I was in the kitchen preparing the main course. The gas stoves kept working so we barely noticed the outage.', isGuilty: false },
            { name: 'Claudia Stern', emoji: '👩‍💻', alibi: 'I was at the front desk. When the power went out, I used my master key to check the safe room because I was worried the electronic lock might have failed. Nobody else was in the safe area.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Claudia claims she checked the safe room because she was worried the "electronic lock might have failed" during the power outage. But the scenario states the safe is a mechanical model that does not depend on electricity — there would be no reason to worry about an electronic lock failing.',
            highlights: [
                { text: 'safe is a mechanical model that does not depend on electricity', source: 'scenario' },
                { text: 'worried the electronic lock might have failed', source: 'suspect', suspectName: 'Claudia Stern' },
            ],
        },
        difficulty: 'tricky',
        tags: ['hotel', 'jewelry', 'night', 'gala'],
    },
    {
        scenario: 'A museum\'s ancient Roman coin collection was stolen during a power outage at 7:15 PM on a Friday in December. The display case uses an electronic lock that fails open when power is lost. The museum was hosting a members-only evening event. Sunset that day was at 4:20 PM, and it had been dark outside since late afternoon.',
        suspects: [
            { name: 'Arthur Kingsley', emoji: '🧓', alibi: 'I was giving a guided tour to a group. We were in the Egyptian wing when the lights went out — the guests were startled.', isGuilty: false },
            { name: 'Mei-Lin Chang', emoji: '👩‍🏫', alibi: 'I was in the gift shop stocking shelves. The emergency lights came on so I kept working. My coworker was right beside me.', isGuilty: false },
            { name: 'Roberto Vega', emoji: '🧑‍🎨', alibi: 'I was sketching in the outdoor sculpture garden using the last of the natural daylight. When I noticed the museum lights go out inside, I packed up and left through the east gate around 7:30.', isGuilty: true },
            { name: 'Diane Foster', emoji: '👩‍🔧', alibi: 'I was checking the HVAC system in the basement. When the power went out, I immediately went to the electrical panel to investigate.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Roberto claims he was sketching using "the last of the natural daylight" at 7:15 PM, but the scenario states sunset was at 4:20 PM and it had been dark since late afternoon. There was no natural daylight at 7:15 PM in December — it had been dark for nearly three hours.',
            highlights: [
                { text: 'Sunset that day was at 4:20 PM, and it had been dark outside since late afternoon', source: 'scenario' },
                { text: 'using the last of the natural daylight', source: 'suspect', suspectName: 'Roberto Vega' },
            ],
        },
        difficulty: 'tricky',
        tags: ['museum', 'coins', 'night', 'weather'],
    },
    {
        scenario: 'Confidential merger documents were leaked from a law firm\'s server at 11:42 PM on Wednesday. The firm\'s office building requires badge access after 6 PM. The server room is on the 2nd floor and requires a separate 8-digit PIN code known only to the three senior partners. Remote access to the server was disabled two weeks ago after a security audit.',
        suspects: [
            { name: 'Rachel Adler', emoji: '👩‍⚖️', alibi: 'I left the office at 5:30 PM. My badge out-swipe confirms it. I was at a bar trivia night with friends until midnight.', isGuilty: false },
            { name: 'Jonathan Marks', emoji: '👨‍⚖️', alibi: 'I was in the office late working on a brief on the 4th floor. I badged in at 6 AM and never left. I was not near the server room.', isGuilty: false },
            { name: 'Patricia Lowe', emoji: '👩‍💼', alibi: 'I was at home all evening. Around 10 PM I logged into the firm\'s server remotely to download some case files I needed for Thursday morning, then went to bed.', isGuilty: true },
            { name: 'Gregory Nash', emoji: '🧑‍💼', alibi: 'I was flying back from a deposition in Chicago. My flight landed at 1 AM Thursday. I wasn\'t even in the city.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Patricia claims she logged into the firm\'s server remotely at 10 PM, but the scenario states that remote access to the server was disabled two weeks ago after a security audit. She could not have accessed the server remotely.',
            highlights: [
                { text: 'Remote access to the server was disabled two weeks ago', source: 'scenario' },
                { text: 'logged into the firm\'s server remotely to download some case files', source: 'suspect', suspectName: 'Patricia Lowe' },
            ],
        },
        difficulty: 'tricky',
        tags: ['corporate', 'espionage', 'night', 'tech'],
    },
    {
        scenario: 'A tech startup\'s unreleased product designs were emailed to a competitor at 2:33 AM on Monday. The email was sent from the CEO\'s account using the office desktop in his corner office. The office building\'s security log shows that only one person entered the building between midnight and 6 AM, swiping in at 2:10 AM.',
        suspects: [
            { name: 'Aisha Patel', emoji: '👩‍💻', alibi: 'I was asleep at home. I don\'t even have my work laptop — it\'s been in the office for repairs since Friday.', isGuilty: false },
            { name: 'Chris Donovan', emoji: '🧑‍💻', alibi: 'I was gaming online until about 3 AM. I can show you my Steam activity log — I was in a multiplayer match from 1 AM to 3:15 AM without a break.', isGuilty: false },
            { name: 'Yuki Tanaka', emoji: '👨‍💻', alibi: 'I was working late at the office. I swiped in at 9 PM and stayed until about 3 AM finishing a deadline. I was at my desk the whole time.', isGuilty: true },
            { name: 'Sarah O\'Brien', emoji: '👩‍🔬', alibi: 'I was on a camping trip in a dead zone — no cell service, no WiFi. I left Friday and didn\'t get back until Tuesday morning.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Yuki claims he swiped into the office at 9 PM and stayed until 3 AM. But the security log shows only one person entered between midnight and 6 AM, at 2:10 AM. If Yuki had swiped in at 9 PM and stayed, there would be no entry swipe for him during that window — meaning the 2:10 AM entry was someone else, or Yuki left and came back, contradicting his claim of staying the whole time.',
            highlights: [
                { text: 'only one person entered the building between midnight and 6 AM, swiping in at 2:10 AM', source: 'scenario' },
                { text: 'swiped in at 9 PM and stayed until about 3 AM', source: 'suspect', suspectName: 'Yuki Tanaka' },
            ],
        },
        difficulty: 'tricky',
        tags: ['startup', 'espionage', 'night', 'tech'],
    },
    {
        scenario: 'A celebrity chef\'s secret recipe binder was stolen from a restaurant\'s locked office between 10 PM and midnight on New Year\'s Eve. The restaurant was packed with 200 guests. The office is on the second floor, accessible only by a staircase behind the kitchen. The office door uses a four-digit code that was reset that morning — only the chef and the general manager were given the new code.',
        suspects: [
            { name: 'Chef Antonin', emoji: '👨‍🍳', alibi: 'I was in the kitchen all night. New Year\'s Eve is our busiest service — I didn\'t leave the line once between 6 PM and 1 AM. My entire brigade can confirm.', isGuilty: false },
            { name: 'Maya Torres', emoji: '👩‍💼', alibi: 'I\'m the general manager. I was managing the front of house all night. I gave the midnight toast on the microphone — everyone in the dining room saw me.', isGuilty: false },
            { name: 'Luca Fontaine', emoji: '🧑‍🍳', alibi: 'I\'m the sous chef. I stepped out back for a smoke break around 11 PM for about 10 minutes. Other than that, I was on the line with Chef all night.', isGuilty: false },
            { name: 'Reginald Park', emoji: '🤵', alibi: 'I\'m a regular patron. I went to find the restroom around 11:15 PM and accidentally went up the stairs behind the kitchen. The office door was already open, which seemed odd, so I peeked inside and saw the recipe binder on the desk.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Reginald claims the office door was "already open," but the office uses a four-digit code that was just reset that morning and only the chef and the general manager knew it. A code-locked door does not simply stand open — and Reginald describes seeing the recipe binder on the desk, knowledge that a patron wandering to the restroom shouldn\'t have unless he opened the door himself.',
            highlights: [
                { text: 'office door uses a four-digit code that was reset that morning — only the chef and the general manager were given the new code', source: 'scenario' },
                { text: 'office door was already open', source: 'suspect', suspectName: 'Reginald Park' },
                { text: 'saw the recipe binder on the desk', source: 'suspect', suspectName: 'Reginald Park' },
            ],
        },
        difficulty: 'tricky',
        tags: ['restaurant', 'theft', 'night', 'food'],
    },
    {
        scenario: 'A priceless Ming Dynasty vase was shattered in an art collector\'s private showroom at approximately 9 PM on Thursday. The showroom is in the collector\'s penthouse, which is accessible only by a private elevator requiring a biometric fingerprint scan. The building\'s concierge confirmed that no guests were admitted to the penthouse floor that evening. The collector was away in London.',
        suspects: [
            { name: 'Isabella Grant', emoji: '👩‍🎨', alibi: 'I\'m the collector\'s art consultant. I was at a gallery opening downtown from 7 to 11 PM. Dozens of people saw me there.', isGuilty: false },
            { name: 'Felix Thornton', emoji: '🧑‍🔧', alibi: 'I\'m the building maintenance manager. I was doing rounds on the lower floors all evening. I used my service key to check the penthouse HVAC vents around 8:30 PM — everything looked fine when I was up there.', isGuilty: true },
            { name: 'Diana Choi', emoji: '👩‍💼', alibi: 'I\'m the collector\'s personal assistant. I was at home in Brooklyn all evening. I spoke with the collector on the phone at 9:15 PM.', isGuilty: false },
            { name: 'George Harmon', emoji: '🧓', alibi: 'I\'m the building concierge. I was at my desk in the lobby all night. Nobody went up to the penthouse — I would have seen them.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Felix claims he used a "service key" to access the penthouse, but the scenario states the penthouse is accessible only by a private elevator requiring a biometric fingerprint scan. A service key would not bypass biometric access.',
            highlights: [
                { text: 'accessible only by a private elevator requiring a biometric fingerprint scan', source: 'scenario' },
                { text: 'used my service key to check the penthouse HVAC vents around 8:30 PM', source: 'suspect', suspectName: 'Felix Thornton' },
            ],
        },
        difficulty: 'tricky',
        tags: ['art', 'vandalism', 'night', 'penthouse'],
    },
    {
        scenario: 'A shipment of pharmaceutical drugs was stolen from a warehouse loading dock at 3 AM on Tuesday. The warehouse uses motion-activated floodlights that illuminate the entire loading area — security footage confirms the lights never activated between 1 AM and 5 AM. The only access to the warehouse interior is through the loading dock or the front office door, which was deadbolted from inside.',
        suspects: [
            { name: 'Night Guard Pete Simmons', emoji: '👮', alibi: 'I was patrolling the perimeter all night. I checked the loading dock at 2 AM and again at 4 AM — nothing seemed off either time.', isGuilty: false },
            { name: 'Driver Lou Castillo', emoji: '🚛', alibi: 'I drove my truck to the warehouse at about 2:45 AM to do an early pickup. I backed up to the loading dock and waited for about 30 minutes, but nobody came to open up, so I left.', isGuilty: true },
            { name: 'Manager Karen Fields', emoji: '👩‍💼', alibi: 'I was at home asleep. I got a call at 6 AM from the morning crew telling me about the theft.', isGuilty: false },
            { name: 'Technician Raj Gupta', emoji: '🧑‍🔬', alibi: 'I was at the company\'s other facility across town, running overnight quality checks. My badge records confirm I was there from 10 PM to 6 AM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Lou claims he drove his truck to the loading dock at 2:45 AM and waited for 30 minutes. But the motion-activated floodlights never activated between 1 AM and 5 AM according to security footage. A truck backing up to the loading dock would have triggered the motion-activated lights.',
            highlights: [
                { text: 'motion-activated floodlights that illuminate the entire loading area', source: 'scenario' },
                { text: 'lights never activated between 1 AM and 5 AM', source: 'scenario' },
                { text: 'drove my truck to the warehouse at about 2:45 AM', source: 'suspect', suspectName: 'Lou Castillo' },
            ],
        },
        difficulty: 'tricky',
        tags: ['warehouse', 'theft', 'night', 'pharmaceutical'],
    },
    {
        scenario: 'An antique grandfather clock was stolen from an estate sale preview on Wednesday afternoon. The preview ran from noon to 4 PM. The estate house has two floors — the clock was on the second floor, which was roped off with a sign reading "Second Floor Closed — Structural Repairs." The estate manager confirmed that the staircase was physically blocked with construction barriers and no one was authorized to go upstairs.',
        suspects: [
            { name: 'Dealer Vivian Cross', emoji: '👩‍💼', alibi: 'I was browsing the ground floor items from noon to 2 PM. I photographed several pieces for my shop. I never went upstairs — I saw the sign.', isGuilty: false },
            { name: 'Collector James Hartley', emoji: '🧐', alibi: 'I arrived at 1 PM and spent most of my time examining the silverware collection in the dining room. I left at 3 PM.', isGuilty: false },
            { name: 'Appraiser Nora Blake', emoji: '📋', alibi: 'I was there from noon to 4 PM doing appraisals for the estate. I went upstairs around 2 PM to photograph the grandfather clock for the catalog, since it needed to be appraised before the sale.', isGuilty: true },
            { name: 'Mover Danny Reeves', emoji: '💪', alibi: 'I was in the moving truck outside the whole time, waiting for the preview to end so I could start loading the sold items.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Nora claims she went upstairs to photograph the grandfather clock for the catalog, but the scenario states the second floor was closed for structural repairs with construction barriers blocking the staircase, and no one was authorized to go upstairs.',
            highlights: [
                { text: 'Second Floor Closed — Structural Repairs', source: 'scenario' },
                { text: 'staircase was physically blocked with construction barriers and no one was authorized to go upstairs', source: 'scenario' },
                { text: 'went upstairs around 2 PM to photograph the grandfather clock', source: 'suspect', suspectName: 'Nora Blake' },
            ],
        },
        difficulty: 'tricky',
        tags: ['antique', 'theft', 'afternoon', 'estate'],
    },
    {
        scenario: 'A championship trophy was stolen from a high school\'s locked trophy case at some point over the weekend. The school was completely closed from Friday 6 PM to Monday 6 AM for fumigation — the building was sealed and filled with toxic gas. All doors were locked with tamper-evident seals, and none of the seals were broken.',
        suspects: [
            { name: 'Coach Dan Murphy', emoji: '🏈', alibi: 'I stopped by the school Saturday afternoon to pick up some playbooks from my office. I used my master key to get in through the gym entrance.', isGuilty: true },
            { name: 'Janitor Bill Tucker', emoji: '🧹', alibi: 'I set up the fumigation seals Friday evening and verified them Monday morning. I was home all weekend — the chemicals are too dangerous to be inside.', isGuilty: false },
            { name: 'Principal Ava Richardson', emoji: '👩‍💼', alibi: 'I was at a conference in Hartford all weekend. I have hotel receipts and session attendance records.', isGuilty: false },
            { name: 'Student Trevor Walsh', emoji: '🧑‍🎓', alibi: 'I was at my parents\' house all weekend. I don\'t even have a key to the school.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Coach Murphy claims he entered the school on Saturday using his master key, but the building was sealed and filled with toxic fumigation gas for the entire weekend. The tamper-evident seals on all doors were intact. He could not have entered without breaking a seal — and entering would have exposed him to toxic gas.',
            highlights: [
                { text: 'sealed and filled with toxic gas', source: 'scenario' },
                { text: 'none of the seals were broken', source: 'scenario' },
                { text: 'stopped by the school Saturday afternoon', source: 'suspect', suspectName: 'Coach Dan Murphy' },
            ],
        },
        difficulty: 'tricky',
        tags: ['school', 'theft', 'weekend', 'indoor'],
    },
    {
        scenario: 'A bronze sculpture was stolen from a waterfront park overnight on Sunday. The park is on a small peninsula connected to the mainland by a single bridge. The bridge has an automated toll camera that photographs every vehicle. Police reviewed the footage: only three vehicles crossed the bridge between 10 PM Saturday and 6 AM Sunday — all three were identified and cleared. No pedestrians were recorded either, as the bridge has pedestrian sensors.',
        suspects: [
            { name: 'Artist Nina Petrova', emoji: '👩‍🎨', alibi: 'I was at home in the city, 20 miles from the park. I was devastated to hear the sculpture was stolen — it was by one of my mentors.', isGuilty: false },
            { name: 'Jogger Mark Sullivan', emoji: '🏃', alibi: 'I jog through the park every morning. I crossed the bridge on foot at about 5:30 AM Sunday and noticed the sculpture was already gone. I called the police.', isGuilty: true },
            { name: 'Boat Captain Elias Drake', emoji: '⛵', alibi: 'I was docked at the marina on the other side of the bay all night. I didn\'t go anywhere near the peninsula.', isGuilty: false },
            { name: 'Park Ranger Steve Howell', emoji: '🌲', alibi: 'I did my last patrol at 9 PM Saturday and locked the park gates. I drove home across the bridge. My next shift didn\'t start until Monday.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Mark claims he crossed the bridge on foot at 5:30 AM Sunday, but the bridge has pedestrian sensors and police stated no pedestrians were recorded between 10 PM Saturday and 6 AM Sunday. His crossing would have been captured.',
            highlights: [
                { text: 'No pedestrians were recorded either, as the bridge has pedestrian sensors', source: 'scenario' },
                { text: 'crossed the bridge on foot at about 5:30 AM Sunday', source: 'suspect', suspectName: 'Mark Sullivan' },
            ],
        },
        difficulty: 'tricky',
        tags: ['sculpture', 'theft', 'night', 'outdoor'],
    },

    // ──────────────────────────────────────────────
    //  DEVIOUS (21–30)
    // ──────────────────────────────────────────────
    {
        scenario: 'A research lab\'s prototype quantum processor was stolen overnight between Monday and Tuesday. The lab has keycard access and only four researchers have active keycards. The entry log shows the lab was accessed once at 3:17 AM. Building maintenance confirmed the lab\'s keycard reader was malfunctioning all weekend and was only repaired at 8 AM Monday — meaning the reader was working from Monday 8 AM onward and would log all entries.',
        suspects: [
            { name: 'Dr. Priya Nair', emoji: '👩‍🔬', alibi: 'I was at home asleep. My smart home system shows I didn\'t leave. I swiped into the lab at 7 AM Tuesday as usual.', isGuilty: false },
            { name: 'Dr. James Whitfield', emoji: '👨‍🔬', alibi: 'I was on a red-eye flight to Boston. My boarding pass shows I left at 11 PM Monday and landed at 5 AM Tuesday.', isGuilty: false },
            { name: 'Dr. Hana Okoro', emoji: '🧑‍🏫', alibi: 'I was finishing a paper at home. My co-author can confirm we were on a video call until 2 AM, then I went straight to bed.', isGuilty: false },
            { name: 'Dr. Leo Brandt', emoji: '🧑‍⚕️', alibi: 'I lent my keycard to the maintenance crew last Friday so they could test the reader over the weekend. I haven\'t gotten it back yet — I had to be buzzed in by Priya on Monday morning.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Leo claims he lent his keycard to maintenance to test the reader "over the weekend," but building maintenance confirmed the reader was malfunctioning all weekend and was only repaired at 8 AM Monday. Maintenance would not have needed a researcher\'s keycard for the weekend — the reader wasn\'t working. His keycard was unaccounted for and was used for the 3:17 AM entry.',
            highlights: [
                { text: 'keycard reader was malfunctioning all weekend and was only repaired at 8 AM Monday', source: 'scenario' },
                { text: 'lent my keycard to the maintenance crew last Friday so they could test the reader over the weekend', source: 'suspect', suspectName: 'Dr. Leo Brandt' },
            ],
        },
        difficulty: 'devious',
        tags: ['lab', 'theft', 'night', 'tech'],
    },
    {
        scenario: 'The mayor\'s confidential policy speech was leaked to the press before her 2 PM address on Thursday. Only her inner circle had access to the final draft, which was completed and printed at 10 AM that morning. The speech contained a surprise announcement about rezoning the Harbor District — this detail was not in any earlier draft and was added at the last minute by the mayor herself at 9:45 AM.',
        suspects: [
            { name: 'Tom Bradley', emoji: '👨‍💼', alibi: 'I printed the final draft at 10:15 AM and brought it straight to the mayor. Then I was in back-to-back meetings until noon.', isGuilty: false },
            { name: 'Karen Wu', emoji: '👩‍💼', alibi: 'I was proofreading the draft from 10:30 to 11 AM, then left for a dental appointment. I didn\'t email it to anyone.', isGuilty: false },
            { name: 'David Osei', emoji: '🧑‍💼', alibi: 'I didn\'t even see the final draft. I was at the venue all morning doing AV setup. I heard about the Harbor District rezoning when a reporter called me at 1 PM asking for comment.', isGuilty: true },
            { name: 'Lisa Chen', emoji: '👩‍⚖️', alibi: 'I reviewed the legal portions of the draft and sent my edits to the mayor by 11:30 AM. Then I was in court all afternoon.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'David claims he didn\'t see the final draft and heard about the Harbor District rezoning from a reporter. But the reporter called him at 1 PM — before the 2 PM speech. The leaked information mentioned the Harbor District rezoning, which was a last-minute addition known only to those who saw the final draft. If a reporter was calling David specifically for comment on the rezoning at 1 PM, it means the leak had already happened, and David would be the prime suspect for knowing a detail he claims not to have seen.',
            highlights: [
                { text: 'surprise announcement about rezoning the Harbor District — this detail was not in any earlier draft', source: 'scenario' },
                { text: 'didn\'t even see the final draft', source: 'suspect', suspectName: 'David Osei' },
                { text: 'heard about the Harbor District rezoning when a reporter called me at 1 PM', source: 'suspect', suspectName: 'David Osei' },
            ],
        },
        difficulty: 'devious',
        tags: ['politics', 'leak', 'day', 'corporate'],
    },
    {
        scenario: 'A data breach at a hospital exposed thousands of patient records on Tuesday night. The breach came from a terminal in the records room, which requires a staff ID badge to enter. The records room\'s badge reader logs show four entries that evening. Hospital policy strictly prohibits personal phones in the records room — a Faraday cage around the room blocks all wireless signals.',
        suspects: [
            { name: 'Nurse Angela Torres', emoji: '👩‍⚕️', alibi: 'I went into the records room at 7 PM to pull charts for my overnight patients. I was in there for about 15 minutes, then returned to my floor.', isGuilty: false },
            { name: 'Dr. Rupert Collins', emoji: '👨‍⚕️', alibi: 'I entered the records room at 8:30 PM to check a patient\'s historical labs. I was there for maybe 10 minutes.', isGuilty: false },
            { name: 'IT Tech Sandra Kim', emoji: '👩‍💻', alibi: 'I went in at 9 PM to update the terminal\'s antivirus software. The update took about 45 minutes. I texted my husband at 9:20 PM to say I\'d be late getting home.', isGuilty: true },
            { name: 'Admin Clerk Paul Jennings', emoji: '📋', alibi: 'I entered at 10:15 PM to file some late paperwork. I was in there until about 10:45 PM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Sandra claims she texted her husband at 9:20 PM while she was inside the records room. But the scenario states a Faraday cage around the room blocks all wireless signals — she could not have sent a text message from inside the records room.',
            highlights: [
                { text: 'Faraday cage around the room blocks all wireless signals', source: 'scenario' },
                { text: 'texted my husband at 9:20 PM to say I\'d be late', source: 'suspect', suspectName: 'IT Tech Sandra Kim' },
            ],
        },
        difficulty: 'devious',
        tags: ['hospital', 'data-breach', 'night', 'tech'],
    },
    {
        scenario: 'A priceless Gutenberg Bible page was stolen from a university library\'s special collections vault on Saturday. The vault is climate-controlled and kept at exactly 65°F year-round. Access requires passing through an airlock-style double door — the inner door cannot be opened until the outer door is fully sealed. Only three staff members have vault access. Saturday\'s visitor log shows four people entered between 10 AM and 2 PM.',
        suspects: [
            { name: 'Librarian Helen Marsh', emoji: '📚', alibi: 'I opened the vault at 10 AM and stayed until noon cataloging items. I was alone in the vault the entire time.', isGuilty: false },
            { name: 'Professor Carl Whitmore', emoji: '👨‍🏫', alibi: 'I had a research appointment from noon to 1 PM. Helen let me in and stayed while I examined several manuscripts.', isGuilty: false },
            { name: 'Conservator David Liu', emoji: '🧑‍🔬', alibi: 'I was in the vault from 1 to 2 PM doing routine condition checks. I noticed it felt unusually warm in there — probably around 75 degrees — so I logged a maintenance request before I left.', isGuilty: true },
            { name: 'Archivist Naomi Reed', emoji: '👩‍💼', alibi: 'I wasn\'t in the vault on Saturday. I was at a wedding in another state. My flight records confirm it.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'David claims the vault felt "unusually warm — probably around 75 degrees," but the scenario states the vault is climate-controlled and kept at exactly 65°F year-round. A 10-degree discrepancy would indicate the climate control failed, but no such failure is mentioned — and as a conservator, David would know the vault\'s exact temperature. His claim suggests he propped the doors open (breaking the airlock seal) to remove the Bible page, which would let warm air in.',
            highlights: [
                { text: 'climate-controlled and kept at exactly 65°F year-round', source: 'scenario' },
                { text: 'felt unusually warm in there — probably around 75 degrees', source: 'suspect', suspectName: 'Conservator David Liu' },
            ],
        },
        difficulty: 'devious',
        tags: ['library', 'theft', 'day', 'indoor'],
    },
    {
        scenario: 'A Formula 1 team\'s aerodynamics data was stolen from their factory in Surrey, England on the night of March 15th. The thief used a company laptop to copy files at 11:30 PM GMT. The factory uses biometric palm scanners at all entrances — records show only two people entered after 8 PM. A CCTV camera at the main gate captured all vehicles entering and leaving.',
        suspects: [
            { name: 'Engineer Rachel Foster', emoji: '👩‍🔧', alibi: 'I was at the factory until 10 PM finishing simulations. I\'m one of the two people who entered — I swiped in at 6 PM after dinner. I left at 10 PM and drove straight home.', isGuilty: false },
            { name: 'Aerodynamicist Kenji Mori', emoji: '👨‍💻', alibi: 'I was at our wind tunnel facility in Cologne, Germany that entire week. I flew back to England on the 16th. My hotel receipts and boarding pass confirm this.', isGuilty: false },
            { name: 'Designer Paul Ashworth', emoji: '✏️', alibi: 'I was the other person who entered after 8 PM — I came in at 8:30 to collect my laptop charger. I was in and out in five minutes. I then drove to my brother\'s birthday dinner in Manchester, which is about a four-hour drive from Surrey. I arrived around half past midnight.', isGuilty: true },
            { name: 'Team Principal Sofia Berger', emoji: '👩‍💼', alibi: 'I was at a sponsors\' dinner in London from 7 PM until midnight. Twenty people can confirm.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Paul claims he entered the factory at 8:30 PM, was "in and out in five minutes," then drove to Manchester (a four-hour drive) arriving "around half past midnight." 8:35 PM plus four hours is 12:35 AM — that timeline works. But the files were copied at 11:30 PM using a company laptop at the factory. If Paul truly left at 8:35 PM, he would have been on the road during the theft. However, he says he came in to collect his "laptop charger" — he didn\'t mention taking a laptop. The theft was committed with a company laptop at 11:30 PM, when Paul should have been mid-drive. His five-minute visit and charger story don\'t account for the laptop theft at 11:30 PM — unless he stayed much longer than he claimed.',
            highlights: [
                { text: 'used a company laptop to copy files at 11:30 PM GMT', source: 'scenario' },
                { text: 'came in at 8:30 to collect my laptop charger', source: 'suspect', suspectName: 'Designer Paul Ashworth' },
                { text: 'arrived around half past midnight', source: 'suspect', suspectName: 'Designer Paul Ashworth' },
            ],
        },
        difficulty: 'devious',
        tags: ['motorsport', 'espionage', 'night', 'tech'],
    },
    {
        scenario: 'A world-famous sapphire known as the "Star of Kerala" was stolen from a traveling exhibition at the Convention Center at 8 PM on Friday. The sapphire was in a display case connected to a silent alarm — when the case was opened, the alarm notified police at exactly 8:02 PM. The exhibition hall has only one public entrance, monitored by two guards who checked every visitor\'s bag on the way out. All 47 visitors who exited after 8 PM were searched. The sapphire was not found on any of them.',
        suspects: [
            { name: 'Curator Joanna Wells', emoji: '👩‍🎨', alibi: 'I was giving a talk in the lecture room adjacent to the hall from 7:30 to 8:30 PM. About 30 attendees can confirm.', isGuilty: false },
            { name: 'Photographer Liam Beckett', emoji: '📸', alibi: 'I was in the exhibition taking photos for the catalog. After the alarm went off, I was searched like everyone else. You can check — I had nothing but my camera gear. I left at 8:15 PM.', isGuilty: false },
            { name: 'Collector Agnes Moreau', emoji: '💎', alibi: 'I was viewing the exhibition. When the commotion started, I went to the restroom and then left through the fire exit to avoid the crowd. I went straight to my car.', isGuilty: true },
            { name: 'Security Guard Tom Adler', emoji: '👮', alibi: 'I was stationed at the entrance. After the alarm, I helped search all 47 visitors who left. Nobody got past me.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Agnes claims she left through the fire exit to "avoid the crowd," bypassing the bag check at the only public entrance. The scenario states all 47 visitors who exited after 8 PM were searched and the sapphire wasn\'t found — but Agnes specifically avoided being searched by exiting through the fire exit.',
            highlights: [
                { text: 'All 47 visitors who exited after 8 PM were searched', source: 'scenario' },
                { text: 'left through the fire exit to avoid the crowd', source: 'suspect', suspectName: 'Collector Agnes Moreau' },
            ],
        },
        difficulty: 'devious',
        tags: ['jewel', 'exhibition', 'night', 'indoor'],
    },
    {
        scenario: 'A chemical company\'s proprietary formula was photographed and leaked to a competitor on Monday. The formula is stored in a single physical binder kept in a windowless vault. The vault has no electrical outlets, no WiFi, and is illuminated by a single battery-operated LED panel. The vault door was opened three times on Monday according to the access log: 9 AM, 1 PM, and 4 PM.',
        suspects: [
            { name: 'Chemist Dr. Laura Vance', emoji: '👩‍🔬', alibi: 'I opened the vault at 9 AM to review the formula for a quality check. I spent about 30 minutes inside taking handwritten notes, then locked up.', isGuilty: false },
            { name: 'VP of Operations Rick Harmon', emoji: '👨‍💼', alibi: 'I opened the vault at 1 PM to verify the formula for an audit. I used my phone to photograph each page so I could review them at my desk, since there\'s no copier in there.', isGuilty: true },
            { name: 'Lab Technician Amy Chen', emoji: '🧪', alibi: 'I opened the vault at 4 PM to return a reagent list to the binder. I was in and out in two minutes.', isGuilty: false },
            { name: 'Security Officer Neil Grant', emoji: '👮', alibi: 'I monitor the vault access log from my station. I didn\'t enter the vault myself on Monday. Everything looked normal from the log.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Rick claims he used his phone to photograph the formula pages inside the vault. But the scenario states the vault has no WiFi and — more importantly — the formula was photographed and leaked. Rick admits to being the one who photographed the pages, providing himself the exact means to leak the formula.',
            highlights: [
                { text: 'proprietary formula was photographed and leaked', source: 'scenario' },
                { text: 'used my phone to photograph each page', source: 'suspect', suspectName: 'VP of Operations Rick Harmon' },
            ],
        },
        difficulty: 'devious',
        tags: ['chemical', 'espionage', 'day', 'corporate'],
    },
    {
        scenario: 'A rare manuscript was stolen from an auction house preview on Wednesday. The manuscript was kept in a glass case in the main showroom. At 3 PM, the fire alarm went off and the building was evacuated for 12 minutes. When everyone returned, the manuscript was gone. The glass case was intact — not broken or forced — and used a magnetic lock that can only be opened with a specific remote fob. Only the auction house director has that fob.',
        suspects: [
            { name: 'Director Margaret Thorne', emoji: '👩‍💼', alibi: 'I evacuated with everyone else. I was standing outside on the sidewalk with three of my staff. I never went back inside during the evacuation — the fire department wouldn\'t let anyone in.', isGuilty: false },
            { name: 'Bidder Charles Prescott', emoji: '🧐', alibi: 'I was outside during the evacuation chatting with another collector. We were together the entire time until the all-clear.', isGuilty: false },
            { name: 'Appraiser Simon Drake', emoji: '📋', alibi: 'I was examining the manuscript just before the alarm. When we evacuated, I went to my car to grab a reference book. When I came back in after the all-clear, I noticed the case was empty and reported it immediately.', isGuilty: false },
            { name: 'Intern Olivia Fenn', emoji: '👩‍🎓', alibi: 'I was near the back of the building when the alarm went off. I ran outside but realized I\'d left my bag inside. I slipped back in through the service entrance to grab it, and noticed the glass case was already open. I didn\'t think much of it at the time.', isGuilty: true },
        ],
        contradiction: {
            explanation: 'Olivia claims she slipped back in during the evacuation and saw the glass case "already open." But the case uses a magnetic lock that can only be opened with a specific remote fob held only by the director, and the case was intact (not broken or forced). The case could not have been standing "already open" unless someone with the fob opened it — and the director was accounted for outside. Olivia is the only person who admits to being inside during the evacuation when the theft occurred.',
            highlights: [
                { text: 'magnetic lock that can only be opened with a specific remote fob', source: 'scenario' },
                { text: 'Only the auction house director has that fob', source: 'scenario' },
                { text: 'noticed the glass case was already open', source: 'suspect', suspectName: 'Intern Olivia Fenn' },
            ],
        },
        difficulty: 'devious',
        tags: ['auction', 'manuscript', 'afternoon', 'indoor'],
    },
    {
        scenario: 'A sealed envelope containing a billionaire\'s will was tampered with in a law office over the weekend. The envelope was stored in a fireproof safe in the senior partner\'s office. The safe uses a time-lock that only permits opening during business hours: Monday to Friday, 9 AM to 5 PM. On weekends, the safe cannot be opened by anyone, regardless of the combination.',
        suspects: [
            { name: 'Senior Partner Alan Cross', emoji: '👨‍⚖️', alibi: 'I was at my lake house all weekend. I haven\'t been in the office since Friday at 4 PM. I discovered the tampering Monday morning when I opened the safe.', isGuilty: false },
            { name: 'Associate Diana Walsh', emoji: '👩‍⚖️', alibi: 'I came into the office on Saturday morning to prepare for a Monday trial. I was working in the library, not anywhere near Alan\'s office.', isGuilty: false },
            { name: 'Paralegal Robert Finch', emoji: '📋', alibi: 'I was in the office Sunday afternoon to organize discovery documents. I needed a reference file from the safe, so I opened it around 2 PM, grabbed my file, and closed it again. I didn\'t touch the envelope.', isGuilty: true },
            { name: 'Cleaning Staff Maria Gonzalez', emoji: '🧹', alibi: 'I cleaned the office Saturday evening from 6 to 9 PM. I vacuumed and emptied trash but I don\'t go into the partners\' offices — they\'re always locked.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Robert claims he opened the safe on Sunday at 2 PM, but the safe has a time-lock that only permits opening during business hours (Monday to Friday, 9 AM to 5 PM). The safe cannot be opened on a Sunday by anyone.',
            highlights: [
                { text: 'time-lock that only permits opening during business hours: Monday to Friday, 9 AM to 5 PM', source: 'scenario' },
                { text: 'On weekends, the safe cannot be opened by anyone', source: 'scenario' },
                { text: 'opened it around 2 PM', source: 'suspect', suspectName: 'Paralegal Robert Finch' },
            ],
        },
        difficulty: 'devious',
        tags: ['legal', 'tampering', 'weekend', 'indoor'],
    },
    {
        scenario: 'An irreplaceable fossil was stolen from a natural history museum during a thunderstorm on Friday night. The fossil was in a basement exhibit hall. The museum\'s loading dock — the only ground-level entrance to the basement — has a roll-up steel door that was welded shut three days prior for renovation. The only other basement access is an interior staircase from the main lobby, which was monitored by a guard all night.',
        suspects: [
            { name: 'Guard Patricia Wells', emoji: '👮', alibi: 'I was at the top of the basement stairs all night. Nobody went down those stairs on my watch. I never left my post.', isGuilty: false },
            { name: 'Curator Elliot Marsh', emoji: '🦴', alibi: 'I left the museum at 5 PM. I was at home watching the storm from my window. I have no reason to come back after hours.', isGuilty: false },
            { name: 'Maintenance Worker Joe Riggins', emoji: '🔧', alibi: 'I was checking the building\'s storm drains outside during the storm. Around 9 PM, I went through the loading dock to check for flooding in the basement. The fossil was still there when I saw it.', isGuilty: true },
            { name: 'Night Docent Ava Li', emoji: '🏛️', alibi: 'I was giving a private nighttime tour of the upper floors. My group of 8 visitors can all confirm I was with them from 7 PM to 10 PM.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Joe claims he went through the loading dock to check the basement, but the loading dock\'s roll-up steel door was welded shut three days prior for renovation. He could not have entered the basement through the loading dock.',
            highlights: [
                { text: 'loading dock — the only ground-level entrance to the basement — has a roll-up steel door that was welded shut three days prior', source: 'scenario' },
                { text: 'went through the loading dock to check for flooding in the basement', source: 'suspect', suspectName: 'Maintenance Worker Joe Riggins' },
            ],
        },
        difficulty: 'devious',
        tags: ['museum', 'fossil', 'night', 'weather'],
    },
    {
        scenario: 'A collection of gold coins was stolen from a numismatic shop on a Wednesday afternoon. The shop owner left for lunch at noon and returned at 1 PM to find the display case empty. The shop has a single entrance on Main Street, and the shop next door — a florist — has a security camera pointed at the shared sidewalk. The florist\'s footage shows that between noon and 1 PM, only two people approached the numismatic shop\'s door.',
        suspects: [
            { name: 'Mail Carrier Ron Briggs', emoji: '📬', alibi: 'I delivered mail to the shop at about 12:10 PM. The door was locked, so I slid it through the mail slot and moved on. I\'m on the florist\'s camera for sure.', isGuilty: false },
            { name: 'Collector Diane Mercer', emoji: '💰', alibi: 'I walked up to the shop around 12:30 PM. The door was locked and the sign said "Back at 1 PM," so I left and came back at 1:15 PM. That\'s when the owner told me about the theft.', isGuilty: false },
            { name: 'Plumber Steve Norton', emoji: '🔧', alibi: 'I was hired to fix a pipe in the shop\'s back room. I arrived at 11:45 AM and was working in the back when the owner left for lunch. I finished the job around 12:45 PM and left through the back alley door.', isGuilty: true },
            { name: 'Neighbor Florist Amy Park', emoji: '💐', alibi: 'I was in my flower shop all day. I didn\'t see anything unusual through my window. My camera was running the whole time.', isGuilty: false },
        ],
        contradiction: {
            explanation: 'Steve claims he was working in the back room when the owner left and then left through a "back alley door." But the scenario states the shop has a single entrance on Main Street. There is no back alley door — Steve fabricated his means of entry and exit.',
            highlights: [
                { text: 'shop has a single entrance on Main Street', source: 'scenario' },
                { text: 'left through the back alley door', source: 'suspect', suspectName: 'Plumber Steve Norton' },
            ],
        },
        difficulty: 'devious',
        tags: ['coins', 'theft', 'afternoon', 'shop'],
    },
];

export function generateAlibiPuzzle(date: Date): AlibiPuzzle & { _solution: { guiltyName: string; contradiction: AlibiContradiction } } {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 31 + 7);

    // Use seed-based cycling to spread through the full pool and avoid
    // repeating similar tags on consecutive days.
    const tagGroups = new Map<string, number[]>();
    ALIBI_POOL.forEach((t, i) => {
        for (const tag of t.tags) {
            if (!tagGroups.has(tag)) tagGroups.set(tag, []);
            tagGroups.get(tag)!.push(i);
        }
    });

    // Deterministic index that cycles through the entire pool before repeating
    const dayIndex = seed % ALIBI_POOL.length;

    // Build a "distance" score: penalise puzzles that share tags with yesterday's
    // or the-day-before's pick, so consecutive days feel varied.
    const prevSeed1 = (seed - 1) % ALIBI_POOL.length;
    const prevSeed2 = (seed - 2) % ALIBI_POOL.length;
    const prevTags1 = new Set(ALIBI_POOL[prevSeed1 >= 0 ? prevSeed1 : 0]?.tags ?? []);
    const prevTags2 = new Set(ALIBI_POOL[prevSeed2 >= 0 ? prevSeed2 : 0]?.tags ?? []);

    // Score each puzzle: lower = more overlap with recent days
    const scored = ALIBI_POOL.map((t, i) => {
        let overlap = 0;
        for (const tag of t.tags) {
            if (prevTags1.has(tag)) overlap += 2;
            if (prevTags2.has(tag)) overlap += 1;
        }
        return { index: i, overlap };
    });

    // Sort by overlap ascending, then use dayIndex to pick within low-overlap group
    scored.sort((a, b) => a.overlap - b.overlap || a.index - b.index);

    // Take the half with least overlap, then pick deterministically from that subset
    const candidatePool = scored.slice(0, Math.max(Math.ceil(ALIBI_POOL.length / 2), 1));
    const pick = candidatePool[dayIndex % candidatePool.length];
    const template = ALIBI_POOL[pick.index];

    // Shuffle suspect order
    const shuffledSuspects = seededShuffle(template.suspects, rng);

    return {
        scenario: template.scenario,
        suspects: shuffledSuspects.map(({ isGuilty: _, ...rest }) => rest),
        difficulty: template.difficulty,
        _solution: {
            guiltyName: template.suspects.find(s => s.isGuilty)!.name,
            contradiction: template.contradiction,
        },
    };
}

export function checkAlibiGuess(puzzle: ReturnType<typeof generateAlibiPuzzle>, guessName: string): boolean {
    return puzzle._solution.guiltyName === guessName;
}

export function computeAlibiScore(
    solved: boolean,
    guessNumber: number,
    timeSeconds: number,
): number {
    if (!solved) return 0;
    const basePts = guessNumber === 1 ? 100 : 50;
    const bonusCap = guessNumber === 1 ? 50 : 25;
    const timeBonus = Math.max(0, bonusCap - Math.floor(timeSeconds / 3));
    return basePts + timeBonus;
}
