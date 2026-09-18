// ============================================================================
// DeiManga - Indonesian Manga REST API (Vercel Edge - Singapore)
// Providers: KomikIndo, BacaKomik, Komiku
// Features: Search, Detail, Chapters, Reader, Latest, Manhwa, Manhua, Genres
// ============================================================================

export const config = {
  runtime: "edge",
  regions: ["sin1"],
};

const memoryCache = new Map();

function getCached(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data, ttlSeconds) {
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Priority": "u=0, i",
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Upstream HTTP Error ${res.status}: ${res.statusText}`);
  }
  return await res.text();
}

function cleanTitle(raw) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/^(?:Komik|Manga|Manhwa|Manhua)\s+/i, "")
    .replace(/\s+bahasa\s+indonesia.*$/i, "")
    .replace(/\s+indo.*$/i, "")
    .replace(/\s+baca\s+manga.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSlug(urlOrSlug) {
  if (!urlOrSlug) return "";
  const clean = urlOrSlug.replace(/\/$/, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function parseNumber(text, slug) {
  const match =
    /Chapter\s*([\d.]+)/i.exec(text) ||
    /Ch\.\s*([\d.]+)/i.exec(text) ||
    /(\d+(?:\.\d+)?)/.exec(text);
  if (match) return parseFloat(match[1]);
  if (slug) {
    const slugMatch = /(?:chapter|ch)-?(\d+(?:\.\d+)?)/i.exec(slug);
    if (slugMatch) return parseFloat(slugMatch[1]);
  }
  return 0;
}

function sanitizeCover(url) {
  if (!url) return undefined;
  let clean = url.trim();
  if (clean.startsWith("//")) clean = `https:${clean}`;
  return clean.replace(/\?.*$/, "");
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    },
  });
}

// ----------------------------------------------------------------------------
// KOMIKINDO PROVIDER
// ----------------------------------------------------------------------------
const KomikIndo = {
  baseUrl: "https://komikindo.ch",

  parseListItems(html) {
    const items = [];
    const itemRegex =
      /<div class=["'](?:animepost|list-update_item)["'][^>]*>([\s\S]*?)(?=<div class=["'](?:animepost|list-update_item)["']|<footer|$)/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const hrefMatch = /href=["']([^"']+)["']/i.exec(block);
      const titleMatch =
        /title=["']([^"']+)["']/i.exec(block) ||
        /<h3[^>]*>[\s\S]*?rel=["']bookmark["'][^>]*>([^<]+)/i.exec(block) ||
        /<h4[^>]*>([^<]+)<\/h4>/i.exec(block);
      const imgMatch = /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i.exec(block);
      const typeMatch = /class=["']typeflag\s*([^"']+)["']/i.exec(block);
      const chMatch = /Ch\.\s*([\d.]+)/i.exec(block);

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
          latestChapter: chMatch ? `Chapter ${chMatch[1]}` : undefined,
        });
      }
    }
    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getLatest(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/komik-terbaru/` : `${this.baseUrl}/komik-terbaru/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhwa(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhwa/` : `${this.baseUrl}/manhwa/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhua(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhua/` : `${this.baseUrl}/manhua/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getByGenre(genre, page = 1) {
    const url = page === 1 ? `${this.baseUrl}/genres/${genre}/` : `${this.baseUrl}/genres/${genre}/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getDetail(slug) {
    const url = `${this.baseUrl}/komik/${slug}/`;
    const html = await fetchHtml(url);
    const titleMatch =
      /<h1 class="entry-title"[^>]*>([^<]+)<\/h1>/i.exec(html) ||
      /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
    const imgMatch =
      /<div class="thumb"[^>]*>\s*<img[^>]+src=["']([^"']+)["']/i.exec(html) ||
      /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    const descMatch =
      /<div class="entry-content entry-content-single"[^>]*>([\s\S]*?)<\/div>/i.exec(html);

    const genres = [];
    const genreRegex = /<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      genres.push(gMatch[1].trim());
    }

    return {
      id: slug,
      title: cleanTitle(titleMatch?.[1]) || slug,
      description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      coverArtUrl: sanitizeCover(imgMatch?.[1]),
      status: /Status:\s*(?:Completed|Tamat)/i.test(html) ? "completed" : "ongoing",
      genres,
    };
  },

  async getChapters(slug) {
    const url = `${this.baseUrl}/komik/${slug}/`;
    const html = await fetchHtml(url);
    const chapters = [];
    const liRegex = /<li>\s*<span class="lchx">[\s\S]*?<\/li>/gi;
    let match;

    while ((match = liRegex.exec(html)) !== null) {
      const liHtml = match[0];
      const aMatch =
        /<span class="lchx">\s*<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(liHtml);
      if (!aMatch) continue;

      const chSlug = parseSlug(aMatch[1]);
      const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const num = parseNumber(rawText, chSlug);

      chapters.push({
        id: chSlug,
        number: num,
        title: rawText || `Chapter ${num}`,
      });
    }

    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  },

  async getChapterPages(chapterSlug) {
    const url = `${this.baseUrl}/${chapterSlug}/`;
    const html = await fetchHtml(url);
    const containerMatch =
      /<div[^>]*id=["']chimg-auh["'][^>]*>([\s\S]*?)<\/div>/i.exec(html) ||
      /<div[^>]*id=["']Baca_Komik["'][^>]*>([\s\S]*?)<\/div>/i.exec(html) ||
      /<div[^>]*id=["']readerarea["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);

    const targetHtml = containerMatch ? containerMatch[1] : html;
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const pages = [];
    let match, pageNum = 1;

    while ((match = imgRegex.exec(targetHtml)) !== null) {
      const src = match[1]?.trim();
      if (!src || src.includes("logo") || src.endsWith(".gif")) continue;
      pages.push({
        pageNumber: pageNum++,
        imageUrl: sanitizeCover(src),
      });
    }

    return pages;
  },
};

// ----------------------------------------------------------------------------
// BACAKOMIK PROVIDER
// ----------------------------------------------------------------------------
const BacaKomik = {
  baseUrl: "https://bacakomik.my",

  parseListItems(html) {
    const items = [];
    const articleRegex =
      /<div class="animposx"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|<\/div>)/gi;
    let match;

    while ((match = articleRegex.exec(html)) !== null) {
      const block = match[1];
      const hrefMatch = /href=["']([^"']+)["']/i.exec(block);
      const titleMatch =
        /title=["']([^"']+)["']/i.exec(block) || /<h3[^>]*>([^<]+)<\/h3>/i.exec(block);
      const imgMatch = /src=["']([^"']+)["']/i.exec(block);
      const typeMatch = /class=["']typeflag\s*([^"']+)["']/i.exec(block);
      const chMatch = /Ch\.\s*([\d.]+)/i.exec(block);

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
          latestChapter: chMatch ? `Chapter ${chMatch[1]}` : undefined,
        });
      }
    }
    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getLatest(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/komik-terbaru/` : `${this.baseUrl}/komik-terbaru/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhwa(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhwa/` : `${this.baseUrl}/manhwa/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhua(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhua/` : `${this.baseUrl}/manhua/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getByGenre(genre, page = 1) {
    const url = page === 1 ? `${this.baseUrl}/genres/${genre}/` : `${this.baseUrl}/genres/${genre}/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getDetail(slug) {
    const url = `${this.baseUrl}/komik/${slug}/`;
    const html = await fetchHtml(url);
    const titleMatch =
      /<h1[^>]*class=["']entry-title["'][^>]*>([^<]+)<\/h1>/i.exec(html) ||
      /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
    const descMatch = /<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const imgMatch = /<div class="thumb"[^>]*>\s*<img[^>]+src=["']([^"']+)["']/i.exec(html);

    return {
      id: slug,
      title: cleanTitle(titleMatch?.[1]) || slug,
      description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      coverArtUrl: sanitizeCover(imgMatch?.[1]),
      status: /Status:\s*(?:Completed|Tamat)/i.test(html) ? "completed" : "ongoing",
    };
  },

  async getChapters(slug) {
    const url = `${this.baseUrl}/komik/${slug}/`;
    const html = await fetchHtml(url);
    const chapters = [];
    const chRegex = /<li[^>]*data-id=["']?[^"'>]*["']?[^>]*>([\s\S]*?)<\/li>/gi;
    let match;

    while ((match = chRegex.exec(html)) !== null) {
      const block = match[1];
      const aMatch = /<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!aMatch) continue;

      const chSlug = parseSlug(aMatch[1]);
      const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const num = parseNumber(rawText, chSlug);

      chapters.push({
        id: chSlug,
        number: num,
        title: rawText || `Chapter ${num}`,
      });
    }

    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  },

  async getChapterPages(chapterSlug) {
    const url = `${this.baseUrl}/chapter/${chapterSlug}/`;
    const html = await fetchHtml(url);
    const imgRegex = /<img[^>]*>/gi;
    const attrRegex = /(?:data-lazy-src|this\.src|\bsrc)=["']([^"']+)["']/gi;
    const pages = [];
    let match, pageNum = 1;

    while ((match = imgRegex.exec(html)) !== null) {
      const tag = match[0];
      let attrMatch;
      attrRegex.lastIndex = 0;
      while ((attrMatch = attrRegex.exec(tag)) !== null) {
        const src = attrMatch[1];
        if (
          src &&
          (src.includes(".jpg") || src.includes(".webp") || src.includes(".png")) &&
          !src.includes("logo") &&
          !src.includes("avatar")
        ) {
          pages.push({
            pageNumber: pageNum++,
            imageUrl: sanitizeCover(src),
          });
          break;
        }
      }
    }
    return pages;
  },
};

// ----------------------------------------------------------------------------
// KOMIKU PROVIDER
// ----------------------------------------------------------------------------
const Komiku = {
  baseUrl: "https://komiku.org",
  apiUrl: "https://api.komiku.org",

  parseListItems(html) {
    const items = [];
    const chunks = html.split(/<div class=["']bge["'][^>]*>/i).slice(1);

    for (const block of chunks) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(block);
      const titleMatch =
        /<h3[^>]*>([^<]+)<\/h3>/i.exec(block) || /title=["']([^"']+)["']/i.exec(block);
      const imgMatch = /src=["']([^"']+)["']/i.exec(block);
      const typeMatch = /class=["']t2\s*([^"']+)["']/i.exec(block);
      const chMatch = /Chapter\s*([\d.]+)/i.exec(block);

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
          latestChapter: chMatch ? `Chapter ${chMatch[1]}` : undefined,
        });
      }
    }
    return items;
  },

  async search(query) {
    let html = "";
    try {
      html = await fetchHtml(`${this.apiUrl}/?post_type=manga&s=${encodeURIComponent(query)}`);
    } catch {
      html = await fetchHtml(`${this.baseUrl}/?post_type=manga&s=${encodeURIComponent(query)}`);
    }
    return this.parseListItems(html);
  },

  async getLatest(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/komik-terbaru/` : `${this.baseUrl}/komik-terbaru/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhwa(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhwa/` : `${this.baseUrl}/manhwa/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getManhua(page = 1) {
    const url = page === 1 ? `${this.baseUrl}/manhua/` : `${this.baseUrl}/manhua/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getByGenre(genre, page = 1) {
    const url = page === 1 ? `${this.baseUrl}/genre/${genre}/` : `${this.baseUrl}/genre/${genre}/page/${page}/`;
    const html = await fetchHtml(url);
    return this.parseListItems(html);
  },

  async getDetail(slug) {
    const url = `${this.baseUrl}/manga/${slug}/`;
    const html = await fetchHtml(url);
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const descMatch = /<p class="desc"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    const imgMatch = /<img[^>]+class=["'][^"']*cover[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html);

    return {
      id: slug,
      title: cleanTitle(h1Match?.[1]) || slug,
      description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      coverArtUrl: sanitizeCover(imgMatch?.[1]),
      status: /Status:\s*(?:Completed|Tamat)/i.test(html) ? "completed" : "ongoing",
    };
  },

  async getChapters(slug) {
    const url = `${this.baseUrl}/manga/${slug}/`;
    const html = await fetchHtml(url);
    const chapters = [];
    const chapterRegex =
      /<td class="judulseries">[\s\S]*?<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/gi;
    let match;

    while ((match = chapterRegex.exec(html)) !== null) {
      const aMatch = match[0];
      const hrefMatch = /href=["']([^"']+)["']/i.exec(aMatch);
      if (!hrefMatch) continue;

      const chSlug = parseSlug(hrefMatch[1]);
      const rawText = aMatch.replace(/<[^>]+>/g, "").trim();
      const num = parseNumber(rawText, chSlug);

      chapters.push({
        id: chSlug,
        number: num,
        title: rawText || `Chapter ${num}`,
      });
    }

    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  },

  async getChapterPages(chapterSlug) {
    const url = `${this.baseUrl}/${chapterSlug}/`;
    const html = await fetchHtml(url);
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const pages = [];
    let match, pageNum = 1;

    while ((match = imgRegex.exec(html)) !== null) {
      let src = match[1]?.trim();
      if (!src || src.includes("logo") || src.includes("promosi") || src.endsWith(".gif")) continue;
      if (src.startsWith("/")) src = `${this.baseUrl}${src}`;
      pages.push({
        pageNumber: pageNum++,
        imageUrl: sanitizeCover(src),
      });
    }
    return pages;
  },
};

const GENRES_LIST = [
  { id: "action", name: "Action" },
  { id: "adventure", name: "Adventure" },
  { id: "comedy", name: "Comedy" },
  { id: "drama", name: "Drama" },
  { id: "fantasy", name: "Fantasy" },
  { id: "isekai", name: "Isekai" },
  { id: "martial-arts", name: "Martial Arts" },
  { id: "mystery", name: "Mystery" },
  { id: "romance", name: "Romance" },
  { id: "school-life", name: "School Life" },
  { id: "sci-fi", name: "Sci-Fi" },
  { id: "shounen", name: "Shounen" },
  { id: "slice-of-life", name: "Slice of Life" },
  { id: "supernatural", name: "Supernatural" },
  { id: "thriller", name: "Thriller" },
];

// ----------------------------------------------------------------------------
// Main Handler
// ----------------------------------------------------------------------------
export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname;
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  // Health / Root
  if (path === "/" || path === "/health") {
    return jsonResponse({
      name: "DeiManga Indonesian Manga API",
      platform: "Vercel Edge (Singapore)",
      status: "operational",
      uptime: "healthy",
      providers: ["komikindo", "bacakomik", "komiku"],
      endpoints: [
        "/api/:provider/search?q=:query",
        "/api/:provider/latest?page=:page",
        "/api/:provider/manhwa?page=:page",
        "/api/:provider/manhua?page=:page",
        "/api/:provider/genres",
        "/api/:provider/genres/:genre?page=:page",
        "/api/:provider/manga/:slug",
        "/api/:provider/chapters/:slug",
        "/api/:provider/chapter/:chapterSlug",
        "/:provider/* (Raw Proxy)",
      ],
      timestamp: new Date().toISOString(),
    });
  }

  const getProvider = (name) => {
    switch (name?.toLowerCase()) {
      case "komikindo": return KomikIndo;
      case "bacakomik": return BacaKomik;
      case "komiku": return Komiku;
      default: return null;
    }
  };

  // 1. Search -> /api/:provider/search?q=...
  const searchMatch = /^\/api\/([^\/]+)\/search$/i.exec(path);
  if (searchMatch) {
    const providerName = searchMatch[1];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const q = url.searchParams.get("q") || "";
    if (!q) return jsonResponse({ items: [], total: 0 });

    const cacheKey = `search:${providerName}:${q.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const items = await provider.search(q);
      const result = { status: "success", provider: providerName, total: items.length, items };
      setCached(cacheKey, result, 600);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 2. Latest Updates -> /api/:provider/latest?page=1
  const latestMatch = /^\/api\/([^\/]+)\/latest$/i.exec(path);
  if (latestMatch) {
    const providerName = latestMatch[1];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `latest:${providerName}:${page}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const items = await provider.getLatest(page);
      const result = { status: "success", provider: providerName, page, total: items.length, items };
      setCached(cacheKey, result, 300); // 5 mins cache
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 3. Manhwa List -> /api/:provider/manhwa?page=1
  const manhwaMatch = /^\/api\/([^\/]+)\/manhwa$/i.exec(path);
  if (manhwaMatch) {
    const providerName = manhwaMatch[1];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `manhwa:${providerName}:${page}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const items = await provider.getManhwa(page);
      const result = { status: "success", provider: providerName, page, total: items.length, items };
      setCached(cacheKey, result, 600);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 4. Manhua List -> /api/:provider/manhua?page=1
  const manhuaMatch = /^\/api\/([^\/]+)\/manhua$/i.exec(path);
  if (manhuaMatch) {
    const providerName = manhuaMatch[1];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `manhua:${providerName}:${page}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const items = await provider.getManhua(page);
      const result = { status: "success", provider: providerName, page, total: items.length, items };
      setCached(cacheKey, result, 600);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 5. Genres List -> /api/:provider/genres
  const genresListMatch = /^\/api\/([^\/]+)\/genres$/i.exec(path);
  if (genresListMatch) {
    return jsonResponse({ status: "success", total: GENRES_LIST.length, genres: GENRES_LIST });
  }

  // 6. Filter by Genre -> /api/:provider/genres/:genre?page=1
  const genreFilterMatch = /^\/api\/([^\/]+)\/genres\/([^\/]+)$/i.exec(path);
  if (genreFilterMatch) {
    const providerName = genreFilterMatch[1];
    const genre = genreFilterMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `genre:${providerName}:${genre}:${page}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const items = await provider.getByGenre(genre, page);
      const result = { status: "success", provider: providerName, genre, page, total: items.length, items };
      setCached(cacheKey, result, 600);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 7. Manga Detail -> /api/:provider/manga/:slug
  const mangaMatch = /^\/api\/([^\/]+)\/manga\/([^\/]+)$/i.exec(path);
  if (mangaMatch) {
    const providerName = mangaMatch[1];
    const slug = mangaMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `manga:${providerName}:${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const data = await provider.getDetail(slug);
      const result = { status: "success", provider: providerName, data };
      setCached(cacheKey, result, 1800);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 8. Chapters -> /api/:provider/chapters/:slug
  const chaptersMatch = /^\/api\/([^\/]+)\/chapters\/([^\/]+)$/i.exec(path);
  if (chaptersMatch) {
    const providerName = chaptersMatch[1];
    const slug = chaptersMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `chapters:${providerName}:${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const chapters = await provider.getChapters(slug);
      const result = { status: "success", provider: providerName, total: chapters.length, chapters };
      setCached(cacheKey, result, 900);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 9. Reader Pages -> /api/:provider/chapter/:chapterSlug
  const pageMatch = /^\/api\/([^\/]+)\/chapter\/([^\/]+)$/i.exec(path);
  if (pageMatch) {
    const providerName = pageMatch[1];
    const chapterSlug = pageMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return jsonResponse({ error: "Invalid provider" }, 400);

    const cacheKey = `pages:${providerName}:${chapterSlug}`;
    const cached = getCached(cacheKey);
    if (cached) return jsonResponse(cached);

    try {
      const pages = await provider.getChapterPages(chapterSlug);
      const result = {
        status: "success",
        provider: providerName,
        chapter: chapterSlug,
        pageCount: pages.length,
        pages,
      };
      setCached(cacheKey, result, 86400);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 502);
    }
  }

  // 10. Raw Proxy Fallback (Kompatibel dengan Render env)
  let targetOrigin = "";
  let cleanPath = path;

  if (path.startsWith("/komikindo")) {
    targetOrigin = "https://komikindo.ch";
    cleanPath = path.replace(/^\/komikindo/, "");
  } else if (path.startsWith("/bacakomik")) {
    targetOrigin = "https://bacakomik.my";
    cleanPath = path.replace(/^\/bacakomik/, "");
  } else if (path.startsWith("/komiku")) {
    targetOrigin = "https://komiku.org";
    cleanPath = path.replace(/^\/komiku/, "");
  }

  if (targetOrigin) {
    const targetUrl = `${targetOrigin}${cleanPath}${url.search}`;
    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: BROWSER_HEADERS,
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "text/html; charset=UTF-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(err.message, { status: 502 });
    }
  }

  return jsonResponse({ error: "Endpoint not found" }, 404);
}
