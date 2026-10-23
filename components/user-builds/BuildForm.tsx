'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Plus, X, AlertCircle } from 'lucide-react';
import type { Build, BuildCategory } from '@/lib/user-builds-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const FIELD_LABEL = 'block text-sm font-medium text-site-text';

interface BuildFormProps {
  build?: Build;
  onSuccess?: (build: Build) => void;
}

const COMMON_TECHNOLOGIES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Rust',
  'Go',
  'Java',
  'React',
  'Next.js',
  'Vue',
  'Svelte',
  'Node.js',
  'Express',
  'PostgreSQL',
  'MongoDB',
  'Redis',
  'Prisma',
  'GraphQL',
  'Docker',
  'AWS',
  'Vercel',
  'Tailwind CSS',
  'Claude',
  'OpenAI',
];

export function BuildForm({ build, onSuccess }: BuildFormProps) {
  const { t } = useTranslation('c-user-builds');
  const navigate = useNavigate();
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
  const [price, setPrice] = useState<string>(build?.price ? String(build.price) : '');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    build?.visibility || 'PUBLIC',
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

  const handleSubmit = async (e: React.FormEvent) => {
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
        price: price ? Math.max(0, parseInt(price, 10) || 0) : 0,
      };

      const res = await fetch(isEditing ? `/api/user-builds/${build.id}` : '/api/user-builds', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          data.error || t('failed-to-save', { defaultValue: 'Failed to save build' }),
        );
      }

      const savedBuild = await res.json();

      if (onSuccess) {
        onSuccess(savedBuild);
      } else {
        navigate({ to: `/user-builds/${savedBuild.slug}` });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('failed-to-save', { defaultValue: 'Failed to save build' }),
      );
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
    <form onSubmit={handleSubmit} className="space-y-[var(--site-section-gap)]">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-site-sm border border-site-danger/30 bg-site-danger/10 px-4 py-3 text-sm text-site-danger"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="build-title" className={FIELD_LABEL}>
          {t('label-title', { defaultValue: 'Title' })} <span className="text-site-danger">*</span>
        </label>
        <Input
          id="build-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('placeholder-title', { defaultValue: 'My Awesome Project' })}
          maxLength={100}
          required
        />
        <p className="text-xs text-site-text-dim">{title.length}/100</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="build-description" className={FIELD_LABEL}>
          {t('label-description', { defaultValue: 'Description' })}{' '}
          <span className="text-site-danger">*</span>
        </label>
        <Textarea
          id="build-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('placeholder-description', {
            defaultValue: 'A brief description of your project...',
          })}
          rows={3}
          maxLength={500}
          required
        />
        <p className="text-xs text-site-text-dim">{description.length}/500</p>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label htmlFor="build-category" className={FIELD_LABEL}>
          {t('label-category', { defaultValue: 'Category' })}
        </label>
        <Select
          id="build-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">{t('select-category', { defaultValue: 'Select a category...' })}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Technologies */}
      <div className="space-y-3">
        <label htmlFor="build-custom-tech" className={FIELD_LABEL}>
          {t('label-technologies', { defaultValue: 'Technologies' })}
        </label>
        <div className="flex flex-wrap gap-2">
          {COMMON_TECHNOLOGIES.map((tech) => (
            <Button
              key={tech}
              type="button"
              size="xs"
              variant={technologies.includes(tech) ? 'accent' : 'outline'}
              aria-pressed={technologies.includes(tech)}
              onClick={() => toggleTechnology(tech)}
              className="rounded-full"
            >
              {tech}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            id="build-custom-tech"
            type="text"
            value={newTech}
            onChange={(e) => setNewTech(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTech())}
            placeholder={t('placeholder-custom-tech', { defaultValue: 'Add custom technology...' })}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={addCustomTech}
            variant="secondary"
            size="icon"
            aria-label={t('add-technology', { defaultValue: 'Add technology' })}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        {technologies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {technologies.map((tech) => (
              <Badge key={tech} variant="accent" size="lg" className="gap-2 pr-1.5">
                {tech}
                <button
                  type="button"
                  onClick={() => toggleTechnology(tech)}
                  className="rounded-full p-0.5 transition-colors hover:bg-site-accent/20"
                  aria-label={t('remove-item', { defaultValue: 'Remove {{name}}', name: tech })}
                >
                  <X aria-hidden />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <label htmlFor="build-tag" className={FIELD_LABEL}>
          {t('label-tags', { defaultValue: 'Tags' })}
        </label>
        <div className="flex gap-2">
          <Input
            id="build-tag"
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder={t('placeholder-tag', { defaultValue: 'Add a tag...' })}
            className="flex-1"
            maxLength={30}
          />
          <Button
            type="button"
            onClick={addTag}
            variant="secondary"
            size="icon"
            aria-label={t('add-tag', { defaultValue: 'Add tag' })}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="default" size="lg" className="gap-2 pr-1.5">
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full p-0.5 transition-colors hover:bg-site-border"
                  aria-label={t('remove-item', { defaultValue: 'Remove {{name}}', name: tag })}
                >
                  <X aria-hidden />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-site-text-dim">
          {t('tags-count', { defaultValue: '{{count}}/10 tags', count: tags.length })}
        </p>
      </div>

      {/* URLs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="build-repo-url" className={FIELD_LABEL}>
            {t('label-repo-url', { defaultValue: 'Repository URL' })}
          </label>
          <Input
            id="build-repo-url"
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/..."
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="build-demo-url" className={FIELD_LABEL}>
            {t('label-demo-url', { defaultValue: 'Demo URL' })}
          </label>
          <Input
            id="build-demo-url"
            type="url"
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Thumbnail URL */}
      <div className="space-y-2">
        <label htmlFor="build-thumbnail-url" className={FIELD_LABEL}>
          {t('label-thumbnail-url', { defaultValue: 'Thumbnail URL' })}
        </label>
        <Input
          id="build-thumbnail-url"
          type="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://..."
        />
        {thumbnailUrl && (
          <div className="max-w-xs overflow-hidden rounded-site-sm border border-site-border">
            <img
              src={thumbnailUrl}
              alt={t('thumbnail-preview', { defaultValue: 'Thumbnail preview' })}
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* README */}
      <div className="space-y-2">
        <label htmlFor="build-readme" className={FIELD_LABEL}>
          {t('label-readme', { defaultValue: 'README (Markdown)' })}
        </label>
        <Textarea
          id="build-readme"
          value={readme}
          onChange={(e) => setReadme(e.target.value)}
          placeholder="# Project Name&#10;&#10;Description of your project..."
          className="font-mono"
          rows={10}
        />
      </div>

      {/* Marketplace price */}
      <div className="space-y-2">
        <label htmlFor="build-price" className={FIELD_LABEL}>
          {t('label-price', { defaultValue: 'Price (coins)' })}
        </label>
        <Input
          id="build-price"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t('placeholder-price', { defaultValue: '0 (free)' })}
        />
        <p className="text-xs text-site-text-dim">
          {t('price-description', {
            defaultValue:
              'Charge coins to unlock the README, source, and demo. Leave 0 to keep it free. A 10% platform fee applies to sales.',
          })}
        </p>
      </div>

      {/* Visibility */}
      <fieldset className="space-y-2">
        <legend className={FIELD_LABEL}>
          {t('label-visibility', { defaultValue: 'Visibility' })}
        </legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((v) => (
            <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
                className="size-5 accent-site-accent"
              />
              <span className="text-sm text-site-text capitalize">{v.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex gap-2 border-t border-site-border pt-4">
        <Button type="submit" variant="accent" className="w-full md:w-auto" loading={loading}>
          {isEditing
            ? t('update-build', { defaultValue: 'Update Build' })
            : t('save-build', { defaultValue: 'Save Build' })}
        </Button>
      </div>
    </form>
  );
}
