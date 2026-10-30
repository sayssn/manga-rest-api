// SakuraNovel Hybrid Provider Engine
// Primary: High-integrity pre-indexed upstream (konkon.id) with full genres and all 1500+ chapters
// Secondary Fallback: Direct SakuraNovel WP REST API if primary encounters issues

import {
  decodeHtmlEntities,
  cleanParagraphs,
  parseChapterMeta,
  fetchSakura,
  resolveCover,
} from './sakuranovel-core.js';

function sanitizeNovelMetadata(item) {
  if (!item) return item;
  const title = (item.title || item.name || '').toLowerCase();
  // Fix known upstream MangaUpdates misidentification for Against the Gods (ATG)
  if (title === 'atg - raw' || title === 'atg' || title.includes('against the gods')) {
    item.cover = 'https://media.kitsu.app/manga/poster_images/54416/large.jpg';
    item.genres = ['Action', 'Adventure', 'Fantasy', 'Harem', 'Martial Arts', 'Xianxia'];
  }

  // Sanitize chapters list to ensure clean chapter numbers and titles
  if (Array.isArray(item.chapters) && item.chapters.length > 0) {
    const novelTitle = item.title || item.name || '';
    const novelTitleRegex = novelTitle
      ? new RegExp('^' + novelTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i')
      : null;

    item.chapters = item.chapters.map((ch, idx) => {
      const rawNum = String(ch.chapter_number || '').trim();
      const rawTitle = String(ch.title || '').trim();
      const rawSlug = String(ch.slug || '').trim();

      let num = '';
      // 1. Extract from slug (e.g. -ch154-, -ch0-)
      const slugMatch = rawSlug.match(/[-_]ch(?:apter)?[-_]?(\d+(?:\.\d+)?)/i);
      if (slugMatch) num = slugMatch[1];

      // 2. Extract from title / chapter_number
      if (!num) {
        const match = (rawTitle + ' ' + rawNum).match(/(?:Chapter|Bab|Ch\.?)\s*(\d+(?:\.\d+)?)/i);
        if (match) num = match[1];
      }

      // 3. Fallback: only trust existing number if < 5000 (ignore WP post IDs like 368351)
      if (!num) {
        const numOnly = rawNum.replace(/[^0-9.]/g, '');
        if (numOnly && Number(numOnly) < 5000) num = numOnly;
      }

      // 4. Fallback special types
      if (!num) {
        if (/side\s*story/i.test(rawTitle) || /side\s*story/i.test(rawSlug)) num = 'Side Story';
        else if (/prologue/i.test(rawTitle) || /prologue/i.test(rawSlug)) num = 'Prologue';
        else if (/epilogue/i.test(rawTitle) || /epilogue/i.test(rawSlug)) num = 'Epilogue';
        else num = String(idx + 1);
      }

      // Clean title text
      let cleanTitle = rawTitle;
      if (novelTitleRegex) {
        cleanTitle = cleanTitle.replace(novelTitleRegex, '');
      }
      cleanTitle = cleanTitle
        .replace(/^(?:Chapter|Bab|Ch\.?)\s*\d+[\s):\-—–=]*/i, '')
        .replace(/\s*Bahasa Indonesia\s*$/i, '')
        .trim();

      const isSpecial = num.startsWith('Side') || num.startsWith('Pro') || num.startsWith('Epi');
      const formattedNum = isSpecial ? num : `Chapter ${num}`;

      if (!cleanTitle || cleanTitle.toLowerCase() === 'chapter 1' || cleanTitle.toLowerCase() === rawNum.toLowerCase()) {
        cleanTitle = formattedNum;
      }

      return {
        ...ch,
        chapter_number: formattedNum,
        title: cleanTitle,
      };
    });
  }

  return item;
}

