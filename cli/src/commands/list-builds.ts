import { requireAuth } from '../lib/config.js';
import { apiRequest } from '../lib/api.js';
import { error, color, padEnd } from '../lib/output.js';
import type { BuildItem } from '../types.js';

interface ListResponse {
  items: BuildItem[];
  hasMore: boolean;
}

function statusColor(status: string): string {
  switch (status) {
    case 'PUBLISHED': return color.green(status);
    case 'DRAFT': return color.yellow(status);
    case 'ARCHIVED': return color.dim(status);
    default: return status;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function listBuilds(): Promise<void> {
  const config = requireAuth();

  try {
    const data = await apiRequest<ListResponse>('/api/user-builds', {
      token: config.token,
      params: { userId: config.user.id, limit: '50' },
    });

    if (data.items.length === 0) {
      console.log('');
      console.log(color.dim('  No builds found. Run `rmhcode push-build` to publish one.'));
      console.log('');
      return;
    }

    console.log('');
    console.log(
      color.bold(
        `  ${padEnd('TITLE', 30)} ${padEnd('STATUS', 12)} ${padEnd('VISIBILITY', 12)} ${padEnd('LIKES', 6)} ${padEnd('VIEWS', 6)} DATE`
      )
    );
    console.log(color.dim(`  ${'─'.repeat(90)}`));

    for (const build of data.items) {
      const title = padEnd(build.title.slice(0, 28), 30);
      const status = padEnd(statusColor(build.status), 12 + 9);
      const vis = padEnd(build.visibility, 12);
      const likes = padEnd(String(build.likeCount), 6);
      const views = padEnd(String(build.viewCount), 6);
      const date = formatDate(build.publishedAt || build.createdAt);

      console.log(`  ${title} ${status} ${vis} ${likes} ${views} ${date}`);
    }

    if (data.hasMore) {
      console.log(color.dim(`\n  ... and more. View all at rmhstudios.com/user-builds`));
    }
    console.log('');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to fetch builds');
    process.exit(1);
  }
}
