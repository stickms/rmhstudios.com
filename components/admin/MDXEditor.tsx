import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { ArrowLeft, ImagePlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import ReactMarkdown from 'react-markdown';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { ReadabilityMeter } from '@/components/reading/ReadabilityMeter';
// The published article's own element map — importing it (rather than
// re-listing a subset here, which is what this file used to do and which had
// already fallen behind by six elements) is what makes this pane a preview.
import { markdownComponents } from '@/components/blog/markdown-components';
import '@/components/ui/spine.css';
import { toast } from '@/lib/toast';

import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { saveBlogPostApi } from '@/lib/admin/admin-tools.contract';
import { uploadBlogMediaApi } from '@/lib/admin/blog-media.contract';
import { BUSINESSES, DEFAULT_BUSINESS_ID, isBusinessId, type BusinessId } from '@/lib/businesses';
import { ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS } from '@/lib/sitewide-announcement';

/** The loader's post: every field is optional and untyped on the wire, so each is narrowed where it is read. */
type InitialData = Record<string, unknown>;

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** An ISO timestamp as the value of an `<input type="datetime-local">`, in the viewer's local time. */
function isoToLocalInput(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MDXEditor({
  initialData,
  isEdit = false,
}: {
  initialData?: InitialData;
  isEdit?: boolean;
}) {
  const navigate = useRouter().navigate;
  const { t } = useTranslation('c-admin');

  const [formData, setFormData] = useState({
    title: asString(initialData?.title),
    slug: asString(initialData?.slug),
    date: asString(initialData?.date) || new Date().toISOString().split('T')[0],
    description: asString(initialData?.description),
    image: asString(initialData?.image),
    tags: Array.isArray(initialData?.tags)
      ? initialData.tags.map(String).join(', ')
      : asString(initialData?.tags),
  });
  const [content, setContent] = useState(asString(initialData?.content));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const wasAnnouncement = initialData?.announcement === true;
  const [announcement, setAnnouncement] = useState(wasAnnouncement);
  const [business, setBusiness] = useState<BusinessId>(
    isBusinessId(initialData?.business) ? initialData.business : DEFAULT_BUSINESS_ID,
  );
  const [expiresLocal, setExpiresLocal] = useState(isoToLocalInput(initialData?.announcementExpiresAt));

  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-uploading the same file fires change again.
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setContent(text);
      toast.success(t('markdown-imported', { defaultValue: 'Imported {{name}}', name: file.name }));
    } catch {
      toast.error(t('markdown-import-failed', { defaultValue: 'Could not read that file' }));
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const { url } = await api(uploadBlogMediaApi, { body });
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
      const snippet = `![${alt}](${url})`;
      // MarkdownEditor does not expose its cursor, so the snippet goes on its own line at the end.
      setContent((prev: string) => {
        const base = prev.replace(/\s+$/, '');
        return base ? `${base}\n\n${snippet}\n` : `${snippet}\n`;
      });
    } catch (error) {
      toast.error(
        serverError(error) ||
          t('media-upload-failed', { defaultValue: 'Could not upload that file' }),
      );
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const generatePreview = useCallback(async () => {
    setPreviewContent(content);
  }, [content]);

  const togglePreview = async () => {
    if (!isPreviewMode) {
      await generatePreview();
    }
    setIsPreviewMode(!isPreviewMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        tags: formData.tags
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean),
        content,
        isEdit,
        announcement,
        business,
        announcementExpiresAt:
          announcement && expiresLocal ? new Date(expiresLocal).toISOString() : null,
      };

      try {
        await api(saveBlogPostApi, { body: payload });
      } catch (error) {
        throw new Error(
          serverError(error) ||
            t('failed-to-create-post', { defaultValue: 'Failed to create post' }),
          { cause: error },
        );
      }

      toast.success(
        <div>
          {isEdit
            ? t('post-updated-successfully', { defaultValue: 'Post updated successfully!' })
            : t('post-created-successfully', { defaultValue: 'Post created successfully!' })}
          <p className="mt-1 t-body text-site-text-muted">
            {t('changes-now-live', { defaultValue: 'Your changes are now live.' })}
          </p>
        </div>,
        { duration: 8000 },
      );

      navigate({ to: '/admin' });
    } catch (error) {
      toast.error(
        (error instanceof Error && error.message) ||
          t('an-error-occurred', { defaultValue: 'An error occurred' }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // PORTALLED to <body>. This is a full-screen takeover (its own header carries
  // Back-to-admin and Save Post), but it renders from a route under `_site`, so
  // in place it landed inside the page frame — `position: relative; z-index:
  // var(--z-content)`, a stacking context pinned at 1 — and its `z-50` was
  // measured inside that 1. The shell's OPAQUE top bar (`--z-topbar: 60`,
  // 4rem at >=768px) then painted over the editor's own 4rem header: at desktop
  // width the toolbar was 100% covered and **Save Post was unclickable**, so a
  // post could not be saved at all. Below 768px a 3.5rem bar left an 8px sliver,
  // and clicks in the covered band hit the top bar's search/messages/profile
  // buttons instead.
  //
  // Portalling rather than un-fixing it: the two-pane `ResizablePanelGroup`
  // below needs a definite height, which `fixed inset-0` is what supplies. At
  // body level the shell is a sibling stacking context at z-auto, so z-50 now
  // means what it says.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-site-bg">
      <div className="surface-chrome flex h-16 w-full shrink-0 items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/admin/blog' })}
            className="text-site-text-muted hover:text-site-text"
            aria-label={t('back-to-admin', { defaultValue: 'Back to admin' })}
          >
            <span className="hidden md:inline">
              {t('back-to-admin-label', { defaultValue: 'Back to Admin' })}
            </span>
            <ArrowLeft className="size-5 md:hidden" aria-hidden />
          </Button>
          <div className="hidden h-4 w-px bg-site-border md:block" aria-hidden />
          <span className="t-body hidden max-w-48 truncate font-semibold text-site-text sm:inline md:max-w-xs">
            {isEdit
              ? t('editing-title', {
                  defaultValue: 'Editing: {{title}}',
                  title:
                    formData.title || formData.slug || t('untitled', { defaultValue: 'Untitled' }),
                })
              : t('new-blog-post', { defaultValue: 'New Blog Post' })}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            onClick={togglePreview}
            variant="default"
            size="sm"
            className="lg:hidden"
          >
            {isPreviewMode
              ? t('hide-preview', { defaultValue: 'Hide Preview' })
              : t('show-preview', { defaultValue: 'Show Preview' })}
          </Button>
          <Button
            type="submit"
            form="blog-form"
            disabled={!content.trim()}
            size="sm"
            variant="default"
            loading={isSubmitting}
          >
            {isSubmitting
              ? t('saving', { defaultValue: 'Saving...' })
              : isEdit
                ? t('update-post', { defaultValue: 'Update Post' })
                : t('save-post', { defaultValue: 'Save Post' })}
          </Button>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        {/* Below `lg` only one pane shows. The library sizes the pane's OUTER element (50% each) and puts
            `className` on an inner one, so hiding the inner pane left its outer half of the row empty and the form at
            half width on a phone. The outer of the hidden pane is removed and the other takes the row. */}
        <ResizablePanelGroup
          orientation="horizontal"
          className="max-lg:[&>[data-panel]:has(>.hidden)]:hidden!"
        >
          <ResizablePanel
            defaultSize="50%"
            minSize="25%"
            className={`flex flex-col ${isPreviewMode ? 'hidden lg:flex' : 'flex'} relative h-full min-h-0 bg-site-bg`}
          >
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-4 min-h-0">
              <div className="flex items-center justify-between">
                <h2 className="t-heading text-site-text">
                  {t('metadata', { defaultValue: 'Metadata' })}
                </h2>
              </div>
              <form id="blog-form" onSubmit={handleSubmit} className="space-y-4 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">
                      {t('title-label', { defaultValue: 'Title' })}{' '}
                      <span className="text-site-danger">*</span>
                    </Label>
                    <Input
                      id="title"
                      name="title"
                      required
                      value={formData.title}
                      onChange={handleChange}
                      placeholder={t('title-placeholder', { defaultValue: 'My Awesome Post' })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">
                      {t('slug-label', { defaultValue: 'Slug' })}{' '}
                      <span className="text-site-danger">*</span>
                    </Label>
                    <Input
                      id="slug"
                      name="slug"
                      required
                      value={formData.slug}
                      onChange={handleChange}
                      placeholder="my-awesome-post"
                      pattern="[a-z0-9-]+"
                      title={t('slug-title', {
                        defaultValue: 'Only lowercase letters, numbers, and hyphens',
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">
                      {t('date-label', { defaultValue: 'Date' })}{' '}
                      <span className="text-site-danger">*</span>
                    </Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      required
                      value={formData.date}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image">
                      {t('image-url-label', { defaultValue: 'Image URL' })}
                    </Label>
                    <Input
                      id="image"
                      name="image"
                      value={formData.image}
                      onChange={handleChange}
                      placeholder="/images/blog/cover.jpg"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">
                    {t('tags-label', { defaultValue: 'Tags (comma-separated)' })}
                  </Label>
                  <Input
                    id="tags"
                    name="tags"
                    value={formData.tags}
                    onChange={handleChange}
                    placeholder={t('tags-placeholder', { defaultValue: 'devlog, gamedev, nextjs' })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    {t('description-label', { defaultValue: 'Description' })}{' '}
                    <span className="text-site-danger">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    required
                    value={formData.description}
                    onChange={handleChange}
                    placeholder={t('description-placeholder', {
                      defaultValue: 'A short summary of the post...',
                    })}
                    rows={3}
                  />
                </div>

                <div className="border-t border-site-border pt-4">
                  <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0">
                    <legend className="t-label mb-3 float-left w-full">
                      {t('sitewide-announcement-legend', { defaultValue: 'Sitewide announcement' })}
                    </legend>
                    <div className="clear-both flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label id="announcement-label" htmlFor="announcement-switch">
                          {t('sitewide-announcement-label', {
                            defaultValue: 'Announce this post',
                          })}
                        </Label>
                        <p id="announcement-help" className="t-body text-site-text-muted">
                          {t('sitewide-announcement-help', {
                            defaultValue:
                              'Pops up once for every visitor and is pinned at the top of the feed.',
                          })}
                        </p>
                      </div>
                      <Switch
                        id="announcement-switch"
                        checked={announcement}
                        onCheckedChange={setAnnouncement}
                        aria-labelledby="announcement-label"
                        aria-describedby="announcement-help"
                      />
                    </div>
                    {announcement && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="announcement-business">
                            {t('announcement-business-label', { defaultValue: 'From business' })}
                          </Label>
                          <Select
                            id="announcement-business"
                            value={business}
                            onChange={(e) => {
                              if (isBusinessId(e.target.value)) setBusiness(e.target.value);
                            }}
                          >
                            {BUSINESSES.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="announcement-expires">
                            {t('announcement-expires-label', {
                              defaultValue: 'Stop showing after',
                            })}
                          </Label>
                          <Input
                            id="announcement-expires"
                            type="datetime-local"
                            value={expiresLocal}
                            onChange={(e) => setExpiresLocal(e.target.value)}
                            aria-describedby="announcement-expires-help"
                          />
                          <p id="announcement-expires-help" className="t-body text-site-text-muted">
                            {t('announcement-expires-help', {
                              defaultValue:
                                'Optional. When empty, it stops showing {{days}} days after it is announced.',
                              days: ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS,
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                    {announcement && wasAnnouncement && (
                      <p className="t-body text-site-text-muted">
                        {t('announcement-reannounce-note', {
                          defaultValue:
                            'Already announced. Switching this off and on again re-announces it to everyone.',
                        })}
                      </p>
                    )}
                  </fieldset>
                </div>
              </form>

              <div className="flex-1 flex flex-col min-h-0 h-full">
                <div className="flex items-center justify-between mb-2">
                  <Label>
                    {t('content-label', { defaultValue: 'Content' })}{' '}
                    <span className="text-site-danger">*</span>
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload aria-hidden="true" />
                      {t('upload-markdown', { defaultValue: 'Upload .md' })}
                    </Button>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*,video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      onChange={handleMediaUpload}
                      aria-label={t('upload-media', { defaultValue: 'Upload image or video' })}
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      loading={isUploadingMedia}
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      <ImagePlus aria-hidden="true" />
                      {isUploadingMedia
                        ? t('uploading-media', { defaultValue: 'Uploading...' })
                        : t('upload-media', { defaultValue: 'Upload image or video' })}
                    </Button>
                  </div>
                </div>
                <div className="surface-field relative min-h-75 flex-1 overflow-hidden rounded-site-sm sm:min-h-0">
                  <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder={t('content-placeholder', {
                      defaultValue: 'Write your post in Markdown…',
                    })}
                  />
                </div>
                <p className="t-meta mt-2">
                  {t('media-hint', {
                    defaultValue: 'A YouTube link also works: ![caption](https://youtu.be/…)',
                  })}
                </p>
                <ReadabilityMeter text={content} className="mt-3" />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="hidden lg:flex" />

          <ResizablePanel
            defaultSize="50%"
            minSize="25%"
            className={`h-full ${!isPreviewMode ? 'hidden lg:block' : 'block'} bg-site-bg overflow-y-auto relative min-h-0`}
          >
            <div className="surface-chrome site-sticky-contained flex h-16 w-full items-center justify-between gap-3 px-4 py-3">
              <h2 className="t-heading text-site-text">
                {t('live-preview', { defaultValue: 'Live Preview' })}
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={generatePreview}>
                {t('refresh', { defaultValue: 'Refresh' })}
              </Button>
            </div>

            <div className="mx-auto max-w-3xl p-4 lg:p-6">
              {previewContent ? (
                <>
                  <h1 className="site-display-3 mb-4">
                    {formData.title || t('untitled-post', { defaultValue: 'Untitled Post' })}
                  </h1>
                  {formData.description && (
                    <p className="site-lede mb-6 border-s-2 border-site-accent ps-4">
                      {formData.description}
                    </p>
                  )}
                  <div className="spine">
                    <ReactMarkdown components={markdownComponents}>{previewContent}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <div className="text-center text-site-text-muted mt-16 flex flex-col items-center gap-3">
                  <p>
                    {t('preview-hint', {
                      defaultValue: 'Start typing to see the preview or click Refresh.',
                    })}
                  </p>
                  <Button variant="default" onClick={generatePreview}>
                    {t('generate-initial-preview', { defaultValue: 'Generate Initial Preview' })}
                  </Button>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>,
    document.body,
  );
}
