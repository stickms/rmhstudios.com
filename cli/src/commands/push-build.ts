import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { requireAuth } from '../lib/config.js';
import { apiRequest, API_BASE } from '../lib/api.js';
import { success, error, info, color } from '../lib/output.js';

interface BuildResponse {
  id: string;
  slug: string;
  title: string;
  status: string;
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` ${color.dim(`(${defaultValue})`)}` : '';
  const answer = await rl.question(`${color.cyan('?')} ${question}${suffix}: `);
  return answer.trim() || defaultValue || '';
}

export async function pushBuild(): Promise<void> {
  const config = requireAuth();
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log('');
    console.log(color.bold('  Publish a new build to RMH User Builds'));
    console.log(color.dim('  Fields marked with * are required'));
    console.log('');

    let title = '';
    while (title.length < 5 || title.length > 100) {
      title = await prompt(rl, 'Title *');
      if (title.length < 5) info('Title must be at least 5 characters');
      if (title.length > 100) info('Title must be at most 100 characters');
    }

    let description = '';
    while (description.length < 10 || description.length > 500) {
      description = await prompt(rl, 'Description *');
      if (description.length < 10) info('Description must be at least 10 characters');
      if (description.length > 500) info('Description must be at most 500 characters');
    }

    const repoUrl = await prompt(rl, 'Repository URL');
    const demoUrl = await prompt(rl, 'Demo URL');
    const thumbnailUrl = await prompt(rl, 'Thumbnail Image URL');

    const techInput = await prompt(rl, 'Technologies (comma-separated)');
    const technologies = techInput ? techInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    const tagInput = await prompt(rl, 'Tags (comma-separated)');
    const tags = tagInput ? tagInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    const visibilityInput = await prompt(rl, 'Visibility (public/unlisted/private)', 'public');
    const visibility = visibilityInput.toUpperCase() as 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

    const publishInput = await prompt(rl, 'Publish now? (y/n)', 'y');
    const publish = publishInput.toLowerCase() !== 'n';

    let readme: string | undefined;
    const readmePath = join(process.cwd(), 'README.md');
    if (existsSync(readmePath)) {
      const includeReadme = await prompt(rl, 'Include README.md from current directory? (y/n)', 'y');
      if (includeReadme.toLowerCase() !== 'n') {
        readme = readFileSync(readmePath, 'utf-8');
      }
    }

    rl.close();

    info('Publishing build...');

    const data = await apiRequest<BuildResponse>('/api/user-builds', {
      method: 'POST',
      token: config.token,
      body: {
        title,
        description,
        repoUrl: repoUrl || undefined,
        demoUrl: demoUrl || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        technologies,
        tags,
        visibility,
        publish,
        readme,
      },
    });

    console.log('');
    success(`Build "${data.title}" ${publish ? 'published' : 'saved as draft'}!`);
    console.log(`  ${color.dim('View at:')} ${API_BASE}/user-builds/${data.slug}`);
    console.log('');
  } catch (e) {
    rl.close();
    error(e instanceof Error ? e.message : 'Failed to publish build');
    process.exit(1);
  }
}
