import { YoutubeTranscript } from 'youtube-transcript';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

class VideoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoUnavailableError';
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

class InvalidVideoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVideoError';
  }
}

export function sanitizeTranscriptText(transcript: string): string {
  if (!transcript) return '';
  return transcript.replace(/\n+/g, '\n').trim();
}

export function handleYouTubeErrors(error: any): string {
  if (error instanceof VideoUnavailableError) {
    return 'No transcript available for this video.';
  }
  if (error instanceof RateLimitError) {
    return 'Service temporarily busy, try again in a few minutes.';
  }
  if (error instanceof NetworkError) {
    return 'Unable to fetch transcript, please try again.';
  }
  if (error instanceof InvalidVideoError) {
    return 'Video not found or private.';
  }
  if (error && error.message) {
    if (error.message.includes('not found or private') || error.message.includes('Invalid video ID')) {
      return 'Video not found or private.';
    }
    if (error.message.includes('transcripts disabled')) {
      return 'Transcripts are disabled for this video.';
    }
    if (error.message.includes('No transcript found')) {
      return 'No transcript available for this video.';
    }
  }
  console.error('Unhandled YouTube error:', error);
  return error?.message || 'An unexpected error occurred while fetching the transcript.';
}

export async function validateVideoAvailability(videoId: string): Promise<boolean> {
  try {
    await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    return true;
  } catch (error: any) {
    if (error.message && (error.message.includes('not found or private') ||
                         error.message.includes('transcripts disabled') ||
                         error.message.includes('No transcript found'))) {
      return false;
    }
    return false;
  }
}

export async function getTranscript(videoId: string, language: string = 'en'): Promise<string> {
  let attempts = 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (attempts < MAX_RETRIES) {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: language,
      });

      if (!rawTranscript || rawTranscript.length === 0) {
        throw new Error(`[YoutubeTranscript] 🚨 No transcript content returned for language: ${language}`);
      }

      const fullText = rawTranscript.map(item => item.text).join(' ');
      return sanitizeTranscriptText(fullText);

    } catch (error: any) {
      attempts++;
      console.warn(`Attempt ${attempts} failed for video ${videoId} (lang: ${language}): ${error.message}`);

      if (error.message && (error.message.includes('timed out') || error.message.includes('network') || error.message.includes('ECONNRESET'))) {
        if (attempts >= MAX_RETRIES) throw new NetworkError(`Network error after ${attempts} attempts: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff *= 2;
        continue;
      }

      if (error.message && (error.message.toLowerCase().includes('too many requests') || error.message.includes('429') || error.message.includes('403'))) {
        if (attempts >= MAX_RETRIES) throw new RateLimitError(`Rate limited after ${attempts} attempts: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoff * (attempts + 1)));
        backoff *= 2;
        continue;
      }

      if (error.message && (error.message.includes('No transcript found for this video') ||
                           error.message.includes('transcripts are disabled'))) {
        throw new VideoUnavailableError(`No transcript found for ${videoId} (lang: ${language}). Transcripts may be disabled.`);
      }

      if (error.message && (error.message.includes('This video is unavailable') ||
                           error.message.includes('Video not found or private') ||
                           error.message.includes('Invalid video ID'))) {
        throw new InvalidVideoError(`Video ${videoId} not found or is private.`);
      }

      if (attempts >= MAX_RETRIES) {
        console.error(`Final attempt failed for ${videoId}. Raw error:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw new Error(`Failed to fetch transcript for ${videoId}: ${error?.message || String(error)}`);
      }

      await new Promise(resolve => setTimeout(resolve, backoff));
      backoff *= 2;
    }
  }
  throw new Error(`Failed to fetch transcript for ${videoId} after ${MAX_RETRIES} attempts.`);
}
