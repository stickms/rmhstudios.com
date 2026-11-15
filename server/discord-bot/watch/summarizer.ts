/**
 * The summarizer pass and the weekly digest (the I/O half of watch_summary.go / watch_digest.go).
 * Runs every 30 minutes as a pg-boss cron; the pure rules are in summary.ts.
 */
import type { DeepSeekClient } from '../deepseek';
import {
  ROLE_SYSTEM,
  ROLE_USER,
} from '../deepseek';
import {
  permanentDiscordError,
  type DiscordPort,
} from '../discord';
import {
  RETRY_API,
  permanent,
  withRetry,
} from '../retry';
import type { WatchRepo } from './repo';
import { dayBounds } from './rollup';
import {
  PERIOD_WEEK,
  SUMMARY_SAMPLE_LIMIT,
  SUMMARY_SYSTEM_PROMPT,
  buildDigestEmbed,
  buildSummaryPrompt,
  decideSummary,
  digestOldestKey,
  parseSummaryReply,
  pendingPeriods,
  periodRange,
  periodSealed,
  settleWindow,
  sourceHash,
  sumDays,
  type DayTotals,
} from './summary';
import type {
  WatchConfig,
  WatchLogger,
} from './watch';

const DAY_MS = 86_400_000;

export class WatchSummarizer {
  private constructor(
    private readonly cfg: WatchConfig,
    private readonly tz: string,
    private readonly repo: WatchRepo,
    private readonly deepseek: DeepSeekClient,
    private readonly port: DiscordPort,
    private readonly logger: WatchLogger,
  ) {}

  /** null when tracking is off or no DeepSeek key: the page then shows figures without prose. */
  static create(
    cfg: WatchConfig,
    tz: string,
    repo: WatchRepo,
    deepseek: DeepSeekClient,
    port: DiscordPort,
    logger: WatchLogger,
  ): WatchSummarizer | null {
    if (
      cfg
        .userIds
        .length ===
        0 ||
      !deepseek.configured()
    )
      return null;
    return new WatchSummarizer(
      cfg,
      tz,
      repo,
      deepseek,
      port,
      logger,
    );
  }

  /** One pass (then the digest, so a week sealed on this tick posts on it). */
  async tick(
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runPass(
      signal,
    );
    await this.postPendingDigests(
      Date.now(),
      signal,
    );
  }

