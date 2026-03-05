'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import { MDXRemote } from 'next-mdx-remote';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

// Load Monaco editor dynamically to avoid SSR "window is not defined" or initialization errors
const Editor = dynamic(() => import('@/components/admin/DynamicMonacoEditor'), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-site-surface border border-site-border rounded-md text-site-text-muted">Loading Editor...</div>,
});
import { serialize } from 'next-mdx-remote/serialize';
import {
  AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
  AnimatedUl, AnimatedOl, AnimatedLi,
  AnimatedBlockquote, AnimatedImg, AnimatedHr, AnimatedPre
} from '@/components/blog/MDXAnimations';
import { toast } from 'sonner';

const animatedComponents = {
  h1: AnimatedH1,
  h2: AnimatedH2,
  h3: AnimatedH3,
  p: AnimatedP,
  ul: AnimatedUl,
  ol: AnimatedOl,
  li: AnimatedLi,
  blockquote: AnimatedBlockquote,
  img: AnimatedImg,
  hr: AnimatedHr,
  pre: AnimatedPre,
};

export function MDXEditor({ initialData, isEdit = false }: { initialData?: any, isEdit?: boolean }) {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    description: initialData?.description || '',
    image: initialData?.image || '',
    tags: initialData?.tags ? (Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags) : '',
  });
  const [content, setContent] = useState(initialData?.content || '');
  
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEditorChange = (value: string | undefined) => {
    setContent(value || '');
  };

  const generatePreview = useCallback(async () => {
    try {
      const serialized = await serialize(content);
      setPreviewContent(serialized);
    } catch (error) {
      console.error("MDX serialization error:", error);
      toast.error("Failed to generate preview. Check MDX syntax.");
    }
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
        tags: formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        content,
        isEdit
      };

      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create post');
      }

      toast.success(
        <div>
           Post {isEdit ? 'updated' : 'created'} successfully!
           <p className="text-sm mt-1 text-site-text-dim">Your changes are now live.</p>
        </div>,
        { duration: 8000 }
      );
      
      router.push('/admin');
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-site-bg overflow-hidden fixed inset-0 z-50">
        <div className="h-16 border-b border-site-border flex items-center justify-between px-4 lg:px-6 shrink-0 bg-site-surface w-full shadow-sm">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.push('/admin/blog')} className="text-site-text-dim hover:text-site-text hidden md:flex">
                    Back to Admin
                </Button>
                <div className="h-4 w-px bg-site-border hidden md:block"></div>
                <span className="text-sm font-bold text-site-text truncate max-w-[200px] md:max-w-xs">
                    {isEdit ? `Editing: ${formData.title || formData.slug || 'Untitled'}` : 'New Blog Post'}
                </span>
            </div>
            
            <div className="flex gap-2 items-center">
                 <Button type="button" onClick={togglePreview} variant="outline" size="sm" className="lg:hidden">
                     {isPreviewMode ? 'Hide Preview' : 'Show Preview'}
                 </Button>
                 <Button type="submit" form="blog-form" disabled={isSubmitting || !content.trim()} size="sm" className="bg-site-accent hover:bg-site-accent-hover text-white">
                     {isSubmitting ? 'Saving...' : (isEdit ? 'Update Post' : 'Save Post')}
                 </Button>
            </div>
        </div>

        <div className="flex-1 w-full relative">
            <ResizablePanelGroup direction="horizontal">
               <ResizablePanel defaultSize={50} minSize={25} className={`flex flex-col ${isPreviewMode ? 'hidden lg:flex' : 'flex'} relative h-full bg-site-surface min-h-0`}>
                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-6 min-h-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold font-display text-site-text">Metadata</h2>
                        </div>
                        <form id="blog-form" onSubmit={handleSubmit} className="space-y-4 shrink-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
                              <Input id="title" name="title" required value={formData.title} onChange={handleChange} placeholder="My Awesome Post" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="slug">Slug <span className="text-red-500">*</span></Label>
                              <Input id="slug" name="slug" required value={formData.slug} onChange={handleChange} placeholder="my-awesome-post" pattern="[a-z0-9-]+" title="Only lowercase letters, numbers, and hyphens" />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
                              <Input id="date" name="date" type="date" required value={formData.date} onChange={handleChange} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="image">Image URL</Label>
                              <Input id="image" name="image" value={formData.image} onChange={handleChange} placeholder="/images/blog/cover.jpg" />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="tags">Tags (comma-separated)</Label>
                            <Input id="tags" name="tags" value={formData.tags} onChange={handleChange} placeholder="devlog, gamedev, nextjs" />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                            <Textarea id="description" name="description" required value={formData.description} onChange={handleChange} placeholder="A short summary of the post..." rows={3} />
                          </div>
                        </form>

                        <div className="flex-1 flex flex-col min-h-0 h-full">
                            <Label className="mb-2">Content <span className="text-red-500">*</span></Label>
                            <div className="flex-1 border border-site-border rounded-md overflow-hidden relative min-h-0">
                              <Editor
                                height="100%"
                                defaultLanguage="markdown"
                                theme="vs-dark"
                                value={content}
                                onChange={handleEditorChange}
                                options={{
                                  wordWrap: 'on',
                                  minimap: { enabled: false },
                                  scrollBeyondLastLine: false,
                                }}
                              />
                            </div>
                        </div>
                    </div>
               </ResizablePanel>

               <ResizableHandle withHandle className="hidden lg:flex" />

               <ResizablePanel defaultSize={50} minSize={25} className={`h-full ${!isPreviewMode ? 'hidden lg:block' : 'block'} bg-site-bg overflow-y-auto relative border-l border-site-border lg:border-none min-h-0`}>
                    <div className="sticky top-0 bg-site-bg/90 backdrop-blur border-b border-site-border p-4 flex justify-between items-center z-10 w-full h-14">
                        <h2 className="text-sm font-bold font-display text-site-text uppercase tracking-wider text-site-text-dim">Live Preview</h2>
                        <Button type="button" variant="ghost" size="sm" onClick={generatePreview} className="h-8">Refresh</Button>
                    </div>
                    
                    <div className="p-6 lg:p-10 prose prose-invert max-w-3xl mx-auto prose-headings:font-bold prose-headings:text-site-text prose-p:text-site-text-muted prose-a:text-site-accent hover:prose-a:text-site-accent-hover prose-img:rounded-xl prose-img:border prose-img:border-site-border">
                      {previewContent ? (
                         <>
                           <h1 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight leading-tight">{formData.title || 'Untitled Post'}</h1>
                           {formData.description && <p className="text-xl border-l-4 border-site-accent pl-6 mb-8 text-site-text-muted">{formData.description}</p>}
                           <MDXRemote {...previewContent} components={animatedComponents} />
                         </>
                      ) : (
                         <div className="text-center text-site-text-dim mt-32 flex flex-col items-center gap-4">
                             <p>Start typing to see the preview or click Refresh.</p>
                             <Button variant="outline" onClick={generatePreview}>Generate Initial Preview</Button>
                         </div>
                      )}
                    </div>
               </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    </div>
  );
}
