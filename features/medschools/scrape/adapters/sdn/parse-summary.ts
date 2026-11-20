/**
 * Interview-feedback summary parser. Only the aggregate fields and the raw `questionsAsked` strings leave here;
 * comments, searchText, reportUrl, ids, hotel and airport free text are dropped.
 */
import { parse } from 'node-html-parser';
import { SdnPageError } from './guard';

export interface SdnSummary {
  reports: number;
  format:
    | string
    | null;
  fileType:
    | string
    | null;
  interviewStyle:
    | string
    | null;
  interviewLength:
    | string
    | null;
  avgStress:
    | number
    | null;
  /** Mean of Positively = 1, No change = 0, Negatively = -1. */
  avgImpression:
    | number
    | null;
  /** From the rendered "in-state status" card; null when the card is absent. */
  inStateCount:
    | number
    | null;
  outOfStateCount:
    | number
    | null;
  questionBlobs: string[];
}

const IMPRESSION: Record<
  string,
  number
> =
  {
    positively: 1,
    'no change': 0,
    negatively:
      -1,
  };

function str(
  v: unknown,
): string {
  return typeof v ===
    'string'
    ? v.trim()
    : '';
}

function mode(
  values: string[],
):
  | string
  | null {
  const counts =
    new Map<
      string,
      number
    >();
  for (const v of values)
    if (
      v
    )
      counts.set(
        v,
        (counts.get(
          v,
        ) ??
          0) +
          1,
      );
  let best:
    | string
    | null =
    null;
  let n = 0;
  for (const [
    v,
    c,
  ] of counts)
    if (
      c >
      n
    )
      [
        best,
        n,
      ] =
        [
          v,
          c,
        ];
  return best;
}

function mean(
  values: number[],
):
  | number
  | null {
  return values.length ===
    0
    ? null
    : Math.round(
        (values.reduce(
          (
            a,
            b,
          ) =>
            a +
            b,
          0,
        ) /
          values.length) *
          100,
      ) /
        100;
}

function inStateCounts(
  root: ReturnType<
    typeof parse
  >,
): {
  inState: number;
  outOfState: number;
} | null {
  const title =
    root
      .querySelectorAll(
        'p',
      )
      .find(
        (
          p,
        ) =>
          /^what is your in-state status\?$/i.test(
            p.text.trim(),
          ),
      );
  const dist =
    title?.parentNode?.querySelector(
      '.sdn-response-distribution',
    );
  if (
    !dist
  )
    return null;
  let inState:
    | number
    | null =
    null;
  let outOfState:
    | number
    | null =
    null;
  for (const label of dist.querySelectorAll(
    'div.truncate',
  )) {
    const count =
      label.parentNode
        ?.querySelectorAll(
          'span.tabular-nums',
        )
        .pop()
        ?.text.replace(
          /[,\s]/g,
          '',
        );
    if (
      !count ||
      !/^\d+$/.test(
        count,
      )
    )
      continue;
    const t =
      label.text
        .trim()
        .toLowerCase();
    if (
      /^in[- ]state$/.test(
        t,
      )
    )
      inState =
        Number(
          count,
        );
    else if (
      /^out[- ]of[- ]state$/.test(
        t,
      )
    )
      outOfState =
        Number(
          count,
        );
  }
  return inState ===
    null ||
    outOfState ===
      null
    ? null
    : {
        inState,
        outOfState,
      };
}

export function parseSummaryPage(
  html: string,
): SdnSummary {
  const m =
    /<script[^>]*\bid="interview-feedback-data"[^>]*>([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (
    !m
  )
    throw new SdnPageError(
      'summary: no inline report array',
    );
  let data: unknown;
  try {
    data =
      JSON.parse(
        m[1] ??
          '',
      );
  } catch {
    throw new SdnPageError(
      'summary: report array is not JSON',
    );
  }
  if (
    !Array.isArray(
      data,
    )
  )
    throw new SdnPageError(
      'summary: report data is not an array',
    );
  const reports =
    data.filter(
      (
        r,
      ): r is Record<
        string,
        unknown
      > =>
        typeof r ===
          'object' &&
        r !==
          null,
    );

  const stress =
    reports.flatMap(
      (
        r,
      ) => {
        const s =
          /^(\d+(?:\.\d+)?)\s*\/\s*10$/.exec(
            str(
              r.stress,
            ),
          );
        return s
          ? [
              Number(
                s[1],
              ),
            ]
          : [];
      },
    );
  const impression =
    reports.flatMap(
      (
        r,
      ) => {
        const v =
          IMPRESSION[
            str(
              r.impression,
            )
              .replace(
                /[^A-Za-z ]/g,
                '',
              )
              .trim()
              .toLowerCase()
          ];
        return v ===
          undefined
          ? []
          : [
              v,
            ];
      },
    );
  const counts =
    inStateCounts(
      parse(
        html,
      ),
    );

  return {
    reports:
      reports.length,
    format:
      mode(
        reports.map(
          (
            r,
          ) =>
            str(
              r.format,
            ),
        ),
      ),
    fileType:
      mode(
        reports.map(
          (
            r,
          ) =>
            str(
              r.interviewType,
            ),
        ),
      ),
    interviewStyle:
      mode(
        reports.map(
          (
            r,
          ) =>
            str(
              r.interviewStyle,
            ),
        ),
      ),
    interviewLength:
      mode(
        reports.map(
          (
            r,
          ) =>
            str(
              r.interviewLength,
            ),
        ),
      ),
    avgStress:
      mean(
        stress,
      ),
    avgImpression:
      mean(
        impression,
      ),
    inStateCount:
      counts?.inState ??
      null,
    outOfStateCount:
      counts?.outOfState ??
      null,
    questionBlobs:
      reports
        .map(
          (
            r,
          ) =>
            str(
              r.questionsAsked,
            ),
        )
        .filter(
          Boolean,
        ),
  };
}
