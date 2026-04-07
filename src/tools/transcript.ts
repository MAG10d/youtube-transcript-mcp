import {
  normalizeYouTubeUrl,
  extractVideoId,
  isValidYouTubeUrl,
} from '../utils/url-normalize.js';
import {
  getCachedTranscript,
  setCachedTranscript,
  incrementVideoRequestCount,
  trackDailyRequests,
} from '../utils/cache.js';
import {
  getTranscript as fetchTranscriptFromYouTube,
  handleYouTubeErrors,
} from '../lib/youtube.js';
import { logRequest as logAnalyticsError } from '../utils/analytics.js';

// Define the MCP Tool Specification
export const getTranscriptToolSpec = {
  name: 'get_transcript',
  description: 'Extract transcript from YouTube video URL with automatic language detection',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'YouTube video URL (any format)',
      },
      language: {
        type: 'string',
        description: "Optional language code for the transcript (e.g., 'en', 'tr'). If not available, will automatically fall back to the best available language. Defaults to 'auto' for automatic detection.",
        optional: true,
      }
    },
    required: ['url'],
  },
};

/**
 * Enhanced transcript function with automatic language detection and fallback
 */
export async function getTranscript(url: string, language: string = 'auto'): Promise<string> {
  // 1. Validate URL
  if (!isValidYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL provided.');
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  const videoId = extractVideoId(normalizedUrl);

  if (!videoId) {
    throw new Error('Could not extract video ID from the URL.');
  }

  // Analytics: Track overall daily requests and per-video requests.
  trackDailyRequests().catch(err => console.error("Failed to track daily requests:", err));
  incrementVideoRequestCount(videoId).catch(err => console.error("Failed to increment video request count:", err));

  // Handle auto detection or specific language request
  if (language === 'auto') {
    return await getTranscriptWithAutoDetection(videoId);
  } else {
    return await getTranscriptWithFallback(videoId, language);
  }
}

/**
 * Attempts to get transcript with automatic language detection
 */
async function getTranscriptWithAutoDetection(videoId: string): Promise<string> {
  const languagesToTry = ['zh-Hant', 'zh-Hans', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'tr', 'pt', 'it', 'ru', 'ar'];

  let lastError: any;
  let availableLanguages: string[] = [];

  for (const lang of languagesToTry) {
    try {
      console.log(`Trying auto-detection for ${videoId} with language: ${lang}`);

      const cachedData = await getCachedTranscript(videoId, lang);
      if (cachedData && !cachedData.startsWith('Error:')) {
        console.log(`Auto-detection: Found cached transcript in ${lang}`);
        return cachedData;
      }

      const transcript = await fetchTranscriptFromYouTube(videoId, lang);
      await setCachedTranscript(videoId, lang, transcript, false);

      console.log(`Auto-detection: Successfully found transcript in ${lang}`);
      return `[Auto-detected language: ${lang}]\n\n${transcript}`;

    } catch (error: any) {
      lastError = error;
      console.log(`Auto-detection: ${lang} failed - ${error.message}`);

      if (!isLanguageRelatedError(error)) {
        break;
      }

      availableLanguages.push(`${lang}: ${error.message}`);
    }
  }

  const errorMessage = availableLanguages.length > 0
    ? `No transcript available in any tested language. Tried: ${availableLanguages.join(', ')}`
    : handleYouTubeErrors(lastError);

  throw new Error(errorMessage);
}

/**
 * Attempts to get transcript in requested language with English fallback
 */
async function getTranscriptWithFallback(videoId: string, requestedLanguage: string): Promise<string> {
  try {
    console.log(`Attempting ${videoId} in requested language: ${requestedLanguage}`);

    const cachedData = await getCachedTranscript(videoId, requestedLanguage);
    if (cachedData) {
      if (cachedData.startsWith('Error:')) {
        throw new Error(cachedData);
      }
      return cachedData;
    }

    const transcript = await fetchTranscriptFromYouTube(videoId, requestedLanguage);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(`Transcript fetch returned empty content for language: ${requestedLanguage}`);
    }

    await setCachedTranscript(videoId, requestedLanguage, transcript, false);
    return transcript;

  } catch (error: any) {
    console.log(`Requested language ${requestedLanguage} failed: ${error.message}`);

    if (isLanguageRelatedError(error) && requestedLanguage !== 'en') {
      console.log(`Attempting English fallback for ${videoId}`);

      try {
        const cachedEnglish = await getCachedTranscript(videoId, 'en');
        if (cachedEnglish && !cachedEnglish.startsWith('Error:')) {
          return `[Requested language '${requestedLanguage}' not available, showing English instead]\n\n${cachedEnglish}`;
        }

        const englishTranscript = await fetchTranscriptFromYouTube(videoId, 'en');
        await setCachedTranscript(videoId, 'en', englishTranscript, false);
        return `[Requested language '${requestedLanguage}' not available, showing English instead]\n\n${englishTranscript}`;

      } catch (englishError: any) {
        console.log(`English fallback also failed: ${englishError.message}`);
        const errorMessage = handleYouTubeErrors(error);
        await setCachedTranscript(videoId, requestedLanguage, `Error: ${errorMessage}`, true);
        throw new Error(`Transcript not available in '${requestedLanguage}' and English fallback failed: ${handleYouTubeErrors(englishError)}`);
      }
    }

    const errorMessage = handleYouTubeErrors(error);
    await setCachedTranscript(videoId, requestedLanguage, `Error: ${errorMessage}`, true);
    logAnalyticsError(videoId, false, error.name || 'FetchError').catch(err => console.error("Failed to log analytics error:", err));
    throw new Error(handleYouTubeErrors(error));
  }
}

function isLanguageRelatedError(error: any): boolean {
  if (!error || !error.message) return false;
  const message = error.message.toLowerCase();
  return message.includes('language') ||
    message.includes('subtitle') ||
    message.includes('caption') ||
    message.includes('transcript') ||
    message.includes('not available') ||
    message.includes('no transcript found');
}
