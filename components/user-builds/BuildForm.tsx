'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X, Upload, AlertCircle } from 'lucide-react';
import type { Build, BuildCategory } from '@/lib/user-builds-types';
import { Button } from '@/components/ui/button';

interface BuildFormProps {
  build?: Build;
  onSuccess?: (build: Build) => void;
}

const COMMON_TECHNOLOGIES = [
  'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java',
  'React', 'Next.js', 'Vue', 'Svelte', 'Node.js', 'Express',
  'PostgreSQL', 'MongoDB', 'Redis', 'Prisma', 'GraphQL',
  'Docker', 'AWS', 'Vercel', 'Tailwind CSS', 'Claude', 'OpenAI',
];

export function BuildForm({ build, onSuccess }: BuildFormProps) {
  const router = useRouter();
  const isEditing = !!build;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<BuildCategory[]>([]);

  // Form state
  const [title, setTitle] = useState(build?.title || '');
  const [description, setDescription] = useState(build?.description || '');
  const [readme, setReadme] = useState(build?.readme || '');
  const [repoUrl, setRepoUrl] = useState(build?.repoUrl || '');
  const [demoUrl, setDemoUrl] = useState(build?.demoUrl || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(build?.thumbnailUrl || '');
  const [categoryId, setCategoryId] = useState(build?.category?.id || '');
  const [technologies, setTechnologies] = useState<string[]>(build?.technologies || []);
  const [tags, setTags] = useState<string[]>(build?.tags || []);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    build?.visibility || 'PUBLIC'
  );
  const [newTag, setNewTag] = useState('');
  const [newTech, setNewTech] = useState('');

  // Fetch categories
  useEffect(() => {
    fetch('/api/user-builds/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent, publish = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body = {
        title,
        description,
        readme: readme || undefined,
        repoUrl: repoUrl || undefined,
        demoUrl: demoUrl || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        categoryId: categoryId || undefined,
        technologies,
        tags,
        visibility,
        ...(isEditing ? { status: publish ? 'PUBLISHED' : build?.status } : { publish }),
      };

      const res = await fetch(
        isEditing ? `/api/user-builds/${build.id}` : '/api/user-builds',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save build');
      }

      const savedBuild = await res.json();

      if (onSuccess) {
        onSuccess(savedBuild);
      } else {
        router.push(`/user-builds/${savedBuild.slug}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save build');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const toggleTechnology = (tech: string) => {
    if (technologies.includes(tech)) {
      setTechnologies(technologies.filter((t) => t !== tech));
    } else if (technologies.length < 20) {
      setTechnologies([...technologies, tech]);
    }
  };

  const addCustomTech = () => {
    const tech = newTech.trim();
    if (tech && !technologies.includes(tech) && technologies.length < 20) {
      setTechnologies([...technologies, tech]);
      setNewTech('');
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Awesome Project"
          className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text outline-none focus:border-violet-500/50 transition-colors"
          maxLength={100}
          required
        />
        <p className="text-xs text-site-text-dim mt-1">{title.length}/100</p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">
          Description <span className="text-red-400">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of your project..."
          className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text outline-none focus:border-violet-500/50 transition-colors resize-none"
          rows={3}
          maxLength={500}
          required
        />
        <p className="text-xs text-site-text-dim mt-1">{description.length}/500</p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="">Select a category...</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Technologies */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">Technologies</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {COMMON_TECHNOLOGIES.map((tech) => (
            <button
              key={tech}
              type="button"
              onClick={() => toggleTechnology(tech)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                technologies.includes(tech)
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                  : 'bg-site-surface text-site-text-muted border-site-border hover:border-violet-500/30'
              }`}
            >
              {tech}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTech}
            onChange={(e) => setNewTech(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTech())}
            placeholder="Add custom technology..."
            className="flex-1 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
          />
          <Button type="button" onClick={addCustomTech} variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {technologies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {technologies.map((tech) => (
              <span
                key={tech}
                className="flex items-center gap-1 px-2 py-1 rounded bg-violet-500/20 text-violet-400 text-xs"
              >
                {tech}
                <button type="button" onClick={() => toggleTechnology(tech)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">Tags</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Add a tag..."
            className="flex-1 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
            maxLength={30}
          />
          <Button type="button" onClick={addTag} variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-1 rounded bg-site-surface border border-site-border text-site-text-muted text-xs"
              >
                #{tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-site-text-dim mt-1">{tags.length}/10 tags</p>
      </div>

      {/* URLs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-site-text mb-2">Repository URL</label>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/..."
            className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-site-text mb-2">Demo URL</label>
          <input
            type="url"
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Thumbnail URL */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">Thumbnail URL</label>
        <input
          type="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
        />
        {thumbnailUrl && (
          <div className="mt-3 rounded-lg overflow-hidden border border-site-border max-w-xs">
            <img src={thumbnailUrl} alt="Thumbnail preview" className="w-full" />
          </div>
        )}
      </div>

      {/* README */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">README (Markdown)</label>
        <textarea
          value={readme}
          onChange={(e) => setReadme(e.target.value)}
          placeholder="# Project Name&#10;&#10;Description of your project..."
          className="w-full px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text font-mono text-sm outline-none focus:border-violet-500/50 transition-colors resize-none"
          rows={10}
        />
      </div>

      {/* Visibility */}
      <div>
        <label className="block text-sm font-medium text-site-text mb-2">Visibility</label>
        <div className="flex gap-4">
          {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
                className="w-4 h-4 text-violet-500"
              />
              <span className="text-sm text-site-text capitalize">{v.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4 border-t border-site-border">
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Draft'}
        </Button>
        <Button
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          variant="accent"
          className="bg-violet-600 hover:bg-violet-500"
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? 'Update & Publish' : 'Publish'}
        </Button>
      </div>
    </form>
  );
}
