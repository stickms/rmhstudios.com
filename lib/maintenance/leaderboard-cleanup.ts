import { prisma } from '../prisma';

/**
 * Scans the SongLeaderboard table for duplicate (songId, userId) entries
 * and keeps only the one with the highest score for each unique pair.
 */
export async function cleanupLeaderboardDuplicates() {
    console.log('[MAINTENANCE] Starting leaderboard duplicate cleanup...');
    let totalRemoved = 0;

    try {
        // Find all (songId, userId) pairs that have more than 1 entry
        const duplicates = await prisma.songLeaderboard.groupBy({
            by: ['songId', 'userId'],
            _count: {
                userId: true
            },
            having: {
                userId: {
                    _count: {
                        gt: 1
                    }
                }
            }
        });

        if (duplicates.length === 0) {
            console.log('[MAINTENANCE] No leaderboard duplicates found.');
            return;
        }

        console.log(`[MAINTENANCE] Found ${duplicates.length} user/song pairs with duplicate scores.`);

        for (const duplicate of duplicates) {
            const { songId, userId } = duplicate;

            // Fetch all entries for this specific pair, ordered by score (best first)
            const entries = await prisma.songLeaderboard.findMany({
                where: { songId, userId },
                orderBy: { score: 'desc' },
                select: { id: true, score: true }
            });

            if (entries.length <= 1) continue;

            // Keep the first entry (highest score), delete the rest
            const idsToDelete = entries.slice(1).map(e => e.id);
            
            const deleteResult = await prisma.songLeaderboard.deleteMany({
                where: {
                    id: { in: idsToDelete }
                }
            });

            totalRemoved += deleteResult.count;
            console.log(`[MAINTENANCE] Removed ${deleteResult.count} duplicate(s) for user ${userId} on song ${songId}. Best score kept: ${entries[0].score}`);
        }

        console.log(`[MAINTENANCE] Leaderboard cleanup finished. Total duplicates removed: ${totalRemoved}`);
    } catch (error) {
        console.error('[MAINTENANCE] Leaderboard cleanup failed:', error);
    }
}
