/** Export dialog for the highlights notebook: format (a radio group), scope (selection or everything matching), then download. */

import {
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { toast } from '@/lib/toast';
import { apiUrl } from '@/lib/contract/client';
import { exportHighlightsApi } from '@/lib/reading/highlights.contract';
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from '@/lib/reading/highlights-export';
import type { HighlightsFilter } from '@/lib/reading/highlights-search-schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  filter: HighlightsFilter;
  /** Highlights ticked in the list. Empty means "everything matching the filter". */
  selectedIds: readonly string[];
  /** How many highlights the filter matches. */
  total: number;
}

function fileNameOf(
  res: Response,
  format: ExportFormat,
): string {
  const named =
    /filename="([^"]+)"/.exec(
      res.headers.get(
        'Content-Disposition',
      ) ??
        '',
    )?.[1];
  const ext =
    format ===
    'markdown'
      ? 'md'
      : format;
  return (
    named ??
    `rmhstudios-highlights-${new Date().toISOString().slice(0, 10)}.${ext}`
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  filter,
  selectedIds,
  total,
}: ExportDialogProps) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'highlights',
    );
  const groupId =
    useId();
  const [
    format,
    setFormat,
  ] =
    useState<ExportFormat>(
      'markdown',
    );
  const [
    scope,
    setScope,
  ] =
    useState<
      | 'selected'
      | 'all'
    >(
      selectedIds.length >
        0
        ? 'selected'
        : 'all',
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const formats: Record<
    ExportFormat,
    {
      label: string;
      hint: string;
    }
  > =
    {
      markdown:
        {
          label:
            t(
              'format-markdown',
              {
                defaultValue:
                  'Markdown',
              },
            ),
          hint: t(
            'format-markdown-hint',
            {
              defaultValue:
                'Grouped by document, quotes as blockquotes.',
            },
          ),
        },
      csv: {
        label:
          t(
            'format-csv',
            {
              defaultValue:
                'CSV',
            },
          ),
        hint: t(
          'format-csv-hint',
          {
            defaultValue:
              'One row per highlight, for a spreadsheet.',
          },
        ),
      },
      json: {
        label:
          t(
            'format-json',
            {
              defaultValue:
                'JSON',
            },
          ),
        hint: t(
          'format-json-hint',
          {
            defaultValue:
              'Every field, for your own tools.',
          },
        ),
      },
    };

  const useSelection =
    scope ===
      'selected' &&
    selectedIds.length >
      0;
  const count =
    useSelection
      ? selectedIds.length
      : total;

  async function download() {
    setBusy(
      true,
    );
    try {
      const res =
        await fetch(
          apiUrl(
            exportHighlightsApi,
          ),
          {
            method:
              'POST',
            credentials:
              'include',
            headers:
              {
                'Content-Type':
                  'application/json',
              },
            body: JSON.stringify(
              {
                format,
                filter,
                ...(useSelection
                  ? {
                      ids: selectedIds,
                    }
                  : {}),
                locale:
                  i18n.language,
                labels:
                  {
                    heading:
                      t(
                        'export-heading',
                        {
                          defaultValue:
                            'Reading highlights',
                        },
                      ),
                    note: t(
                      'export-note',
                      {
                        defaultValue:
                          'Note',
                      },
                    ),
                    added:
                      t(
                        'export-added',
                        {
                          defaultValue:
                            'Highlighted',
                        },
                      ),
                  },
              },
            ),
          },
        );
      if (
        !res.ok
      ) {
        toast.error(
          res.status ===
            429
            ? t(
                'export-limited',
                {
                  defaultValue:
                    'You can export a few times per hour. Try again later.',
                },
              )
            : t(
                'export-failed',
                {
                  defaultValue:
                    'Could not export your highlights. Try again.',
                },
              ),
        );
        return;
      }
      const url =
        URL.createObjectURL(
          await res.blob(),
        );
      const link =
        document.createElement(
          'a',
        );
      link.href =
        url;
      link.download =
        fileNameOf(
          res,
          format,
        );
      document.body.appendChild(
        link,
      );
      link.click();
      link.remove();
      URL.revokeObjectURL(
        url,
      );
      onOpenChange(
        false,
      );
    } catch {
      toast.error(
        t(
          'export-failed',
          {
            defaultValue:
              'Could not export your highlights. Try again.',
          },
        ),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(
              'export-title',
              {
                defaultValue:
                  'Export highlights',
              },
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'export-description',
              {
                defaultValue:
                  'Document titles and links are included in the file.',
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="t-label">
            {t(
              'export-format',
              {
                defaultValue:
                  'Format',
              },
            )}
          </legend>
          {EXPORT_FORMATS.map(
            (
              f,
            ) => (
              <label
                key={
                  f
                }
                className="flex cursor-pointer items-start gap-3 py-1"
              >
                <input
                  type="radio"
                  name={`${groupId}-format`}
                  aria-label={
                    formats[
                      f
                    ]
                      .label
                  }
                  value={
                    f
                  }
                  checked={
                    format ===
                    f
                  }
                  onChange={() =>
                    setFormat(
                      f,
                    )
                  }
                  className="mt-1 size-4 accent-[var(--site-accent)]"
                />
                <span>
                  <span className="t-body block font-medium">
                    {
                      formats[
                        f
                      ]
                        .label
                    }
                  </span>
                  <span className="t-meta block">
                    {
                      formats[
                        f
                      ]
                        .hint
                    }
                  </span>
                </span>
              </label>
            ),
          )}
        </fieldset>
        {selectedIds.length >
        0 ? (
          <fieldset className="space-y-2">
            <legend className="t-label">
              {t(
                'export-scope',
                {
                  defaultValue:
                    'What to export',
                },
              )}
            </legend>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input
                type="radio"
                name={`${groupId}-scope`}
                checked={
                  scope ===
                  'selected'
                }
                onChange={() =>
                  setScope(
                    'selected',
                  )
                }
                className="size-4 accent-[var(--site-accent)]"
              />
              <span className="t-body">
                {t(
                  'export-selected',
                  {
                    count:
                      selectedIds.length,
                    defaultValue_one: 'The {{count}} selected',
                    defaultValue_other: 'The {{count}} selected',
                  },
                )}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input
                type="radio"
                name={`${groupId}-scope`}
                checked={
                  scope ===
                  'all'
                }
                onChange={() =>
                  setScope(
                    'all',
                  )
                }
                className="size-4 accent-[var(--site-accent)]"
              />
              <span className="t-body">
                {t(
                  'export-all',
                  {
                    count:
                      total,
                    defaultValue_one: 'The {{count}} matching highlight',
                    defaultValue_other: 'All {{count}} matching the filter',
                  },
                )}
              </span>
            </label>
          </fieldset>
        ) : (
          <p className="t-body text-site-text-muted">
            {t(
              'export-all-note',
              {
                count:
                  total,
                defaultValue_one: 'The {{count}} matching highlight.',
                defaultValue_other: 'All {{count}} matching the filter.',
              },
            )}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="default"
            onClick={() =>
              onOpenChange(
                false,
              )
            }
          >
            {t(
              'cancel',
              {
                defaultValue:
                  'Cancel',
              },
            )}
          </Button>
          <Button
            variant="primary"
            loading={
              busy
            }
            disabled={
              count ===
              0
            }
            onClick={() =>
              void download()
            }
          >
            <Download
              aria-hidden
            />
            {t(
              'export-download',
              {
                defaultValue:
                  'Download',
              },
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
