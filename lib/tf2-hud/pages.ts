/**
 * The HUD pages the editor can preview. A page is just an ordered list of panel
 * files drawn together; the first few mirror what a player sees in a match, the
 * rest are the menus and dialogs. Any `.res` in a project can also be previewed
 * on its own (`singleFilePage`), so nothing is unreachable.
 */

import { CLASS_MAX_HEALTH, type TestState, type Tf2Class } from './fixtures';

const ui = (...names: string[]) => names.map((n) => `resource/ui/${n}.res`);

/** A class (with its full health) plus whatever else the page needs to show off. */
const as = (c: Tf2Class, extra: Partial<TestState> = {}): Partial<TestState> => ({
  playerClass: c,
  maxHealth: CLASS_MAX_HEALTH[c],
  health: CLASS_MAX_HEALTH[c],
  ...extra,
});

export type PageBackdrop = 'game' | 'menu';

export interface HudPage {
  id: string;
  label: string;
  group: string;
  backdrop: PageBackdrop;
  files: readonly string[];
  /** Test state applied when the page is chosen (class, weapon, meters) so it shows what it is for. */
  state?: Partial<TestState>;
}

export const PAGE_GROUPS = [
  'In-game',
  'Weapons & classes',
  'Objectives',
  'Menus',
  'Scoreboard & spectate',
  'Matchmaking',
  'Mann vs. Machine',
  'Items & loadout',
  'Other',
] as const;

