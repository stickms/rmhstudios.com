/**
 * Persistence for the Alex tamagotchi (port of discordbot/pet_repo.go): the global pet row
 * (discord_alex_pet), per-guild bookkeeping (discord_alex_guild), the caretaker leaderboard
 * (discord_alex_caretaker) and the shared image-spend budget (image_gen_budget). Same statements
 * as the Go bot; every write is an idempotent upsert. A database-less Sql makes every method a
 * no-op / not-found.
 */
import {
  at,
  ms,
  msReq,
  num,
  type Sql,
} from './db';
import type {
  LifeStage,
  PetState,
} from './pet';

const PET_COLUMNS = `"guildId","name","generation","bornAt","hunger","happiness","energy","hygiene","health","intelligence","alive","lifeStage","career","statsUpdatedAt","lastInteractionAt","lastChannelId","lastFedAt","lastPlayedAt","lastCleanedAt","lastSleptAt","lastStudiedAt","lastChatAt","lastCareAlertAt","lastAmbientAt","diedAt","introSentAt","createdAt","updatedAt"`;

export const MSG_LEVEL_ALL =
  'all';
export const MSG_LEVEL_CARE =
  'care';
export const MSG_LEVEL_OFF =
  'off';

export interface GuildChannel {
  guildId: string;
  channelId: string;
  messageLevel: string;
}

export interface CaretakerRow {
  userId: string;
  username: string;
  feeds: number;
  plays: number;
  cleans: number;
  naps: number;
  talks: number;
  studies: number;
  interactions: number;
  points: number;
}

/** Whitelisted counter columns — the column name never comes from input. */
const CARE_COLUMN: Record<
  string,
  string
> =
  {
    feeds:
      '"feeds"',
    plays:
      '"plays"',
    cleans:
      '"cleans"',
    naps: '"naps"',
    talks:
      '"talks"',
    studies:
      '"studies"',
    interactions:
      '"interactions"',
  };

type Row =
  Record<
    string,
    unknown
  >;

function scanPet(
  r: Row,
): PetState {
  return {
    guildId:
      String(
        r.guildId,
      ),
    name: String(
      r.name,
    ),
    generation:
      num(
        r.generation,
      ),
    bornAt:
      msReq(
        r.bornAt,
      ),
    hunger:
      num(
        r.hunger,
      ),
    happiness:
      num(
        r.happiness,
      ),
    energy:
      num(
        r.energy,
      ),
    hygiene:
      num(
        r.hygiene,
      ),
    health:
      num(
        r.health,
      ),
    intelligence:
      num(
        r.intelligence,
      ),
    alive:
      Boolean(
        r.alive,
      ),
    lifeStage:
      String(
        r.lifeStage,
      ) as LifeStage,
    career:
      (r.career as
        | string
        | null) ??
      '',
    statsUpdatedAt:
      msReq(
        r.statsUpdatedAt,
      ),
    lastInteractionAt:
      msReq(
        r.lastInteractionAt,
      ),
    lastChannelId:
      (r.lastChannelId as
        | string
        | null) ??
      '',
    lastFedAt:
      ms(
        r.lastFedAt,
      ),
    lastPlayedAt:
      ms(
        r.lastPlayedAt,
      ),
    lastCleanedAt:
      ms(
        r.lastCleanedAt,
      ),
    lastSleptAt:
      ms(
        r.lastSleptAt,
      ),
    lastStudiedAt:
      ms(
        r.lastStudiedAt,
      ),
    lastChatAt:
      ms(
        r.lastChatAt,
      ),
    lastCareAlertAt:
      ms(
        r.lastCareAlertAt,
      ),
    lastAmbientAt:
      ms(
        r.lastAmbientAt,
      ),
    diedAt:
      ms(
        r.diedAt,
      ),
    introSentAt:
      ms(
        r.introSentAt,
      ),
    createdAt:
      msReq(
        r.createdAt,
      ),
    updatedAt:
      msReq(
        r.updatedAt,
      ),
  };
}

export class PetRepo {
  constructor(
    private readonly sql: Sql,
  ) {}

  async load(
    guildId: string,
  ): Promise<PetState | null> {
    if (
      !this
        .sql
        .enabled
    )
      return null;
    const r =
      await this.sql.one<Row>(
        `SELECT ${PET_COLUMNS} FROM "discord_alex_pet" WHERE "guildId"=$1`,
        guildId,
      );
    return r
      ? scanPet(
          r,
        )
      : null;
  }

