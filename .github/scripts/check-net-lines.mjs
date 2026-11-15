/* eslint-disable no-console -- CI gate reporter */
/**
 * Net-addition gate: a change may only be merged if it adds more lines than it
 * removes (owner decision, 2026-11-14).
 *
 * It compares the base commit with HEAD (`git diff --numstat`) over every
 * tracked text file, whatever its type. Binary files have no line count and
 * are left out. A change whose additions do not exceed its deletions fails,
 * which includes a pure deletion, a revert and a change that nets to zero.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sums a `git diff --numstat` listing. Binary rows (`-\t-\tpath`) count as zero. */
export function netLines(
  numstat,
) {
  let added = 0;
  let removed = 0;
  for (const row of numstat.split(
    '\n',
  )) {
    const match =
      /^(\d+)\t(\d+)\t/.exec(
        row,
      );
    if (
      !match
    )
      continue;
    added +=
      Number(
        match[1],
      );
    removed +=
      Number(
        match[2],
      );
  }
  return {
    added,
    removed,
    net:
      added -
      removed,
  };
}

export function isNetAddition(
  numstat,
) {
  return (
    netLines(
      numstat,
    )
      .net >
    0
  );
}

export function diffNumstat(
  base,
) {
  return execFileSync(
    'git',
    [
      'diff',
      '--numstat',
      base,
      'HEAD',
    ],
    {
      encoding:
        'utf8',
      maxBuffer:
        1 <<
        30,
    },
  );
}

if (
  process
    .argv[1] &&
  pathToFileURL(
    resolve(
      process
        .argv[1],
    ),
  )
    .href ===
    import.meta
      .url
) {
  const base =
    process
      .env
      .BASE_SHA ||
    process
      .argv[2];
  if (
    !base ||
    !/^[a-zA-Z0-9._/~^-]{1,100}$/.test(
      base,
    )
  ) {
    console.error(
      '::error::No base commit to compare against, so the net line count is unknown.',
    );
    process.exit(
      1,
    );
  }
  const {
    added,
    removed,
    net,
  } =
    netLines(
      diffNumstat(
        base,
      ),
    );
  console.log(
    `Lines added: ${added}. Lines removed: ${removed}. Net: ${net}.`,
  );
  if (
    net <=
    0
  ) {
    console.error(
      `::error::This change is not a net addition of lines (net ${net}). It must add more lines than it removes.`,
    );
    process.exit(
      1,
    );
  }
}
