/**
 * The cover and screenshot section of the build form (s07-17): upload a cover or up to eight screenshots, describe
 * each, put them in order with Move up and Move down, delete with a confirmation, and save the list. A picture
 * without a description cannot be saved; the form says which one, and the server refuses it too. Loaded on demand
 * by `BuildForm`. Pictures can only be uploaded to a build that exists, so a new build shows a hint instead.
 */
import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  MAX_SCREENSHOTS,
  SCREENSHOT_DESCRIPTION_MAX,
  moveScreenshot,
  screenshotProblem,
  type ScreenshotView,
} from '@/lib/builds/screenshots';
import { saveScreenshotsApi, uploadBuildImageApi } from '@/lib/builds/screenshots.contract';

const FIELD_LABEL = 'block text-sm font-medium text-site-text';

interface Props {
  /** Absent while the build is being created: nothing can be uploaded to a build that does not exist yet. */
  buildId?: string;
  screenshots: ScreenshotView[];
  thumbnailUrl: string;
  onThumbnailUrl: (url: string) => void;
  thumbnailAlt: string;
  onThumbnailAlt: (alt: string) => void;
}

export default function ScreenshotEditor({
  buildId,
  screenshots,
  thumbnailUrl,
  onThumbnailUrl,
  thumbnailAlt,
  onThumbnailAlt,
}: Props) {
  const { t } = useTranslation('build-screenshots');
  const confirm = useConfirm();
  const ids = useId();
  const coverInput = useRef<HTMLInputElement | null>(null);
  const shotInput = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ScreenshotView[]>(screenshots);
  const [saved, setSaved] = useState<ScreenshotView[]>(screenshots);
  const [busy, setBusy] = useState<'cover' | 'shot' | 'save' | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const problem = screenshotProblem(items);
  const missing = problem && problem.code === 'DESCRIPTION_REQUIRED' ? problem.index : null;
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  const upload = async (file: File): Promise<ScreenshotView | null> => {
    if (!buildId) return null;
    const body = new FormData();
    body.append('image', file);
    try {
      const stored = await api(uploadBuildImageApi, {
        params: {
          id: buildId,
        },
        body,
      });
      return {
        url: stored.url,
        width: stored.width,
        height: stored.height,
        description: '',
      };
    } catch (err) {
      toast.error(
        serverError(err) ??
          t('upload-failed', {
            defaultValue: 'The picture could not be uploaded.',
          }),
      );
      return null;
    }
  };

  const onCover = async (file: File | undefined) => {
    if (!file) return;
    setBusy('cover');
    const stored = await upload(file);
    setBusy(null);
    if (stored) onThumbnailUrl(stored.url);
  };

  const onShot = async (file: File | undefined) => {
    if (!file) return;
    setBusy('shot');
    const stored = await upload(file);
    setBusy(null);
    if (stored) setItems((prev) => [...prev, stored]);
  };

  const remove = async (index: number) => {
    const ok = await confirm({
      title: t('delete-title', {
        defaultValue: 'Delete this screenshot?',
      }),
      description: t('delete-body', {
        defaultValue: 'It leaves the build page when you save the list.',
      }),
      confirmLabel: t('delete', {
        defaultValue: 'Delete',
      }),
      danger: true,
    });
    if (ok) setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!buildId) return;
    if (missing !== null) {
      setShowMissing(true);
      return;
    }
    setBusy('save');
    try {
      const result = await api(saveScreenshotsApi, {
        params: {
          id: buildId,
        },
        body: {
          screenshots: items,
        },
      });
      setItems(result.items);
      setSaved(result.items);
      setShowMissing(false);
      toast.success(
        t('saved', {
          defaultValue: 'Screenshots saved.',
        }),
      );
    } catch (err) {
      toast.error(
        serverError(err) ??
          t('save-failed', {
            defaultValue: 'The screenshots could not be saved.',
          }),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={FIELD_LABEL}>
          {t('cover-heading', {
            defaultValue: 'Cover',
          })}
        </p>
        {buildId ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={coverInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('cover-file', {
                defaultValue: 'Cover image file',
              })}
              onChange={(e) => {
                void onCover(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button type="button" loading={busy === 'cover'} onClick={() => coverInput.current?.click()}>
              <ImagePlus aria-hidden />
              {thumbnailUrl
                ? t('replace-cover', {
                    defaultValue: 'Replace cover',
                  })
                : t('upload-cover', {
                    defaultValue: 'Upload cover',
                  })}
            </Button>
            <span className="t-meta">
              {t('upload-limit', {
                defaultValue: 'Still images up to 5 MB.',
              })}
            </span>
          </div>
        ) : (
          <p className="t-meta">
            {t('save-first', {
              defaultValue: 'Save the build first, then edit it to upload pictures.',
            })}
          </p>
        )}
        {thumbnailUrl && (
          <>
            <label htmlFor={`${ids}-cover-alt`} className={FIELD_LABEL}>
              {t('cover-alt-label', {
                defaultValue: 'Cover description (optional)',
              })}
            </label>
            <Input
              id={`${ids}-cover-alt`}
              dir="auto"
              value={thumbnailAlt}
              maxLength={SCREENSHOT_DESCRIPTION_MAX}
              onChange={(e) => onThumbnailAlt(e.target.value)}
              placeholder={t('cover-alt-placeholder', {
                defaultValue: 'What the cover shows',
              })}
            />
            <p className="t-meta">
              {t('cover-alt-hint', {
                defaultValue: 'Read aloud by screen readers wherever the cover appears. The title is used when empty.',
              })}
            </p>
          </>
        )}
      </div>

      {buildId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={FIELD_LABEL}>
              {t('screenshots-heading', {
                defaultValue: 'Screenshots',
              })}{' '}
              <span className="t-meta">
                {t('screenshots-count', {
                  defaultValue: '{{shown}} of {{max}}',
                  shown: items.length,
                  max: MAX_SCREENSHOTS,
                })}
              </span>
            </p>
            <input
              ref={shotInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('screenshot-file', {
                defaultValue: 'Screenshot image file',
              })}
              onChange={(e) => {
                void onShot(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              loading={busy === 'shot'}
              disabled={items.length >= MAX_SCREENSHOTS}
              onClick={() => shotInput.current?.click()}
            >
              <ImagePlus aria-hidden />
              {t('add-screenshot', {
                defaultValue: 'Add screenshot',
              })}
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="t-body text-site-text-muted">
              {t('no-screenshots', {
                defaultValue: 'No screenshots yet. Add up to eight and describe each one.',
              })}
            </p>
          ) : (
            <ol className="border-t border-site-border">
              {items.map((item, i) => (
                <li key={item.url} className="grid gap-3 border-b border-site-border py-4 sm:grid-cols-[10rem_1fr]">
                  <div className="aspect-video overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
                    <img
                      src={item.url}
                      alt={item.description}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`${ids}-desc-${i}`} className={FIELD_LABEL}>
                      {t('description-label', {
                        defaultValue: 'Description of screenshot {{position}}',
                        position: i + 1,
                      })}
                    </label>
                    <Textarea
                      id={`${ids}-desc-${i}`}
                      dir="auto"
                      rows={2}
                      value={item.description}
                      maxLength={SCREENSHOT_DESCRIPTION_MAX}
                      aria-invalid={showMissing && missing === i ? true : undefined}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? {
                                  ...p,
                                  description: e.target.value,
                                }
                              : p,
                          ),
                        )
                      }
                      placeholder={t('description-placeholder', {
                        defaultValue: 'What this screenshot shows',
                      })}
                    />
                    {showMissing && missing === i && (
                      <p role="alert" className="text-sm text-site-danger">
                        {t('description-required', {
                          defaultValue: 'Describe this screenshot to save it.',
                        })}
                      </p>
                    )}
                    <div className="flex gap-1">
                      <IconButton
                        type="button"
                        icon={ArrowUp}
                        label={t('move-up', {
                          defaultValue: 'Move up',
                        })}
                        disabled={i === 0}
                        onClick={() => setItems((prev) => moveScreenshot(prev, i, i - 1))}
                      />
                      <IconButton
                        type="button"
                        icon={ArrowDown}
                        label={t('move-down', {
                          defaultValue: 'Move down',
                        })}
                        disabled={i === items.length - 1}
                        onClick={() => setItems((prev) => moveScreenshot(prev, i, i + 1))}
                      />
                      <IconButton
                        type="button"
                        icon={Trash2}
                        label={t('delete-screenshot', {
                          defaultValue: 'Delete screenshot',
                        })}
                        onClick={() => void remove(i)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {(dirty || showMissing) && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" loading={busy === 'save'} onClick={() => void save()}>
                {t('save', {
                  defaultValue: 'Save screenshots',
                })}
              </Button>
              {missing !== null && (
                <span className="t-meta">
                  {t('describe-all', {
                    defaultValue: 'Describe every screenshot to save the list.',
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