  async runPass(
    signal?: AbortSignal,
  ): Promise<void> {
    const now =
      Date.now();
    for (const discordId of this
      .cfg
      .userIds) {
      for (const p of pendingPeriods(
        now,
        this
          .tz,
      )) {
        try {
          await this.summarize(
            discordId,
            p.period,
            p.key,
            now,
            signal,
          );
        } catch (err) {
          this.logger.warn(
            {
              event:
                'discord_bot.watch_summarize_failed',
              userId:
                discordId,
              period:
                p.period,
              key: p.key,
              err: (
                err as Error
              )
                .message,
            },
          );
        }
        if (
          signal?.aborted
        )
          return;
      }
    }
    const days =
      this
        .cfg
        .retentionDays;
    if (
      days >
      0
    ) {
      const cutoff =
        Date.now() -
        days *
          DAY_MS;
      try {
        const n =
          await this.repo.pruneMessages(
            cutoff,
          );
        if (
          n >
          0
        )
          this.logger.info(
            {
              event:
                'discord_bot.watch_pruned_messages',
              rows: n,
              retentionDays:
                days,
            },
          );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.watch_prune_messages_failed',
            err: (
              err as Error
            )
              .message,
          },
        );
      }
      await this.repo
        .purgeTypingSessions(
          cutoff,
        )
        .catch(
          (
            err: Error,
          ) =>
            this.logger.warn(
              {
                event:
                  'discord_bot.watch_prune_typing_failed',
                err: err.message,
              },
            ),
        );
    }
  }

  async summarize(
    discordId: string,
    period: string,
    key: string,
    now: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const previous =
      await this.repo.summarySourceHash(
        discordId,
        period,
        key,
      );
    const action =
      decideSummary(
        periodSealed(
          period,
          key,
          now,
          this
            .tz,
          settleWindow(),
        ),
        previous !==
          '',
      );
    if (
      action ===
      'sealed'
    )
      return;

    const [
      fromKey,
      toKey,
    ] =
      periodRange(
        period,
        key,
      );
    const days =
      await this.repo.daysInRange(
        discordId,
        fromKey,
        toKey,
      );
    const totals =
      sumDays(
        days,
      );
    if (
      totals.messages ===
        0 &&
      totals.voiceSec ===
        0 &&
      totals.gamingSec ===
        0
    )
      return;

    const [
      from,
    ] =
      dayBounds(
        fromKey,
        this
          .tz,
      );
    const [
      ,
      to,
    ] =
      dayBounds(
        toKey,
        this
          .tz,
      );
    const samples =
      await this.repo.sampleMessages(
        discordId,
        from,
        to,
        SUMMARY_SAMPLE_LIMIT,
      );
    const prompt =
      buildSummaryPrompt(
        period,
        key,
        days,
        totals,
        samples,
        this
          .tz,
      );
    const hash =
      sourceHash(
        prompt,
      );
    if (
      previous ===
      hash
    )
      return;

    const raw =
      await this.deepseek.chatWith(
        [
          {
            role: ROLE_SYSTEM,
            content:
              SUMMARY_SYSTEM_PROMPT,
          },
          {
            role: ROLE_USER,
            content:
              prompt,
          },
        ],
        {
          temperature: 0.9,
          presencePenalty: 0.3,
          frequencyPenalty: 0.3,
          signal,
        },
      );
    let parsed;
    try {
      parsed =
        parseSummaryReply(
          raw,
        );
    } catch (err) {
      throw new Error(
        `parse summary reply: ${(err as Error).message}`,
        {
          cause:
            err,
        },
      );
    }
    await this.repo.upsertSummary(
      {
        ...parsed,
        discordId,
        period,
        periodKey:
          key,
        model:
          this
            .deepseek
            .model,
        sourceHash:
          hash,
      },
    );
    if (
      action ===
      'backfill'
    ) {
      this.logger.info(
        {
          event:
            'discord_bot.watch_filled_unsummarised_period',
          userId:
            discordId,
          period,
          key,
        },
      );
    }
  }

  /** Post every sealed, never-announced week (claimed first; no pings, ever). */
  async postPendingDigests(
    now: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      !this
        .cfg
        .digestChannelId
    )
      return;
    const oldest =
      digestOldestKey(
        now,
        this
          .tz,
      );
    for (const discordId of this
      .cfg
      .userIds) {
      let pending;
      try {
        pending =
          await this.repo.unpostedWeekSummaries(
            discordId,
            oldest,
          );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.watch_digest_lookup_failed',
            userId:
              discordId,
            err: (
              err as Error
            )
              .message,
          },
        );
        continue;
      }
      for (const summary of pending) {
        if (
          !periodSealed(
            PERIOD_WEEK,
            summary.periodKey,
            now,
            this
              .tz,
            settleWindow(),
          )
        )
          continue;
        let claimed: boolean;
        try {
          claimed =
            await this.repo.claimDigest(
              discordId,
              summary.periodKey,
              now,
            );
        } catch (err) {
          this.logger.warn(
            {
              event:
                'discord_bot.watch_digest_claim_failed',
              periodKey:
                summary.periodKey,
              err: (
                err as Error
              )
                .message,
            },
          );
          continue;
        }
        if (
          !claimed
        )
          continue;
        let totals: DayTotals;
        try {
          const [
            fromKey,
            toKey,
          ] =
            periodRange(
              PERIOD_WEEK,
              summary.periodKey,
            );
          totals =
            sumDays(
              await this.repo.daysInRange(
                discordId,
                fromKey,
                toKey,
              ),
            );
        } catch (err) {
          this.logger.warn(
            {
              event:
                'discord_bot.watch_digest_totals_failed',
              periodKey:
                summary.periodKey,
              err: (
                err as Error
              )
                .message,
            },
          );
          totals =
            sumDays(
              [],
            );
        }
        try {
          await withRetry(
            'discord.digest.post',
            RETRY_API,
            async () => {
              try {
                await this.port.send(
                  this
                    .cfg
                    .digestChannelId,
                  {
                    allowed_mentions:
                      {
                        parse:
                          [],
                      },
                    embeds:
                      [
                        buildDigestEmbed(
                          summary,
                          totals,
                          this
                            .cfg
                            .siteURL,
                        ),
                      ],
                  },
                );
              } catch (err) {
                throw permanentDiscordError(
                  err,
                )
                  ? permanent(
                      err,
                    )
                  : err;
              }
            },
            {
              logger:
                this
                  .logger,
              signal,
            },
          );
        } catch (err) {
          this.logger.warn(
            {
              event:
                'discord_bot.watch_digest_post_failed',
              periodKey:
                summary.periodKey,
              err: (
                err as Error
              )
                .message,
            },
          );
          if (
            !permanentDiscordError(
              err,
            )
          ) {
            await this.repo
              .releaseDigest(
                discordId,
                summary.periodKey,
              )
              .catch(
                (
                  e: Error,
                ) =>
                  this.logger.warn(
                    {
                      event:
                        'discord_bot.watch_digest_release_failed',
                      err: e.message,
                    },
                  ),
              );
          }
          continue;
        }
        this.logger.info(
          {
            event:
              'discord_bot.watch_posted_weekly_digest',
            userId:
              discordId,
            periodKey:
              summary.periodKey,
          },
        );
      }
    }
  }
}
