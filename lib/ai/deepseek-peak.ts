/**
 * DeepSeek's peak-price hours. Off-peak calls cost half, so background work
 * whose output is not needed at once (bot upkeep, queued bot posts, stored
 * summaries) waits for off-peak hours instead of running here.
 *
 * Source: api-docs.deepseek.com/quick_start/pricing, read 2026-11-20: "Peak
 * hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday,
 * excluding Chinese public holidays. All other hours are off-peak." Holidays
 * are treated as peak here, which only means a little less is moved on those
 * days. If DeepSeek changes the schedule, edit the windows below.
 *
 * Plain module (not `.server`): the Discord bot imports it by relative path.
 */

/** [startHour, endHour) in UTC, Monday to Friday. */
const PEAK_WINDOWS_UTC: readonly (readonly [
  number,
  number,
])[] =
  [
    [
      1,
      4,
    ],
    [
      6,
      10,
    ],
  ];

/** True during DeepSeek's peak-price hours. */
export function isDeepseekPeak(
  at:
    | Date
    | number,
): boolean {
  const d =
    typeof at ===
    'number'
      ? new Date(
          at,
        )
      : at;
  const day =
    d.getUTCDay();
  if (
    day ===
      0 ||
    day ===
      6
  )
    return false;
  const hour =
    d.getUTCHours();
  return PEAK_WINDOWS_UTC.some(
    ([
      start,
      end,
    ]) =>
      hour >=
        start &&
      hour <
        end,
  );
}
