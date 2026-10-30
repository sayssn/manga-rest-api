// Direct SakuraNovel Provider Engine
// Connects directly to SakuraNovel WordPress REST API without third-party proxies

import {
  decodeHtmlEntities,
  cleanParagraphs,
  parseChapterMeta,
  fetchSakura,
  resolveCover,
} from './sakuranovel-core.js';

// Cache for series details
const seriesDetailCache = new Map();

function extractSeriesTitleFromPost(postTitle) {
  if (!postTitle) return '';
  const decoded = decodeHtmlEntities(postTitle.replace(/<[^>]+>/g, ''));
  // Strip "Chapter ...", "Bab ...", "Bahasa Indonesia", etc.
  const cleaned = decoded
    .replace(/(?:Chapter|Bab)\s+\d+.*$/i, '')
    .replace(/\s*-\s*$/, '')
    .trim();
  return cleaned || decoded;
}

function extractSeriesSlugFromPost(post) {
  if (Array.isArray(post.class_list)) {
    for (const cls of post.class_list) {
      if (cls.startsWith('seri-')) {
        return cls.replace(/^seri-/, '');
      }
    }
  }
  return post.slug ? post.slug.replace(/-chapter-.*$/i, '') : '';
}

export const SakuraNovel = {
  async getPopular(page = 1) {
    try {
      const seriesList = await fetchSakura('/seri', {
        per_page: 20,
        page,
        orderby: 'count',
        order: 'desc',
      });

      if (!Array.isArray(seriesList)) return [];

      const items = await Promise.all(
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
            latest_chapter: {
              title: `Total ${seri.count || 0} Bab`,
            },
            genres: ['Light Novel'],
          };
        })
      );

      return items;
    } catch (err) {
      console.error('[SakuraNovel] getPopular error:', err);
      return [];
    }
  },

  async getLatest(page = 1) {
    try {
      const posts = await fetchSakura('/posts', {
        per_page: 20,
        page,
      });

      if (!Array.isArray(posts)) return [];

      // Group posts by series to avoid duplicate series cards
      const seenSeries = new Set();
      const uniquePosts = [];

      for (const post of posts) {
        const seriesId = post.seri?.[0] || post.id;
        if (!seenSeries.has(seriesId)) {
          seenSeries.add(seriesId);
          uniquePosts.push(post);
        }
      }

      const items = await Promise.all(
        uniquePosts.map(async (post) => {
          const seriesId = post.seri?.[0] || post.id;
          const seriesTitle = extractSeriesTitleFromPost(post.title?.rendered);
          const seriesSlug = extractSeriesSlugFromPost(post);
          const cover = await resolveCover(seriesTitle);
          const chapterMeta = parseChapterMeta(post);

          return {
            id: seriesId,
            title: seriesTitle,
            slug: seriesSlug,
            cover,
            status: 'Ongoing',
            type: 'Light Novel',
            source: 'sakuranovel',
            latest_chapter: {
              id: chapterMeta.id,
              title: chapterMeta.chapter_number,
              date: chapterMeta.date,
            },
            genres: ['Light Novel'],
          };
        })
      );

      return items;
    } catch (err) {
      console.error('[SakuraNovel] getLatest error:', err);
      return [];
    }
  },

  async getTrending(period = 'mingguan', limit = 10) {
    const popular = await this.getPopular(1);
    return popular.slice(0, limit);
  },

  async search(query, genre, page = 1) {
    try {
      const cleanQ = (query || '').trim();
      const cleanG = (genre || '').trim();

      if (!cleanQ && !cleanG) return [];

      let seriesList = [];
      if (cleanQ) {
        seriesList = await fetchSakura('/seri', {
          search: cleanQ,
          per_page: 20,
          page,
        });
      } else {
        seriesList = await fetchSakura('/seri', {
          per_page: 20,
          page,
          orderby: 'count',
          order: 'desc',
        });
      }

      if (!Array.isArray(seriesList)) return [];

      const items = await Promise.all(
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
            latest_chapter: {
              title: `Total ${seri.count || 0} Bab`,
            },
            genres: cleanG ? [cleanG, 'Light Novel'] : ['Light Novel'],
          };
        })
      );

      return items;
    } catch (err) {
      console.error('[SakuraNovel] search error:', err);
      return [];
    }
  },

  async getDetail(idOrSlug) {
    if (!idOrSlug) throw new Error('Novel ID is required');

    const cacheKey = String(idOrSlug).toLowerCase();
    if (seriesDetailCache.has(cacheKey)) {
      return seriesDetailCache.get(cacheKey);
    }

    let seri = null;
    const isNumeric = /^\d+$/.test(String(idOrSlug));

    if (isNumeric) {
      seri = await fetchSakura(`/seri/${idOrSlug}`);
    } else {
      const list = await fetchSakura('/seri', { slug: idOrSlug });
      if (Array.isArray(list) && list.length > 0) {
        seri = list[0];
      }
    }

    if (!seri || !seri.id) {
      throw new Error(`Novel series not found: ${idOrSlug}`);
    }

    const seriesId = seri.id;
    const seriesTitle = decodeHtmlEntities(seri.name);
    const seriesSlug = seri.slug;
    const totalChapters = seri.count || 0;

    // Fetch chapters up to 2 pages (up to 200 chapters)
    const chapterFetchers = [
      fetchSakura('/posts', {
        seri: seriesId,
        per_page: 100,
        page: 1,
        _fields: 'id,title,date,slug',
      }),
    ];

    if (totalChapters > 100) {
      chapterFetchers.push(
        fetchSakura('/posts', {
          seri: seriesId,
          per_page: 100,
          page: 2,
          _fields: 'id,title,date,slug',
        }).catch(() => [])
      );
    }

    if (totalChapters > 200) {
      chapterFetchers.push(
        fetchSakura('/posts', {
          seri: seriesId,
          per_page: 100,
          page: 3,
          _fields: 'id,title,date,slug',
        }).catch(() => [])
      );
    }

    const [cover, chapterPages, firstChapterExcerpt] = await Promise.all([
      resolveCover(seriesTitle),
      Promise.all(chapterFetchers),
      fetchSakura('/posts', {
        seri: seriesId,
        per_page: 1,
        order: 'asc',
        _fields: 'id,excerpt',
      }).catch(() => []),
    ]);

    const allPosts = chapterPages.flat().filter(Boolean);

    // Map and sort chapters ascending
    const chapters = allPosts.map(parseChapterMeta);
    chapters.sort((a, b) => {
      const numA = parseFloat(a.chapter_number.replace(/[^\d.]/g, '')) || 0;
      const numB = parseFloat(b.chapter_number.replace(/[^\d.]/g, '')) || 0;
      return numA - numB;
    });

    // Synopsis from first chapter excerpt or default
    let synopsis = '';
    if (Array.isArray(firstChapterExcerpt) && firstChapterExcerpt[0]?.excerpt?.rendered) {
      synopsis = decodeHtmlEntities(
        firstChapterExcerpt[0].excerpt.rendered.replace(/<[^>]+>/g, '').trim()
      );
    }

    const detail = {
      id: seriesId,
      title: seriesTitle,
      slug: seriesSlug,
      cover,
      author: 'Author',
      synopsis: synopsis || `Sinopsis untuk novel ${seriesTitle}.`,
      genres: ['Light Novel', 'Fantasy'],
      status: 'Ongoing',
      type: 'Light Novel',
      source: 'sakuranovel',
      total_chapters: totalChapters || chapters.length,
      chapters,
    };

    seriesDetailCache.set(cacheKey, detail);
    return detail;
  },

  async getChapter(chapterId) {
    if (!chapterId) throw new Error('Chapter ID is required');

    const post = await fetchSakura(`/posts/${chapterId}`);
    if (!post || !post.id) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }

    const meta = parseChapterMeta(post);
    const blocks = cleanParagraphs(post.content?.rendered || '');
    const seriesTitle = extractSeriesTitleFromPost(post.title?.rendered);

    return {
      id: post.id,
      series_id: post.seri?.[0] || null,
      novel_title: seriesTitle,
      chapter_number: meta.chapter_number,
      chapter_title: meta.title,
      date: post.date,
      blocks,
    };
  },
};
