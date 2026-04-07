import { kv } from '@vercel/kv';

const SUCCESSFUL_TRANSCRIPT_TTL_SECONDS = 60 * 60 * 24 * 7;
const ERROR_RESPONSE_TTL_SECONDS = 60 * 5;

function getTranscriptCacheKey(videoId: string, language: string): string {
  return `transcript:${videoId}:${language}`;
}

export async function getCachedTranscript(videoId: string, language: string): Promise<string | null> {
  const cacheKey = getTranscriptCacheKey(videoId, language);
  try {
    const value = await kv.get<string>(cacheKey);
    return value || null;
  } catch (e: any) {
    console.error(`Error getting from KV (${cacheKey}): ${e.message}`);
    return null;
  }
}

export async function setCachedTranscript(videoId: string, language: string, data: string, isError: boolean): Promise<void> {
  const cacheKey = getTranscriptCacheKey(videoId, language);
  const ttl = isError ? ERROR_RESPONSE_TTL_SECONDS : SUCCESSFUL_TRANSCRIPT_TTL_SECONDS;
  try {
    await kv.set(cacheKey, data, { ex: ttl });
  } catch (e: any) {
    console.error(`Error putting to KV (${cacheKey}): ${e.message}`);
  }
}

function getVideoAnalyticsCacheKey(videoId: string): string {
  return `analytics:videos:${videoId}`;
}

function getDailyRequestsAnalyticsCacheKey(): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = (today.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = today.getUTCDate().toString().padStart(2, '0');
  return `analytics:requests:${year}-${month}-${day}`;
}

export async function incrementVideoRequestCount(videoId: string): Promise<void> {
  const cacheKey = getVideoAnalyticsCacheKey(videoId);
  try {
    await kv.incr(cacheKey);
  } catch (e: any) {
    console.error(`Error incrementing video request count (${cacheKey}): ${e.message}`);
  }
}

export async function trackDailyRequests(): Promise<void> {
  const cacheKey = getDailyRequestsAnalyticsCacheKey();
  try {
    await kv.incr(cacheKey);
  } catch (e: any) {
    console.error(`Error tracking daily requests (${cacheKey}): ${e.message}`);
  }
}