export const PAGES: readonly HudPage[] = [
  {
    id: 'gameplay',
    label: 'Gameplay HUD',
    group: 'In-game',
    backdrop: 'game',
    files: ui(
      'hudplayerhealth',
      'hudammoweapons',
      'hudplayerclass',
      'hudaccountpanel',
      'hudmatchstatus',
      'hudmediccharge',
      'huddamageaccount',
      'hudhealthaccount',
      'hudweaponselection',
      'targetid',
      'hudalert',
      'hudkillstreaknotice',
    ),
  },
  {
    id: 'health',
    label: 'Player health',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudplayerhealth', 'hudhealthaccount'),
  },
  {
    id: 'ammo',
    label: 'Ammo & weapons',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudammoweapons', 'hudweaponselection'),
  },
  {
    id: 'class',
    label: 'Class & status',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudplayerclass', 'disguisestatuspanel'),
  },
  {
    id: 'medic',
    label: 'Medic charge',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudmediccharge', 'hudplayerhealth'),
  },
  {
    id: 'engineer',
    label: 'Engineer buildings',
    group: 'In-game',
    backdrop: 'game',
    files: ui(
      'hud_obj_sentrygun',
      'hud_obj_dispenser',
      'hud_obj_tele_entrance',
      'hud_obj_tele_exit',
      'hud_obj_sapper',
    ),
  },
  {
    id: 'itemmeters',
    label: 'Item meters',
    group: 'In-game',
    backdrop: 'game',
    files: ui(
      'huditemeffectmeter',
      'huditemeffectmeter_sniper',
      'huditemeffectmeter_scout',
      'huditemeffectmeter_spy',
      'huditemeffectmeter_demoman',
      'huditemeffectmeter_pyro',
      'huditemeffectmeter_heavy',
      'huditemeffectmeter_engineer',
    ),
  },
  {
    id: 'w-uber',
    label: 'Medic: Medi Gun & Über',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('hudmediccharge', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('medic', { weapon: 'medigun', charge: 100 }),
  },
  {
    id: 'w-vaccinator',
    label: 'Medic: Vaccinator (4 charges)',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('hudmediccharge', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('medic', { weapon: 'vaccinator', charge: 62 }),
  },
  {
    id: 'w-stickies',
    label: 'Demoman: stickies & charge',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('huddemomanpipes', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('demoman', { weapon: 'stickies', pipes: 6, meter: 55 }),
  },
  {
    id: 'w-shield',
    label: 'Demoman: shield charge',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('huddemomancharge', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('demoman', { weapon: 'shield', meter: 70 }),
  },
  {
    id: 'w-bow',
    label: 'Sniper: Huntsman bow charge',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('hudbowcharge', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('sniper', { weapon: 'huntsman', meter: 65 }),
  },
  {
    id: 'w-sniper',
    label: 'Sniper: rifle focus & Jarate',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'huditemeffectmeter_sniperfocus',
      'huditemeffectmeter_sniper',
      'hudplayerhealth',
      'hudplayerclass',
      'hudammoweapons',
    ),
    state: as('sniper', { weapon: 'sniper-rifle', meter: 60 }),
  },
  {
    id: 'w-engineer',
    label: 'Engineer: buildings & metal',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'hud_obj_sentrygun',
      'hud_obj_dispenser',
      'hud_obj_tele_entrance',
      'hud_obj_tele_exit',
      'hud_obj_sapper',
      'hudaccountpanel',
      'hudplayerhealth',
      'hudplayerclass',
      'hudammoweapons',
    ),
    state: as('engineer', { weapon: 'shotgun', sentryLevel: 2, metal: 200 }),
  },
  {
    id: 'w-pda-build',
    label: 'Engineer PDA: build',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'build_menu/hudmenuengybuild',
      'build_menu/sentry_selectable',
      'build_menu/dispenser_selectable',
      'build_menu/tele_entrance_active',
      'build_menu/tele_exit_active',
    ),
    state: as('engineer', { weapon: 'shotgun', metal: 200 }),
  },
  {
    id: 'w-pda-destroy',
    label: 'Engineer PDA: destroy',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'destroy_menu/hudmenuengydestroy',
      'destroy_menu/sentry_active',
      'destroy_menu/dispenser_active',
      'destroy_menu/tele_entrance_active',
    ),
    state: as('engineer', { weapon: 'shotgun' }),
  },
  {
    id: 'w-spy',
    label: 'Spy: cloak, disguise & knife',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'disguisestatuspanel',
      'huditemeffectmeter_spy',
      'huditemeffectmeter_spyknife',
      'hudplayerhealth',
      'hudplayerclass',
      'hudammoweapons',
    ),
    state: as('spy', { weapon: 'cloak', meter: 60 }),
  },
  {
    id: 'w-scout',
    label: 'Scout: Bonk!, Hype & Cleaver',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'huditemeffectmeter_scout',
      'huditemeffectmeter_sodapopper',
      'huditemeffectmeter_cleaver',
      'hudplayerhealth',
      'hudplayerclass',
      'hudammoweapons',
    ),
    state: as('scout', { weapon: 'sodapopper', meter: 75 }),
  },
  {
    id: 'w-pyro',
    label: 'Pyro: Thermal Thruster, Gas & Bison',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui(
      'hudrocketpack',
      'huditemeffectmeter_pyro',
      'huditemeffectmeter_raygun',
      'hudplayerhealth',
      'hudplayerclass',
      'hudammoweapons',
    ),
    state: as('pyro', { weapon: 'thermal-thruster', meter: 80 }),
  },
  {
    id: 'w-soldier',
    label: 'Soldier: banner rage',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('huditemeffectmeter', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('soldier', { weapon: 'buff-banner', meter: 90 }),
  },
  {
    id: 'w-heavy',
    label: 'Heavy: Sandvich & minigun',
    group: 'Weapons & classes',
    backdrop: 'game',
    files: ui('huditemeffectmeter_heavy', 'hudplayerhealth', 'hudplayerclass', 'hudammoweapons'),
    state: as('heavy', { weapon: 'sandvich', meter: 100 }),
  },
  {
    id: 'killfeed',
    label: 'Kill streaks & damage',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudkillstreaknotice', 'huddamageaccount', 'hudachievementfloatingnumber'),
  },
  {
    id: 'chat',
    label: 'Chat & vote',
    group: 'In-game',
    backdrop: 'game',
    files: ['resource/chatscheme.res', ...ui('votehud', 'globalchat', 'chatpopup')],
  },
  {
    id: 'freeze',
    label: 'Freeze-cam',
    group: 'In-game',
    backdrop: 'game',
    files: ui('freezepanel_basic', 'freezepanelcallout', 'freezepanelkillerhealth'),
  },
  {
    id: 'taunt',
    label: 'Taunt & spell menus',
    group: 'In-game',
    backdrop: 'game',
    files: ui('hudmenutauntselection', 'hudspellselection'),
  },
  {
    id: 'cp',
    label: 'Control points',
    group: 'Objectives',
    backdrop: 'game',
    files: ui(
      'hudobjectivestatus',
      'controlpointicon',
      'controlpointcountdown',
      'controlpointprogressbar',
      'hudobjectivetimepanel',
      'hudroundcounter',
    ),
  },
  {
    id: 'ctf',
    label: 'Capture the flag',
    group: 'Objectives',
    backdrop: 'game',
    files: ui('hudobjectiveflagpanel', 'flagstatus', 'flagcalloutpanel'),
  },
  {
    id: 'payload',
    label: 'Payload',
    group: 'Objectives',
    backdrop: 'game',
    files: ui('objectivestatusescort', 'objectivestatusmultipleescort', 'hudobjectivetimepanel'),
  },
  {
    id: 'koth',
    label: 'King of the Hill',
    group: 'Objectives',
    backdrop: 'game',
    files: ui('hudobjectivekothtimepanel'),
  },
  {
    id: 'pd',
    label: 'Player Destruction',
    group: 'Objectives',
    backdrop: 'game',
    files: ui('hudobjectiveplayerdestruction'),
  },
  {
    id: 'rd',
    label: 'Robot Destruction',
    group: 'Objectives',
    backdrop: 'game',
    files: ui(
      'robotdestructionstatus',
      'tfhudrobotdestruction_activestate',
      'tfhudrobotdestruction_deadstate',
      'tfhudrobotdestruction_robotindicator',
      'tfhudrobotdestruction_shieldedstate',
      'hudobjectiverobotdestruction',
    ),
  },
  {
    id: 'arena',
    label: 'Arena',
    group: 'Objectives',
    backdrop: 'game',
    files: ui(
      'hudarenaplayercount',
      'hudarenavspanel',
      'hudarenawinpanel',
      'hudarenanotification',
      'hudarenacappointcountdown',
    ),
  },
  {
    id: 'passtime',
    label: 'PASS Time',
    group: 'Objectives',
    backdrop: 'game',
    files: ui(
      'hudpasstime',
      'hudpasstimeballstatus',
      'hudpasstimeteamscore',
      'hudpasstimepassnotify',
    ),
  },
  {
    id: 'winpanel',
    label: 'Round win',
    group: 'Objectives',
    backdrop: 'game',
    files: ui('winpanel', 'hudstalemate', 'hudteamgoal'),
  },
  {
    id: 'mainmenu',
    label: 'Main menu',
    group: 'Menus',
    backdrop: 'menu',
    files: ['resource/gamemenu.res', ...ui('mainmenuoverride', 'ingamequeuestatus')],
  },
  {
    id: 'classselect',
    label: 'Class selection',
    group: 'Menus',
    backdrop: 'menu',
    files: ui('classselection'),
  },
  {
    id: 'classmenu',
    label: 'Class menu',
    group: 'Menus',
    backdrop: 'menu',
    files: ui('classmenu', 'classtipslist', 'classtipsitem'),
  },
  { id: 'teammenu', label: 'Team menu', group: 'Menus', backdrop: 'menu', files: ui('teammenu') },
  { id: 'mapinfo', label: 'Map info', group: 'Menus', backdrop: 'menu', files: ui('mapinfomenu') },
  { id: 'intro', label: 'Intro menu', group: 'Menus', backdrop: 'menu', files: ui('intromenu') },
  {
    id: 'textwindow',
    label: 'MOTD window',
    group: 'Menus',
    backdrop: 'menu',
    files: ui('textwindow'),
  },
  {
    id: 'build',
    label: 'Build menu',
    group: 'Menus',
    backdrop: 'game',
    files: ui(
      'build_menu/hudmenuengybuild',
      'build_menu/sentry_selectable',
      'build_menu/dispenser_selectable',
      'build_menu/tele_entrance_active',
    ),
  },
  {
    id: 'disguise',
    label: 'Disguise menu',
    group: 'Menus',
    backdrop: 'game',
    files: ui('disguise_menu/scout_red', 'disguise_menu/spy_blue'),
  },
  {
    id: 'loading',
    label: 'Loading screen',
    group: 'Menus',
    backdrop: 'menu',
    files: ['resource/loadingdialog.res'],
  },
  {
    id: 'scoreboard',
    label: 'Scoreboard',
    group: 'Scoreboard & spectate',
    backdrop: 'game',
    files: ui('scoreboard'),
  },
  {
    id: 'spectator',
    label: 'Spectator',
    group: 'Scoreboard & spectate',
    backdrop: 'game',
    files: ui('spectator', 'spectatorguihealth', 'spectatortournament'),
  },
  {
    id: 'tournament',
    label: 'Tournament',
    group: 'Scoreboard & spectate',
    backdrop: 'game',
    files: ui('hudtournament', 'hudtournamentsetup'),
  },
  {
    id: 'matchmaking',
    label: 'Matchmaking dashboard',
    group: 'Matchmaking',
    backdrop: 'menu',
    files: ui(
      'matchmakingdashboard',
      'matchmakingdashboardleftsidepanel',
      'matchmakingdashboardsidepanel',
    ),
  },
  {
    id: 'lobby',
    label: 'Lobby',
    group: 'Matchmaking',
    backdrop: 'menu',
    files: ui('lobbycontainerframe', 'lobbypanel'),
  },
  {
    id: 'comp',
    label: 'Competitive',
    group: 'Matchmaking',
    backdrop: 'menu',
    files: ui('matchmakingdashboardcomp', 'comprankpanel', 'compstats'),
  },
  {
    id: 'mvmhud',
    label: 'MvM HUD',
    group: 'Mann vs. Machine',
    backdrop: 'game',
    files: ui(
      'hudmannvsmachinestatus',
      'wavestatuspanel',
      'mvminworldcurrency',
      'hudcurrencyaccount',
      'hudupgradepanel',
    ),
  },
  {
    id: 'mvmscore',
    label: 'MvM scoreboard',
    group: 'Mann vs. Machine',
    backdrop: 'game',
    files: ui('mvmscoreboard', 'mvmscoreboardenemyinfo'),
  },
  {
    id: 'mvmvictory',
    label: 'MvM victory',
    group: 'Mann vs. Machine',
    backdrop: 'menu',
    files: ui('mvmvictorypanel', 'mvmvictorycontainer', 'mvmvictorysplash'),
  },
  {
    id: 'loadout',
    label: 'Loadout',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('charinfopanel', 'charinfoloadoutsubpanel', 'classloadoutpanel'),
  },
  {
    id: 'backpack',
    label: 'Backpack',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('econ/backpackpanel'),
  },
  {
    id: 'inspect',
    label: 'Item inspection',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('econ/inspectionpanel'),
  },
  {
    id: 'store',
    label: 'Mann Co. Store',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('econ/store/v2/storepanel', 'econ/store/v2/storepage_items'),
  },
  {
    id: 'craft',
    label: 'Crafting',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('craftingpanel', 'craftingstatusdialog'),
  },
  {
    id: 'achievements',
    label: 'Achievements',
    group: 'Items & loadout',
    backdrop: 'menu',
    files: ui('achievementsdialog'),
  },
  {
    id: 'training',
    label: 'Training',
    group: 'Other',
    backdrop: 'menu',
    files: ui('training/modeselection/modeselection'),
  },
];

export const DEFAULT_PAGE_ID = 'gameplay';

export function pageById(id: string): HudPage | undefined {
  return PAGES.find((p) => p.id === id);
}

export const SINGLE_FILE_PREFIX = 'file:';

/** Any panel file as an ad-hoc page, so every `.res` is previewable. */
export function singleFilePage(path: string): HudPage {
  return {
    id: `${SINGLE_FILE_PREFIX}${path}`,
    label: path.replace(/^resource\/(ui\/)?/, ''),
    group: 'Other',
    backdrop: path.includes('hud') ? 'game' : 'menu',
    files: [path],
  };
}

export function resolvePage(id: string): HudPage | undefined {
  if (id.startsWith(SINGLE_FILE_PREFIX)) return singleFilePage(id.slice(SINGLE_FILE_PREFIX.length));
  return pageById(id);
}
