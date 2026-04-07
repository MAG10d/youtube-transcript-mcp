import { kv } from '@vercel/kv';

const SUCCESSFUL_TRANSCRIPT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ERROR_RESPONSE_TTL_SECONDS = 60 * 5; // 5 minutes

function getTranscriptCacheKey(videoId: string, language: string): string {
  return `transcript:${videoId}:${language}`;
}

/**
 * Retrieves a cached transcript from KV.
 * @param videoId The YouTube video ID.
 * @param language The language code for the transcript.
 * @returns The cached transcript text, or null if not found.
 */
export async function getCachedTranscript(
  videoId: string, 
  language: string
): Promise<string | null> {
  const cacheKey = getTranscriptCacheKey(videoId, language);
  try {
    const value = await kv.get<string>(cacheKey);
    return value || null;
  } catch (e: any) {
    console.error(`Error getting from KV (${cacheKey}): ${e.message}`);
    return null;
  }
}

/**
 * Stores a transcript (or an error message) in KV with appropriate TTL.
 * @param videoId The YouTube video ID.
 * @param language The language code for the transcript.
 * @param data The transcript text or error message to cache.
 * @param isError True if the data being cached is an error message, false otherwise.
 */
export async function setCachedTranscript(
  videoId: string,
  language: string,
  data: string,
  isError: boolean
): Promise<void> {
  const cacheKey = getTranscriptCacheKey(videoId, language);
  const ttl = isError ? ERROR_RESPONSE_TTL_SECONDS : SUCCESSFUL_TRANSCRIPT_TTL_SECONDS;
  try {
    await kv.set(cacheKey, data, { ex: ttl });
  } catch (e: any) {
    console.error(`Error putting to KV (${cacheKey}): ${e.message}`);
  }
}

// --- Analytics Caching Functions ---

function getVideoAnalyticsCacheKey(videoId: string): string {
  return `analytics:videos:${videoId}`;
}

function getDailyRequestsAnalyticsCacheKey(): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = (today.getUTCMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
  const day = today.getUTCDate().toString().padStart(2, '0');
  return `analytics:requests:${year}-${month}-${day}`;
}

/**
 * Increments the request count for a specific video ID in KV.
 * @param videoId The YouTube video ID.
 */
export async function incrementVideoRequestCount(videoId: string): Promise<void> {
  const cacheKey = getVideoAnalyticsCacheKey(videoId);
  try {
    await kv.incr(cacheKey);
  } catch (e: any) {
    console.error(`Error incrementing video request count (${cacheKey}): ${e.message}`);
  }
}

/**
 * Tracks the daily request count in KV.
 */
export async function trackDailyRequests(): Promise<void> {
  const cacheKey = getDailyRequestsAnalyticsCacheKey();
  try {
    await kv.incr(cacheKey);
  } catch (e: any) {
    console.error(`Error tracking daily requests (${cacheKey}): ${e.message}`);
  }
}
