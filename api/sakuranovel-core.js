// SakuraNovel Core Helper & Upstream Client
// Direct integration with SakuraNovel WordPress REST API

const SAKURA_BASE_URL = 'https://sakuranovel.id/wp-json/wp/v2';
const SAKURA_HEADERS = {
  'User-Agent': 'okhttp/4.9.2',
  'Accept': 'application/json',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// In-memory cover cache to avoid redundant external network lookups
const coverCache = new Map();

export function decodeHtmlEntities(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&hellip;/g, '...')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function cleanParagraphs(html) {
  if (!html || typeof html !== 'string') return [];

  // Match all <p>...</p> tags
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const matches = [];
  let match;

  while ((match = pRegex.exec(html)) !== null) {
    const rawContent = match[1];
    const textOnly = rawContent.replace(/<[^>]+>/g, '').trim();
    const cleanText = decodeHtmlEntities(textOnly);

    // Filter out watermarks, donation banners, and empty text
    const isWatermark = /sakuranovel(\.id)?/i.test(cleanText) && cleanText.length < 50;
    const isDonation = /trakteer|saweria|donasi/i.test(cleanText);

    if (cleanText && !isWatermark && !isDonation) {
      matches.push({
        type: 'text',
        content: cleanText,
      });
    }
  }

  // Fallback if no <p> tags were found (split by lines)
  if (matches.length === 0) {
    const lines = html.split(/\r?\n|<br\s*\/?>/i);
    for (const line of lines) {
      const clean = decodeHtmlEntities(line.replace(/<[^>]+>/g, '').trim());
      if (clean && !/sakuranovel(\.id)?/i.test(clean)) {
        matches.push({ type: 'text', content: clean });
      }
    }
  }

  return matches;
}

export function parseChapterMeta(post, index = 0) {
  const id = post.id;
  const slug = post.slug || '';
  const date = post.date || '';
  const rawTitle = post.title?.rendered || post.title || '';
  const cleanTitle = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, ''));

  // 1. Extract chapter number from slug (e.g. -ch154-, -ch1-, -ch0-)
  let chapterNumber = '';
  const slugChMatch = slug.match(/[-_]ch(?:apter)?[-_]?(\d+(?:\.\d+)?)/i);
  if (slugChMatch) {
    chapterNumber = `Chapter ${slugChMatch[1]}`;
  }

  // 2. Extract chapter number from title: "Chapter 1", "Ch. 154", "Bab 1"
  if (!chapterNumber) {
    const chMatch = cleanTitle.match(/(?:Chapter|Bab|Ch\.?)\s*(\d+(?:\.\d+)?)/i);
    if (chMatch) {
      chapterNumber = `Chapter ${chMatch[1]}`;
    }
  }

  // 3. Check for prologue / side story / epilogue
  if (!chapterNumber) {
    if (/side\s*story/i.test(cleanTitle) || /side\s*story/i.test(slug)) {
      chapterNumber = 'Side Story';
    } else if (/prologue/i.test(cleanTitle) || /prologue/i.test(slug)) {
      chapterNumber = 'Prologue';
    } else if (/epilogue/i.test(cleanTitle) || /epilogue/i.test(slug)) {
      chapterNumber = 'Epilogue';
    } else {
      chapterNumber = `Chapter ${index + 1}`;
    }
  }

  return {
    id,
    slug,
    title: cleanTitle,
    chapter_number: chapterNumber,
    date,
  };
}

export async function fetchSakura(path, query = {}) {
  const url = new URL(`${SAKURA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: SAKURA_HEADERS,
  });

  if (!res.ok) {
    throw new Error(`SakuraNovel WP API ${res.status}: ${res.statusText}`);
  }

  return await res.json();
}

export async function resolveCover(title) {
  if (!title || typeof title !== 'string') return '';
  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const cacheKey = cleanTitle.toLowerCase();

  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey);
  }

  try {
    const searchUrl = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(cleanTitle)}&page[limit]=1`;
    const res = await fetch(searchUrl, {
      headers: { 'Accept': 'application/vnd.api+json' },
    });

    if (res.ok) {
      const json = await res.json();
      const first = json?.data?.[0]?.attributes?.posterImage;
      const coverUrl = first?.large || first?.medium || first?.original || '';
      if (coverUrl) {
        coverCache.set(cacheKey, coverUrl);
        return coverUrl;
      }
    }
  } catch (err) {
    // Graceful fallback on network error
  }

  return '';
}
