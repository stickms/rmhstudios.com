/**
 * Highlights export — pure formatting (Markdown, CSV, JSON, citation).
 *
 * The server resolves each highlight's document title and absolute link, then
 * hands rows to these functions; nothing here reads a database or the clock.
 * Quote text is exported as written. Labels and dates take the viewer's locale.
 */

import type { ReadingDocKind } from './schema';

/** At most this many highlights leave in one export (the account export's cap). */
export const EXPORT_CAP = 10_000;

export const EXPORT_FORMATS =
  [
    'markdown',
    'csv',
    'json',
  ] as const;
export type ExportFormat =
  (typeof EXPORT_FORMATS)[number];

export interface ExportRow {
  id: string;
  kind: ReadingDocKind;
  key: string;
  /** Reading unit (a chapter or section id) the highlight sits in. */
  unit: string;
  /** Character offset inside `unit`; reading order is `unit`, then `start`. */
  start: number;
  title: string;
  /** Absolute link to the document. */
  url: string;
  exact: string;
  note:
    | string
    | null;
  isPublic: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

export interface ExportGroup {
  kind: ReadingDocKind;
  key: string;
  title: string;
  url: string;
  items: ExportRow[];
}

export interface MarkdownLabels {
  heading: string;
  note: string;
  added: string;
}

export const DEFAULT_LABELS: MarkdownLabels =
  {
    heading:
      'Reading highlights',
    note: 'Note',
    added:
      'Highlighted',
  };

export interface MarkdownOptions {
  /** BCP 47 tag for dates. Falls back to English when the tag is not valid. */
  locale?: string;
  labels?: Partial<MarkdownLabels>;
}

/** Reading order inside one document: unit, then offset. */
function byReadingOrder(
  a: ExportRow,
  b: ExportRow,
): number {
  const unit =
    a.unit.localeCompare(
      b.unit,
      'en',
      {
        numeric: true,
      },
    );
  return unit !==
    0
    ? unit
    : a.start -
        b.start;
}

/** One group per document (first-seen order), its highlights in reading order. */
export function groupByDocument(
  rows: readonly ExportRow[],
): ExportGroup[] {
  const groups =
    new Map<
      string,
      ExportGroup
    >();
  for (const row of rows) {
    const id = `${row.kind}:${row.key}`;
    let group =
      groups.get(
        id,
      );
    if (
      !group
    ) {
      group =
        {
          kind: row.kind,
          key: row.key,
          title:
            row.title,
          url: row.url,
          items:
            [],
        };
      groups.set(
        id,
        group,
      );
    }
    group.items.push(
      row,
    );
  }
  for (const group of groups.values())
    group.items.sort(
      byReadingOrder,
    );
  return [
    ...groups.values(),
  ];
}

/**
 * Escape what would change Markdown structure: `\ # > * _ [ ] <` and backticks
 * anywhere, a leading `-` or `+` (a list item) and a leading `1.` (an ordered one).
 */
export function escapeMarkdown(
  text: string,
): string {
  return text
    .replace(
      /[\\#>*_[\]`<]/g,
      '\\$&',
    )
    .split(
      /\r\n|\r|\n/,
    )
    .map(
      (
        line,
      ) =>
        line
          .replace(
            /^(\s*)([-+])/,
            '$1\\$2',
          )
          .replace(
            /^(\s*\d+)([.)])/,
            '$1\\$2',
          ),
    )
    .join(
      '\n',
    );
}

function formatDate(
  iso: string,
  locale:
    | string
    | undefined,
): string {
  const date =
    new Date(
      iso,
    );
  if (
    Number.isNaN(
      date.getTime(),
    )
  )
    return iso;
  const options: Intl.DateTimeFormatOptions =
    {
      dateStyle:
        'medium',
      timeZone:
        'UTC',
    };
  try {
    return new Intl.DateTimeFormat(
      locale ??
        'en',
      options,
    ).format(
      date,
    );
  } catch {
    return new Intl.DateTimeFormat(
      'en',
      options,
    ).format(
      date,
    );
  }
}

/** Link targets may not contain a bare `)` or space without breaking the link. */
function linkTarget(
  url: string,
): string {
  return url.replace(
    /[\s()]/g,
    (
      c,
    ) =>
      encodeURIComponent(
        c,
      ),
  );
}

function blockquote(
  text: string,
): string {
  return escapeMarkdown(
    text,
  )
    .split(
      '\n',
    )
    .map(
      (
        line,
      ) =>
        line.trim() ===
        ''
          ? '>'
          : `> ${line}`,
    )
    .join(
      '\n',
    );
}

/** A heading per document (title and link), then each highlight as a blockquote with its note and date. */
export function toMarkdown(
  groups: readonly ExportGroup[],
  options: MarkdownOptions = {},
): string {
  const labels =
    {
      ...DEFAULT_LABELS,
      ...options.labels,
    };
  const out: string[] =
    [
      `# ${escapeMarkdown(labels.heading)}`,
    ];
  for (const group of groups) {
    out.push(
      `## [${escapeMarkdown(group.title)}](${linkTarget(group.url)})`,
    );
    for (const item of group.items) {
      const lines =
        [
          blockquote(
            item.exact,
          ),
        ];
      if (
        item.note
      ) {
        lines.push(
          `**${escapeMarkdown(labels.note)}:** ${escapeMarkdown(item.note).replace(/\n/g, '  \n')}`,
        );
      }
      lines.push(
        `*${escapeMarkdown(labels.added)} ${formatDate(item.createdAt, options.locale)}*`,
      );
      out.push(
        lines.join(
          '\n\n',
        ),
      );
    }
  }
  return `${out.join('\n\n')}\n`;
}

const CSV_HEADER =
  [
    'document',
    'type',
    'url',
    'quote',
    'note',
    'visibility',
    'highlighted_at',
  ];

/** A spreadsheet runs a cell that starts with one of these as a formula. */
function guardFormula(
  value: string,
): string {
  return /^[=+\-@\t\r]/.test(
    value,
  )
    ? `'${value}`
    : value;
}

function csvCell(
  value: string,
): string {
  const guarded =
    guardFormula(
      value,
    );
  return /[",\r\n]/.test(
    guarded,
  )
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

export function toCsv(
  rows: readonly ExportRow[],
): string {
  const lines =
    [
      CSV_HEADER.join(
        ',',
      ),
    ];
  for (const r of rows) {
    lines.push(
      [
        r.title,
        r.kind,
        r.url,
        r.exact,
        r.note ??
          '',
        r.isPublic
          ? 'public'
          : 'private',
        r.createdAt,
      ]
        .map(
          csvCell,
        )
        .join(
          ',',
        ),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function toJson(
  rows: readonly ExportRow[],
): string {
  return JSON.stringify(
    rows.map(
      (
        r,
      ) => ({
        id: r.id,
        document:
          {
            type: r.kind,
            key: r.key,
            title:
              r.title,
            url: r.url,
          },
        quote:
          r.exact,
        note: r.note,
        visibility:
          r.isPublic
            ? 'public'
            : 'private',
        highlightedAt:
          r.createdAt,
      }),
    ),
    null,
    2,
  );
}

/** Plain-text citation: the quote, then the document title and its address. */
export function citation(
  row: Pick<
    ExportRow,
    | 'exact'
    | 'title'
    | 'url'
  >,
): string {
  return `“${row.exact}”\n— ${row.title}\n${row.url}`;
}
