import { kv } from '@vercel/kv';

const ANALYTICS_TTL_SECONDS = 60 * 60 * 24;
const POPULAR_VIDEOS_TTL_SECONDS = 60 * 60 * 24 * 7;

function getDailyRequestsKey(date: string): string {
  return `analytics:requests:${date}`;
}

function getDailyErrorsKey(date: string, errorType?: string): string {
  return `analytics:errors:${date}${errorType ? ':' + errorType : ':general'}`;
}

function getVideoRequestsKey(videoId: string): string {
  return `analytics:videos:${videoId}`;
}

function getPopularVideosWeeklyKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
  const days = Math.floor((now.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + firstDayOfYear.getUTCDay() + 1) / 7);
  return `analytics:popular:weekly:${year}-W${String(weekNumber).padStart(2, '0')}`;
}

export async function logRequest(videoId: string, success: boolean, errorType?: string): Promise<void> {
  const today = new Date();
  const dateKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  if (!success) {
    const dailyErrKey = getDailyErrorsKey(dateKey, errorType || 'unknown');
    try {
      await kv.incr(dailyErrKey);
      await kv.expire(dailyErrKey, ANALYTICS_TTL_SECONDS * 2);
    } catch (e: any) {
      console.error(`Error updating daily error count (${dailyErrKey}): ${e.message}`);
    }
  }
}

export async function getDailyStats(date: string): Promise<{ requests: number; errors: Record<string, number>; totalErrors: number }> {
  let requestCount = 0;
  const dailyReqKey = getDailyRequestsKey(date);
  try {
    const reqVal = await kv.get<number>(dailyReqKey);
    requestCount = reqVal || 0;
  } catch (e: any) {
    console.error(`Error fetching daily request count (${dailyReqKey}): ${e.message}`);
  }

  const errors: Record<string, number> = {};
  let totalErrors = 0;
  try {
    const errorPattern = `analytics:errors:${date}:*`;
    const keys = await kv.keys(errorPattern);
    for (const key of keys) {
      const errorType = key.substring(`analytics:errors:${date}:`.length);
      const count = await kv.get<number>(key) || 0;
      errors[errorType] = count;
      totalErrors += count;
    }
  } catch (e: any) {
    console.error(`Error fetching daily error stats for date ${date}: ${e.message}`);
  }

  return { requests: requestCount, errors, totalErrors };
}

export async function getPopularVideos(limit: number): Promise<Array<{ videoId: string; count: number }>> {
  const popularKey = getPopularVideosWeeklyKey();
  try {
    const videos = await kv.get<Array<{ videoId: string; count: number }>>(popularKey);
    if (videos && Array.isArray(videos)) return videos.slice(0, limit);
  } catch (e: any) {
    console.error(`Error fetching or parsing popular videos (${popularKey}): ${e.message}`);
  }
  return [];
}

export async function updatePopularVideosList(topN: number = 20): Promise<void> {
  console.log('Attempting to update popular videos list...');
  const videoCounts: Array<{ videoId: string; count: number }> = [];

  try {
    let cursor = 0;
    do {
      const [nextCursor, keys] = await kv.scan(cursor, { match: 'analytics:videos:*', count: 1000 });
      cursor = nextCursor === '0' ? 0 : Number(nextCursor) || 0;

      for (const key of keys) {
        const videoId = key.substring('analytics:videos:'.length);
        const count = await kv.get<number>(key) || 0;
        if (count > 0) videoCounts.push({ videoId, count });
      }
    } while (cursor !== 0);

    videoCounts.sort((a, b) => b.count - a.count);
    const topVideos = videoCounts.slice(0, topN);

    if (topVideos.length > 0) {
      const popularKey = getPopularVideosWeeklyKey();
      await kv.set(popularKey, topVideos, { ex: POPULAR_VIDEOS_TTL_SECONDS });
      console.log(`Updated popular videos list (${popularKey}) with ${topVideos.length} videos.`);
    } else {
      console.log('No video data found to update popular videos list.');
    }
  } catch (error: any) {
    console.error('Error updating popular videos list:', error.message);
  }
}