const KONKON_BASE = 'https://api.konkon.id';
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const SakuraNovel = {
  async getPopular(page = 1) {
    try {
      const url = `${KONKON_BASE}/api/novel/sakuranovel/popular?page=${page}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 5000);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map(sanitizeNovelMetadata);
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary popular failed, using direct fallback:', err.message);
    }

    // Direct fallback
    try {
      const seriesList = await fetchSakura('/seri', {
        per_page: 20,
        page,
        orderby: 'count',
        order: 'desc',
      });
      if (!Array.isArray(seriesList)) return [];

      return await Promise.all(
        seriesList.map(async (seri) => {
          const title = decodeHtmlEntities(seri.name);
          const cover = await resolveCover(title);
          return {
            id: seri.id,
            title,
            slug: seri.slug,
            cover,
            status: 'Ongoing',
            type: 'Light Novel',
            source: 'sakuranovel',
            total_chapters: seri.count || 0,
            latest_chapter: { title: `Total ${seri.count || 0} Bab` },
            genres: ['Light Novel', 'Fantasy'],
          };
        })
      );
    } catch (fallbackErr) {
      console.error('[SakuraNovel] Fallback getPopular error:', fallbackErr);
      return [];
    }
  },

  async getLatest(page = 1) {
    try {
      const url = `${KONKON_BASE}/api/novel/sakuranovel/latest?page=${page}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 6000);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map(sanitizeNovelMetadata);
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary latest failed, using direct fallback:', err.message);
    }

    // Direct fallback
    try {
      const posts = await fetchSakura('/posts', { per_page: 40, page });
      if (!Array.isArray(posts)) return [];

      const seenSeries = new Set();
      const uniquePosts = [];
      for (const post of posts) {
        const seriesId = post.seri?.[0] || post.id;
        if (!seenSeries.has(seriesId)) {
          seenSeries.add(seriesId);
          uniquePosts.push(post);
        }
      }

      return await Promise.all(
        uniquePosts.slice(0, 20).map(async (post) => {
          const seriesId = post.seri?.[0] || post.id;
          const meta = parseChapterMeta(post);
          const cover = await resolveCover(post.title?.rendered);
          return {
            id: seriesId,
            title: decodeHtmlEntities(post.title?.rendered || ''),
            slug: post.slug,
            cover,
            status: 'Ongoing',
            type: 'Light Novel',
            source: 'sakuranovel',
            latest_chapter: { id: meta.id, title: meta.chapter_number, date: meta.date },
            genres: ['Light Novel'],
          };
        })
      );
    } catch (fallbackErr) {
      console.error('[SakuraNovel] Fallback getLatest error:', fallbackErr);
      return [];
    }
  },

  async getTrending(period = 'mingguan', limit = 10) {
    try {
      const url = `${KONKON_BASE}/api/novel/trending?period=${encodeURIComponent(period)}&limit=${limit}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 4000);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map(sanitizeNovelMetadata);
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary trending failed, using popular slice');
    }

    const popular = await this.getPopular(1);
    return popular.slice(0, limit);
  },

  async search(query, genre, page = 1) {
    const cleanQ = (query || '').trim();
    const cleanG = (genre || '').trim();
    if (!cleanQ && !cleanG) return [];

    try {
      let url = `${KONKON_BASE}/api/novel/sakuranovel/search?page=${page}`;
      if (cleanG) url += `&genre=${encodeURIComponent(cleanG)}`;
      if (cleanQ) url += `&q=${encodeURIComponent(cleanQ)}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 5000);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map(sanitizeNovelMetadata);
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary search failed, using direct search');
    }

    // Direct fallback search
    try {
      const list = await fetchSakura('/seri', {
        search: cleanQ,
        per_page: 20,
        page,
      });
      if (!Array.isArray(list)) return [];

      return await Promise.all(
        list.map(async (seri) => {
          const title = decodeHtmlEntities(seri.name);
          const cover = await resolveCover(title);
          return {
            id: seri.id,
            title,
            slug: seri.slug,
            cover,
            status: 'Ongoing',
            type: 'Light Novel',
            source: 'sakuranovel',
            total_chapters: seri.count || 0,
            latest_chapter: { title: `Total ${seri.count || 0} Bab` },
            genres: cleanG ? [cleanG, 'Light Novel'] : ['Light Novel', 'Fantasy'],
          };
        })
      );
    } catch (fallbackErr) {
      console.error('[SakuraNovel] Fallback search error:', fallbackErr);
      return [];
    }
  },

  async getDetail(id) {
    if (!id) throw new Error('Novel ID is required');

    // 1. Try primary upstream (returns all 1,500 chapters and full genre taxonomy)
    try {
      const url = `${KONKON_BASE}/api/novel/sakuranovel/detail?id=${encodeURIComponent(id)}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 6000);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.id) {
          return sanitizeNovelMetadata(json.data);
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary getDetail failed, using direct fallback:', err.message);
    }

    // 2. Direct SakuraNovel WP REST API fallback
    let seri = null;
    const isNumeric = /^\d+$/.test(String(id));

    if (isNumeric) {
      seri = await fetchSakura(`/seri/${id}`);
    } else {
      const list = await fetchSakura('/seri', { slug: id });
      if (Array.isArray(list) && list.length > 0) seri = list[0];
    }

    if (!seri || !seri.id) {
      throw new Error(`Novel not found: ${id}`);
    }

    const seriesId = seri.id;
    const seriesTitle = decodeHtmlEntities(seri.name);
    const seriesSlug = seri.slug;
    const totalChapters = seri.count || 0;

    const [cover, posts] = await Promise.all([
      resolveCover(seriesTitle),
      fetchSakura('/posts', {
        seri: seriesId,
        per_page: 100,
        page: 1,
        _fields: 'id,title,date,slug',
      }).catch(() => []),
    ]);

    const chapters = (Array.isArray(posts) ? posts : []).map((p, idx) => parseChapterMeta(p, idx));

    return sanitizeNovelMetadata({
      id: seriesId,
      title: seriesTitle,
      slug: seriesSlug,
      cover,
      author: 'Author',
      synopsis: `Sinopsis untuk novel ${seriesTitle}.`,
      genres: ['Light Novel', 'Fantasy', 'Action'],
      status: 'Ongoing',
      type: 'Light Novel',
      source: 'sakuranovel',
      total_chapters: totalChapters || chapters.length,
      chapters,
    });
  },

  async getChapter(id) {
    if (!id) throw new Error('Chapter ID is required');

    // 1. Try primary upstream
    try {
      const url = `${KONKON_BASE}/api/novel/sakuranovel/chapter?id=${encodeURIComponent(id)}`;
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 6000);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data.blocks) && json.data.blocks.length > 0) {
          return json.data;
        }
      }
    } catch (err) {
      console.warn('[SakuraNovel] Primary getChapter failed, using direct fallback');
    }

    // 2. Direct fallback
    const post = await fetchSakura(`/posts/${id}`);
    if (!post || !post.id) {
      throw new Error(`Chapter not found: ${id}`);
    }

    const meta = parseChapterMeta(post);
    const blocks = cleanParagraphs(post.content?.rendered || '');

    return {
      id: post.id,
      series_id: post.seri?.[0] || null,
      novel_title: decodeHtmlEntities(post.title?.rendered || ''),
      chapter_number: meta.chapter_number,
      chapter_title: meta.title,
      date: post.date,
      blocks,
    };
  },
};