  async save(
    p: PetState,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    p.updatedAt =
      Date.now();
    await this.sql.exec(
      `INSERT INTO "discord_alex_pet" (${PET_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       ON CONFLICT ("guildId") DO UPDATE SET
         "name"=EXCLUDED."name",
         "generation"=EXCLUDED."generation",
         "bornAt"=EXCLUDED."bornAt",
         "hunger"=EXCLUDED."hunger",
         "happiness"=EXCLUDED."happiness",
         "energy"=EXCLUDED."energy",
         "hygiene"=EXCLUDED."hygiene",
         "health"=EXCLUDED."health",
         "intelligence"=EXCLUDED."intelligence",
         "alive"=EXCLUDED."alive",
         "lifeStage"=EXCLUDED."lifeStage",
         "career"=EXCLUDED."career",
         "statsUpdatedAt"=EXCLUDED."statsUpdatedAt",
         "lastInteractionAt"=EXCLUDED."lastInteractionAt",
         "lastChannelId"=EXCLUDED."lastChannelId",
         "lastFedAt"=EXCLUDED."lastFedAt",
         "lastPlayedAt"=EXCLUDED."lastPlayedAt",
         "lastCleanedAt"=EXCLUDED."lastCleanedAt",
         "lastSleptAt"=EXCLUDED."lastSleptAt",
         "lastStudiedAt"=EXCLUDED."lastStudiedAt",
         "lastChatAt"=EXCLUDED."lastChatAt",
         "lastCareAlertAt"=EXCLUDED."lastCareAlertAt",
         "lastAmbientAt"=EXCLUDED."lastAmbientAt",
         "diedAt"=EXCLUDED."diedAt",
         "introSentAt"=EXCLUDED."introSentAt",
         "updatedAt"=EXCLUDED."updatedAt"`,
      p.guildId,
      p.name,
      p.generation,
      at(
        p.bornAt,
      ),
      p.hunger,
      p.happiness,
      p.energy,
      p.hygiene,
      p.health,
      p.intelligence,
      p.alive,
      p.lifeStage,
      p.career ||
        null,
      at(
        p.statsUpdatedAt,
      ),
      at(
        p.lastInteractionAt,
      ),
      p.lastChannelId ||
        null,
      at(
        p.lastFedAt,
      ),
      at(
        p.lastPlayedAt,
      ),
      at(
        p.lastCleanedAt,
      ),
      at(
        p.lastSleptAt,
      ),
      at(
        p.lastStudiedAt,
      ),
      at(
        p.lastChatAt,
      ),
      at(
        p.lastCareAlertAt,
      ),
      at(
        p.lastAmbientAt,
      ),
      at(
        p.diedAt,
      ),
      at(
        p.introSentAt,
      ),
      at(
        p.createdAt,
      ),
      at(
        p.updatedAt,
      ),
    );
  }

  // ─── Per-guild bookkeeping (discord_alex_guild) ─────────────────────────

