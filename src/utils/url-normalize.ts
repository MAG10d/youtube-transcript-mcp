import Url from 'url-parse';

export function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;

  const parsedUrl = new Url(url, true) as Url<any>;

  const validHostnames = [
    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
    'youtube.co.uk', 'youtube.de', 'youtube.fr', 'youtube.jp',
    'youtube.ca', 'youtube.es', 'youtube.br', 'youtube.com.br',
    'youtube.co.in', 'youtube.co.kr',
  ];

  const hostname = parsedUrl.hostname.startsWith('www.')
    ? parsedUrl.hostname.substring(4)
    : parsedUrl.hostname;

  if (!validHostnames.includes(hostname)) return false;

  const videoId = extractVideoIdFromParsedUrl(parsedUrl);
  return !!videoId;
}

function extractVideoIdFromParsedUrl(parsedUrl: Url<any>): string | null {
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (parsedUrl.hostname === 'youtu.be') {
    const videoId = pathname.split('/')[1];
    return videoId || null;
  }
  if (pathname.startsWith('/watch') && query.v) {
    return Array.isArray(query.v) ? query.v[0] : query.v;
  }
  if (pathname.startsWith('/live/')) return pathname.split('/')[2] || null;
  if (pathname.startsWith('/embed/')) return pathname.split('/')[2] || null;
  if (pathname.startsWith('/shorts/')) return pathname.split('/')[2] || null;
  if (query.v && (pathname === '/' || pathname === '')) {
    return Array.isArray(query.v) ? query.v[0] : query.v;
  }
  return null;
}

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new Url(url, true) as Url<any>;
    return extractVideoIdFromParsedUrl(parsedUrl);
  } catch (e) {
    return null;
  }
}

export function cleanTrackingParams(url: string): string {
  if (!url) return url;
  try {
    const parsedUrl = new Url(url, true) as Url<any>;
    const videoId = extractVideoIdFromParsedUrl(parsedUrl);

    if (videoId) {
      if (parsedUrl.hostname === 'youtu.be' ||
          parsedUrl.pathname.startsWith('/live/') ||
          parsedUrl.pathname.startsWith('/embed/') ||
          parsedUrl.pathname.startsWith('/shorts/')) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
      if (parsedUrl.pathname.startsWith('/watch')) {
        const protocol = parsedUrl.protocol || 'https';
        return `${protocol}//www.youtube.com/watch?v=${videoId}`;
      }
    }

    let newQuery: Record<string, any> = {};
    if (parsedUrl.query && parsedUrl.query.v) newQuery = { v: parsedUrl.query.v };
    parsedUrl.set('query', newQuery);
    if (parsedUrl.hostname && parsedUrl.hostname.includes('youtube.')) {
      parsedUrl.set('hostname', 'www.youtube.com');
    }
    parsedUrl.set('protocol', 'https');
    return parsedUrl.toString();
  } catch (e) {
    return url;
  }
}

export function normalizeYouTubeUrl(url: string): string {
  const videoId = extractVideoId(url);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  console.warn(`Could not normalize URL, video ID not found: ${url}`);
  return url;
}
