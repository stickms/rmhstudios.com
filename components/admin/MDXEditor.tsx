import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { ArrowLeft, ImagePlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { BlogMarkdown } from '@/components/blog/BlogMarkdown';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  BUSINESSES,
  DEFAULT_BUSINESS_ID,
  isBusinessId,
  type BusinessId,
} from '@/lib/businesses';
import { ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS } from '@/lib/sitewide-announcement';
import { toast } from 'sonner';

/** ISO timestamp -> value for <input type="datetime-local"> in local time. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MDXEditor({
  initialData,
  isEdit = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData?: Record<string, any> & {
    announcement?: boolean;
    business?: string;
    announcementExpiresAt?: string | null;
  };
  isEdit?: boolean;
}) {
  const navigate = useRouter().navigate;
  const { t } = useTranslation('c-admin');

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    description: initialData?.description || '',
    image: initialData?.image || '',
    tags: initialData?.tags
      ? Array.isArray(initialData.tags)
        ? initialData.tags.join(', ')
        : initialData.tags
      : '',
  });
  const [content, setContent] = useState(initialData?.content || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const wasAnnouncement = Boolean(initialData?.announcement);
  const [announcement, setAnnouncement] = useState(wasAnnouncement);
  const [business, setBusiness] = useState<BusinessId>(
    isBusinessId(initialData?.business) ? initialData.business : DEFAULT_BUSINESS_ID,
  );
  const [expiresLocal, setExpiresLocal] = useState(
    isoToLocalInput(initialData?.announcementExpiresAt),
  );

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
      body.append('file', file);
      const res = await fetch('/api/admin/blog/media', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== 'string') {
        throw new Error(
          data.error || t('media-upload-failed', { defaultValue: 'Could not upload that file' }),
        );
      }
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
      const snippet = `![${alt}](${data.url})`;
      // The CodeMirror editor does not expose its cursor, so append on its own line.
      setContent((prev: string) => {
        const base = prev.replace(/\s+$/, '');
        return base ? `${base}\n\n${snippet}\n` : `${snippet}\n`;
      });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('media-upload-failed', { defaultValue: 'Could not upload that file' }),
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

      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || t('failed-to-create-post', { defaultValue: 'Failed to create post' }),
        );
      }

      toast.success(
        <div>
          {isEdit
            ? t('post-updated-successfully', { defaultValue: 'Post updated successfully!' })
            : t('post-created-successfully', { defaultValue: 'Post created successfully!' })}
          <p className="text-sm mt-1 text-site-text-dim">
            {t('changes-now-live', { defaultValue: 'Your changes are now live.' })}
          </p>
        </div>,
        { duration: 8000 },
      );

      navigate({ to: '/admin' });
    } catch (error: any) {
      toast.error(error.message || t('an-error-occurred', { defaultValue: 'An error occurred' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-site-bg overflow-hidden fixed inset-0 z-50">
      <div className="h-16 border-b border-site-border flex items-center justify-between px-4 lg:px-6 shrink-0 bg-site-surface w-full shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/admin/blog' })}
            className="text-site-text-dim hover:text-site-text"
            aria-label={t('back-to-admin', { defaultValue: 'Back to admin' })}
          >
            <span className="hidden md:inline">
              {t('back-to-admin-label', { defaultValue: 'Back to Admin' })}
            </span>
            <ArrowLeft className="w-5 h-5 md:hidden" />
          </Button>
          <div className="h-4 w-px bg-site-border hidden md:block"></div>
          <span className="text-sm font-bold text-site-text truncate max-w-[200px] md:max-w-xs">
            {isEdit
              ? t('editing-title', {
                  defaultValue: 'Editing: {{title}}',
                  title:
                    formData.title || formData.slug || t('untitled', { defaultValue: 'Untitled' }),
                })
              : t('new-blog-post', { defaultValue: 'New Blog Post' })}
          </span>
        </div>

        <div className="flex gap-2 items-center">
          <Button
            type="button"
            onClick={togglePreview}
            variant="outline"
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
            disabled={isSubmitting || !content.trim()}
            size="sm"
            className="bg-site-accent hover:bg-site-accent-hover text-site-accent-fg"
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
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            defaultSize="50%"
            minSize="25%"
            className={`flex flex-col ${isPreviewMode ? 'hidden lg:flex' : 'flex'} relative h-full bg-site-surface min-h-0`}
          >
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-6 min-h-0">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold font-display text-site-text">
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

                <fieldset className="space-y-3 rounded-site-sm border border-site-border p-4">
                  <legend className="px-1 text-sm font-semibold text-site-text">
                    {t('sitewide-announcement-legend', { defaultValue: 'Sitewide announcement' })}
                  </legend>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label id="announcement-label" htmlFor="announcement-switch">
                        {t('sitewide-announcement-label', {
                          defaultValue: 'Sitewide announcement',
                        })}
                      </Label>
                      <p id="announcement-help" className="text-xs text-site-text-dim">
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
                          onChange={(e) => setBusiness(e.target.value as BusinessId)}
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
                          {t('announcement-expires-label', { defaultValue: 'Stop showing after' })}
                        </Label>
                        <Input
                          id="announcement-expires"
                          type="datetime-local"
                          value={expiresLocal}
                          onChange={(e) => setExpiresLocal(e.target.value)}
                          aria-describedby="announcement-expires-help"
                        />
                        <p id="announcement-expires-help" className="text-xs text-site-text-dim">
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
                    <p className="text-xs text-site-text-muted">
                      {t('announcement-reannounce-note', {
                        defaultValue:
                          'Already announced. Switching this off and on again re-announces it to everyone.',
                      })}
                    </p>
                  )}
                </fieldset>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    {t('upload-markdown', { defaultValue: 'Upload .md' })}
                  </Button>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={handleMediaUpload}
                    aria-label={t('upload-media', { defaultValue: 'Upload image / video' })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={isUploadingMedia}
                    aria-busy={isUploadingMedia}
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    <ImagePlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    {isUploadingMedia
                      ? t('uploading-media', { defaultValue: 'Uploading...' })
                      : t('upload-media', { defaultValue: 'Upload image / video' })}
                  </Button>
                </div>
                <div className="flex-1 border border-site-border rounded-site-sm overflow-hidden relative min-h-75 sm:min-h-0">
                  <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder={t('content-placeholder', {
                      defaultValue: 'Write your post in Markdown…',
                    })}
                  />
                </div>
                <p className="mt-2 text-xs text-site-text-dim">
                  {t('media-hint', {
                    defaultValue:
                      'A YouTube link also works: ![caption](https://youtu.be/…)',
                  })}
                </p>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="hidden lg:flex" />

          <ResizablePanel
            defaultSize="50%"
            minSize="25%"
            className={`h-full ${!isPreviewMode ? 'hidden lg:block' : 'block'} bg-site-bg overflow-y-auto relative border-l border-site-border lg:border-none min-h-0`}
          >
            <div className="sticky top-0 glass-chrome border-b border-site-border p-4 flex justify-between items-center z-10 w-full h-14">
              <h2 className="text-sm font-bold font-display text-site-text uppercase tracking-wider text-site-text-dim">
                {t('live-preview', { defaultValue: 'Live Preview' })}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generatePreview}
                className="h-8"
              >
                {t('refresh', { defaultValue: 'Refresh' })}
              </Button>
            </div>

            <div className="p-6 lg:p-10 prose prose-invert max-w-3xl mx-auto prose-headings:font-bold prose-headings:text-site-text prose-p:text-site-text-muted prose-a:text-site-accent hover:prose-a:text-site-accent-hover prose-img:rounded-site prose-img:border prose-img:border-site-border">
              {previewContent ? (
                <>
                  <h1 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight leading-tight">
                    {formData.title || t('untitled-post', { defaultValue: 'Untitled Post' })}
                  </h1>
                  {formData.description && (
                    <p className="text-xl border-l-4 border-site-accent pl-6 mb-8 text-site-text-muted">
                      {formData.description}
                    </p>
                  )}
                  <BlogMarkdown content={previewContent} />
                </>
              ) : (
                <div className="text-center text-site-text-dim mt-32 flex flex-col items-center gap-4">
                  <p>
                    {t('preview-hint', {
                      defaultValue: 'Start typing to see the preview or click Refresh.',
                    })}
                  </p>
                  <Button variant="outline" onClick={generatePreview}>
                    {t('generate-initial-preview', { defaultValue: 'Generate Initial Preview' })}
                  </Button>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