  async recordGuildChannel(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled ||
      !guildId ||
      !channelId
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","updatedAt")
       VALUES ($1,$2,$3)
       ON CONFLICT ("guildId") DO UPDATE SET
         "lastChannelId"=EXCLUDED."lastChannelId",
         "updatedAt"=EXCLUDED."updatedAt"`,
      guildId,
      channelId,
      new Date(),
    );
  }

  async clearGuildChannel(
    guildId: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_alex_guild" SET "lastChannelId"=NULL, "updatedAt"=$2 WHERE "guildId"=$1`,
      guildId,
      new Date(),
    );
  }

  async guildIntroSent(
    guildId: string,
  ): Promise<boolean> {
    if (
      !this
        .sql
        .enabled
    )
      return false;
    const r =
      await this.sql.one<Row>(
        `SELECT "introSentAt" FROM "discord_alex_guild" WHERE "guildId"=$1`,
        guildId,
      );
    return (
      r !==
        null &&
      r.introSentAt !==
        null &&
      r.introSentAt !==
        undefined
    );
  }

  async markGuildIntro(
    guildId: string,
    channelId: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      new Date();
    await this.sql.exec(
      `INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","introSentAt","updatedAt")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("guildId") DO UPDATE SET
         "lastChannelId"=EXCLUDED."lastChannelId",
         "introSentAt"=EXCLUDED."introSentAt",
         "updatedAt"=EXCLUDED."updatedAt"`,
      guildId,
      channelId,
      now,
      now,
    );
  }

  async allGuildChannels(): Promise<
    GuildChannel[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "guildId","lastChannelId","messageLevel" FROM "discord_alex_guild" WHERE "lastChannelId" IS NOT NULL`,
      );
    return rows.map(
      (
        r,
      ) => ({
        guildId:
          String(
            r.guildId,
          ),
        channelId:
          String(
            r.lastChannelId,
          ),
        messageLevel:
          String(
            r.messageLevel,
          ),
      }),
    );
  }

  async guildMessageLevel(
    guildId: string,
  ): Promise<string> {
    if (
      !this
        .sql
        .enabled
    )
      return MSG_LEVEL_ALL;
    const r =
      await this.sql.one<Row>(
        `SELECT "messageLevel" FROM "discord_alex_guild" WHERE "guildId"=$1`,
        guildId,
      );
    return r
      ? String(
          r.messageLevel,
        )
      : MSG_LEVEL_ALL;
  }

  /** Set the level; a non-empty channel is recorded too, an empty one leaves the stored channel. */
  async setGuildMessageLevel(
    guildId: string,
    channelId: string,
    level: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","messageLevel","updatedAt")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("guildId") DO UPDATE SET
         "messageLevel"=EXCLUDED."messageLevel",
         "lastChannelId"=COALESCE(EXCLUDED."lastChannelId", "discord_alex_guild"."lastChannelId"),
         "updatedAt"=EXCLUDED."updatedAt"`,
      guildId,
      channelId ||
        null,
      level,
      new Date(),
    );
  }

  async guildCustomPrompt(
    guildId: string,
  ): Promise<string> {
    if (
      !this
        .sql
        .enabled ||
      !guildId
    )
      return '';
    const r =
      await this.sql.one<Row>(
        `SELECT "customPrompt" FROM "discord_alex_guild" WHERE "guildId"=$1`,
        guildId,
      );
    return (
      (r?.customPrompt as
        | string
        | null
        | undefined) ??
      ''
    );
  }

  /** Set (or with "" clear → NULL) the guild's persona prompt. */
  async setGuildCustomPrompt(
    guildId: string,
    prompt: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled ||
      !guildId
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_alex_guild" ("guildId","customPrompt","updatedAt")
       VALUES ($1,$2,$3)
       ON CONFLICT ("guildId") DO UPDATE SET
         "customPrompt"=EXCLUDED."customPrompt",
         "updatedAt"=EXCLUDED."updatedAt"`,
      guildId,
      prompt ||
        null,
      new Date(),
    );
  }

  // ─── Caretaker leaderboard ──────────────────────────────────────────────

  async bumpCaretaker(
    guildId: string,
    userId: string,
    username: string,
    avatarHash: string,
    care: string,
    points: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const col =
      CARE_COLUMN[
        care
      ];
    if (
      !col
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_alex_caretaker" ("guildId","userId","username","avatarHash",${col},"points","updatedAt")
       VALUES ($1,$2,$3,$4,1,$5,$6)
       ON CONFLICT ("guildId","userId") DO UPDATE SET
         "username"=EXCLUDED."username",
         "avatarHash"=COALESCE(EXCLUDED."avatarHash", "discord_alex_caretaker"."avatarHash"),
         ${col}="discord_alex_caretaker".${col}+1,
         "points"="discord_alex_caretaker"."points"+$5,
         "updatedAt"=EXCLUDED."updatedAt"`,
      guildId,
      userId,
      username,
      avatarHash ||
        null,
      points,
      new Date(),
    );
  }

  async topCaretakers(
    guildId: string,
    limit: number,
  ): Promise<
    CaretakerRow[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "userId","username","feeds","plays","cleans","naps","talks","studies","interactions","points"
         FROM "discord_alex_caretaker" WHERE "guildId"=$1
         ORDER BY "points" DESC, "updatedAt" ASC LIMIT $2`,
        guildId,
        limit,
      );
    return rows.map(
      (
        r,
      ) => ({
        userId:
          String(
            r.userId,
          ),
        username:
          String(
            r.username,
          ),
        feeds:
          num(
            r.feeds,
          ),
        plays:
          num(
            r.plays,
          ),
        cleans:
          num(
            r.cleans,
          ),
        naps: num(
          r.naps,
        ),
        talks:
          num(
            r.talks,
          ),
        studies:
          num(
            r.studies,
          ),
        interactions:
          num(
            r.interactions,
          ),
        points:
          num(
            r.points,
          ),
      }),
    );
  }

  async setCaretakerAvatar(
    guildId: string,
    userId: string,
    avatarHash: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_alex_caretaker" SET "avatarHash"=$3 WHERE "guildId"=$1 AND "userId"=$2`,
      guildId,
      userId,
      avatarHash ||
        null,
    );
  }

  /**
   * Reserve one unit of today's global image budget (shared with the web tier and the bot
   * worker). Fails closed: false at cap; a DB error propagates and the caller treats it as no.
   */
  async reserveImageBudget(
    day: string,
    cap: number,
  ): Promise<boolean> {
    if (
      !this
        .sql
        .enabled
    )
      return false;
    const r =
      await this.sql.one<Row>(
        `INSERT INTO "image_gen_budget" (day, count) VALUES ($1, 1)
       ON CONFLICT (day) DO UPDATE
         SET count = "image_gen_budget".count + 1
         WHERE "image_gen_budget".count < $2
       RETURNING count`,
        day,
        cap,
      );
    return (
      r !==
      null
    );
  }
}
