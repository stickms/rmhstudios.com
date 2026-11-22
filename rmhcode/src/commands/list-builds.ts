import { requireAuth } from '../lib/config.js';
import { apiRequest } from '../lib/api.js';
import { error, color, padEnd } from '../lib/output.js';
import type { BuildItem, ReleaseItem } from '../types.js';

interface ListResponse {
  items: BuildItem[];
  hasMore: boolean;
}

/** The newest release's version for each build, by slug. A build whose releases cannot be read shows a dash. */
async function latestVersions(token: string, builds: BuildItem[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  for (let i = 0; i < builds.length; i += 5) {
    await Promise.all(
      builds.slice(i, i + 5).map(async (build) => {
        try {
          const data = await apiRequest<{ items: ReleaseItem[] }>(
            `/api/user-builds/${encodeURIComponent(build.slug)}/releases`,
            { token },
          );
          const first = data.items[0];
          if (first) latest.set(build.slug, first.version);
        } catch {
          // Leave it out: the list is still worth showing.
        }
      }),
    );
  }
  return latest;
}

function visibilityColor(vis: string): string {
  switch (vis) {
    case 'PUBLIC':
      return color.green(vis);
    case 'UNLISTED':
      return color.yellow(vis);
    case 'PRIVATE':
      return color.dim(vis);
    default:
      return vis;
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
      params: {
        userId: config.user.id,
        limit: '50',
      },
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
        `  ${padEnd('TITLE', 30)} ${padEnd('VISIBILITY', 12)} ${padEnd('LIKES', 6)} ${padEnd('VIEWS', 6)} ${padEnd('LATEST', 10)} DATE`,
      ),
    );
    console.log(color.dim(`  ${'─'.repeat(89)}`));

    const latest = await latestVersions(config.token, data.items);

    for (const build of data.items) {
      const title = padEnd(build.title.slice(0, 28), 30);
      const vis = padEnd(visibilityColor(build.visibility), 12 + 9);
      const likes = padEnd(String(build.likeCount), 6);
      const views = padEnd(String(build.viewCount), 6);
      const version = padEnd((latest.get(build.slug) ?? '-').slice(0, 9), 10);
      const date = formatDate(build.publishedAt || build.createdAt);

      console.log(`  ${title} ${vis} ${likes} ${views} ${version} ${date}`);
    }

    if (data.hasMore) {
      console.log(color.dim(`\n  ... and more. View all at rmhstudios.com/create/builds`));
    }
    console.log('');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to fetch builds');
    process.exit(1);
  }
}
