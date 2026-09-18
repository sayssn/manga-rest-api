// ============================================================================
// DeiManga - Indonesian Manga REST API Microservice (Vercel Serverless)
// Providers: KomikIndo, BacaKomik, Komiku
// ============================================================================

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

// ----------------------------------------------------------------------------
// Utilities & Helpers
// ----------------------------------------------------------------------------
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
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

// ----------------------------------------------------------------------------
// 1. KOMIKINDO PROVIDER PARSER
// ----------------------------------------------------------------------------
const KomikIndo = {
  baseUrl: "https://komikindo.ch",

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
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

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
        });
      }
    }
    return items;
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
// 2. BACAKOMIK PROVIDER PARSER
// ----------------------------------------------------------------------------
const BacaKomik = {
  baseUrl: "https://bacakomik.my",

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
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

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
        });
      }
    }
    return items;
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
// 3. KOMIKU PROVIDER PARSER
// ----------------------------------------------------------------------------
const Komiku = {
  baseUrl: "https://komiku.org",
  apiUrl: "https://api.komiku.org",

  async search(query) {
    let html = "";
    try {
      html = await fetchHtml(`${this.apiUrl}/?post_type=manga&s=${encodeURIComponent(query)}`);
    } catch {
      html = await fetchHtml(`${this.baseUrl}/?post_type=manga&s=${encodeURIComponent(query)}`);
    }

    const items = [];
    const chunks = html.split(/<div class=["']bge["'][^>]*>/i).slice(1);

    for (const block of chunks) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(block);
      const titleMatch =
        /<h3[^>]*>([^<]+)<\/h3>/i.exec(block) || /title=["']([^"']+)["']/i.exec(block);
      const imgMatch = /src=["']([^"']+)["']/i.exec(block);
      const typeMatch = /class=["']t2\s*([^"']+)["']/i.exec(block);

      if (hrefMatch && titleMatch) {
        items.push({
          id: parseSlug(hrefMatch[1]),
          title: cleanTitle(titleMatch[1]),
          coverArtUrl: sanitizeCover(imgMatch?.[1]),
          type: typeMatch ? typeMatch[1].toLowerCase() : "manga",
        });
      }
    }
    return items;
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

// ----------------------------------------------------------------------------
// Main Vercel Serverless Handler
// ----------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const path = url.pathname;

  // Root / Health check
  if (path === "/" || path === "/health") {
    return res.status(200).json({
      name: "DeiManga Indonesian Manga API",
      platform: "Vercel Serverless",
      status: "operational",
      uptime: "healthy",
      providers: ["komikindo", "bacakomik", "komiku"],
      timestamp: new Date().toISOString(),
      routes: [
        "/api/:provider/search?q=:query",
        "/api/:provider/manga/:slug",
        "/api/:provider/chapters/:slug",
        "/api/:provider/chapter/:chapterSlug",
        "/:provider/* (Raw HTML Proxy)",
      ],
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

  // 1. API: Search -> /api/:provider/search?q=naruto
  const searchMatch = /^\/api\/([^\/]+)\/search$/i.exec(path);
  if (searchMatch) {
    const providerName = searchMatch[1];
    const provider = getProvider(providerName);
    if (!provider) return res.status(400).json({ error: "Invalid provider" });

    const q = url.searchParams.get("q") || "";
    if (!q) return res.status(200).json({ items: [], total: 0 });

    const cacheKey = `search:${providerName}:${q.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    try {
      const items = await provider.search(q);
      const result = { status: "success", provider: providerName, total: items.length, items };
      setCached(cacheKey, result, 600); // 10 mins cache
      return res.status(200).json(result);
    } catch (err) {
      return res.status(502).json({ status: "error", message: err.message });
    }
  }

  // 2. API: Detail Manga -> /api/:provider/manga/:slug
  const mangaMatch = /^\/api\/([^\/]+)\/manga\/([^\/]+)$/i.exec(path);
  if (mangaMatch) {
    const providerName = mangaMatch[1];
    const slug = mangaMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return res.status(400).json({ error: "Invalid provider" });

    const cacheKey = `manga:${providerName}:${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    try {
      const data = await provider.getDetail(slug);
      const result = { status: "success", provider: providerName, data };
      setCached(cacheKey, result, 1800); // 30 mins cache
      return res.status(200).json(result);
    } catch (err) {
      return res.status(502).json({ status: "error", message: err.message });
    }
  }

  // 3. API: Chapter List -> /api/:provider/chapters/:slug
  const chaptersMatch = /^\/api\/([^\/]+)\/chapters\/([^\/]+)$/i.exec(path);
  if (chaptersMatch) {
    const providerName = chaptersMatch[1];
    const slug = chaptersMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return res.status(400).json({ error: "Invalid provider" });

    const cacheKey = `chapters:${providerName}:${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    try {
      const chapters = await provider.getChapters(slug);
      const result = { status: "success", provider: providerName, total: chapters.length, chapters };
      setCached(cacheKey, result, 900); // 15 mins cache
      return res.status(200).json(result);
    } catch (err) {
      return res.status(502).json({ status: "error", message: err.message });
    }
  }

  // 4. API: Chapter Reader Pages -> /api/:provider/chapter/:chapterSlug
  const pageMatch = /^\/api\/([^\/]+)\/chapter\/([^\/]+)$/i.exec(path);
  if (pageMatch) {
    const providerName = pageMatch[1];
    const chapterSlug = pageMatch[2];
    const provider = getProvider(providerName);
    if (!provider) return res.status(400).json({ error: "Invalid provider" });

    const cacheKey = `pages:${providerName}:${chapterSlug}`;
    const cached = getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    try {
      const pages = await provider.getChapterPages(chapterSlug);
      const result = {
        status: "success",
        provider: providerName,
        chapter: chapterSlug,
        pageCount: pages.length,
        pages,
      };
      setCached(cacheKey, result, 86400); // 24 hours cache
      return res.status(200).json(result);
    } catch (err) {
      return res.status(502).json({ status: "error", message: err.message });
    }
  }

  // 5. BACKWARD-COMPATIBLE RAW PROXY (Fallback untuk config Render lama)
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
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/html; charset=UTF-8");
      return res.status(upstream.status).send(body);
    } catch (err) {
      return res.status(502).send(err.message);
    }
  }

  return res.status(404).json({ error: "Endpoint not found" });
}
