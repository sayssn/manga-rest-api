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

async function fetchHtml(url, customHeaders) {
  const res = await fetch(url, {
    method: "GET",
    headers: customHeaders || BROWSER_HEADERS,
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

const ID_MONTHS = {
  januari: 0, jan: 0,
  februari: 1, feb: 1,
  maret: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, jun: 5,
  juli: 6, jul: 6,
  agustus: 7, ags: 7, agu: 7, aug: 7,
  september: 8, sep: 8,
  oktober: 9, okt: 9, oct: 9,
  november: 10, nov: 10,
  desember: 11, des: 11, dec: 11,
};

function parseDateToIso(rawDate) {
  if (!rawDate) return undefined;
  const clean = String(rawDate)
    .replace(/<[^>]+>/g, "")
    .replace(/^(?:dirilis|updated|rilis|release|published|date)\s*[:\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;

  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const lower = clean.toLowerCase();
  const relMatch = /(\d+)\s*(detik|menit|jam|hari|minggu|bulan|tahun|sec|min|hour|day|week|month|year)s?(?:\s+yang)?(?:\s+lalu|\s+ago)?/i.exec(lower);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    if (Number.isFinite(amount)) {
      const now = new Date();
      const unit = relMatch[2].toLowerCase();
      if (unit.startsWith("minggu") || unit.startsWith("week")) now.setDate(now.getDate() - amount * 7);
      else if (unit.startsWith("detik") || unit.startsWith("sec")) now.setSeconds(now.getSeconds() - amount);
      else if (unit.startsWith("menit") || unit.startsWith("min")) now.setMinutes(now.getMinutes() - amount);
      else if (unit.startsWith("jam") || unit.startsWith("hour")) now.setHours(now.getHours() - amount);
      else if (unit.startsWith("hari") || unit.startsWith("day")) now.setDate(now.getDate() - amount);
      else if (unit.startsWith("bulan") || unit.startsWith("month")) now.setMonth(now.getMonth() - amount);
      else if (unit.startsWith("tahun") || unit.startsWith("year")) now.setFullYear(now.getFullYear() - amount);
      return now.toISOString();
    }
  }

  const slashMatch = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(clean);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  const dayMonthYearMatch = /^(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-]+(\d{4})$/.exec(clean);
  if (dayMonthYearMatch) {
    const day = parseInt(dayMonthYearMatch[1], 10);
    const mStr = dayMonthYearMatch[2].toLowerCase();
    const year = parseInt(dayMonthYearMatch[3], 10);
    const month = ID_MONTHS[mStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  return undefined;
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

      const dateMatch = /class=["'](?:dt|date)["'][^>]*>([\s\S]*?)<\/span>/i.exec(liHtml);
      const publishedAt = parseDateToIso(dateMatch?.[1]);

      chapters.push({
        id: chSlug,
        number: num,
        title: rawText || `Chapter ${num}`,
        ...(publishedAt ? { publishedAt } : {}),
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
    const chRegex = /<li[^>]*>\s*(?:<span[^>]*>\s*)?<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>([\s\S]{0,300}?)(?:<\/li>|<li|$)/gi;
    let match;

    while ((match = chRegex.exec(html)) !== null) {
      const aUrl = match[1];
      const chSlug = parseSlug(aUrl);
      const rawText = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const num = parseNumber(rawText, chSlug);
      if (!num && !/chapter\s*0/i.test(rawText) && !/ch\.\s*0/i.test(rawText)) continue;

      const rest = match[3] || "";
      const dateMatch = /class=["']dt["'][^>]*>([\s\S]{0,120}?)<\/span>/i.exec(rest);
      const publishedAt = parseDateToIso(dateMatch?.[1]);

      const cleanedTitle = rawText.replace(/^Chapter\s+(?:Baru|Awal)\s+/i, "").trim() || `Chapter ${num}`;

      chapters.push({
        id: chSlug,
        number: num,
        title: cleanedTitle,
        ...(publishedAt ? { publishedAt } : {}),
      });
    }

    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  },

  async getChapterPages(chapterSlug) {
    const cleanSlug = chapterSlug.replace(/^\/?chapter\//, "").replace(/\/$/, "");
    const url = `${this.baseUrl}/${cleanSlug}/`;
    const html = await fetchHtml(url);

    let targetHtml = "";
    const startIdx = html.search(/id=["'](?:anjay_ini_id_kh|chimg-auh|readerarea|chcontent)["']|class=["'][^"']*(?:oi_ada_class_skrng|reading-content|ts_reader)["']/i);
    if (startIdx !== -1) {
      const endIdx = html.indexOf('<div class="nextprev"', startIdx) !== -1
        ? html.indexOf('<div class="nextprev"', startIdx)
        : html.indexOf('class="chapter-nav"', startIdx) !== -1
        ? html.indexOf('class="chapter-nav"', startIdx)
        : html.indexOf('id="comments"', startIdx) !== -1
        ? html.indexOf('id="comments"', startIdx)
        : startIdx + 80000;
      targetHtml = html.slice(startIdx, endIdx);
    } else {
      const containerMatch =
        /<div[^>]*id=["'](?:anjay_ini_id_kh|chimg-auh|readerarea|chcontent)["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
      targetHtml = containerMatch ? containerMatch[1] : html;
    }

    const imgRegex = /<img[^>]*>/gi;
    const attrRegex = /(?:data-lazy-src|this\.src|\bsrc)=["']([^"']+)["']/gi;
    const pages = [];
    const seenUrls = new Set();
    let match, pageNum = 1;

    while ((match = imgRegex.exec(targetHtml)) !== null) {
      const tag = match[0];
      let attrMatch;
      attrRegex.lastIndex = 0;
      const candidates = [];
      while ((attrMatch = attrRegex.exec(tag)) !== null) {
        candidates.push(attrMatch[1]);
      }
      const src = candidates.find(
        (s) =>
          s &&
          !s.startsWith("data:") &&
          !/resize=/i.test(s) &&
          !s.includes("Ikon-HD-Bacakomik") &&
          !s.includes("logo") &&
          !s.includes("banner") &&
          !s.includes("avatar") &&
          !s.includes("saweria") &&
          !s.includes("trakteer") &&
          !s.includes("sociabuzz") &&
          (s.includes(".jpg") || s.includes(".jpeg") || s.includes(".webp") || s.includes(".png") || s.includes("/uploads/") || s.includes("/wp-content/"))
      );
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        pages.push({
          pageNumber: pageNum++,
          imageUrl: sanitizeCover(src),
        });
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

      const tglMatch = /<td class="tgl">([\s\S]*?)<\/td>/i.exec(match[0]);
      const publishedAt = parseDateToIso(tglMatch?.[1]);

      chapters.push({
        id: chSlug,
        number: num,
        title: rawText || `Chapter ${num}`,
        ...(publishedAt ? { publishedAt } : {}),
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
// ANIME PROVIDERS (Samehadaku, Otakudesu, AnimeIndo)
// ----------------------------------------------------------------------------
function cleanAnimeTitle(raw) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/^Nonton\s+Anime\s+/i, "")
    .replace(/^Nonton\s+/i, "")
    .replace(/\s*\(Episode\s*[\d\s–-]+.*?\)/i, "")
    .replace(/\s*Episode\s*\d+.*$/i, "")
    .replace(/\s*Subtitle\s*Indonesia.*$/i, "")
    .replace(/\s*Sub\s*Indo.*$/i, "")
    .replace(/\s*\[BATCH\]/i, "")
    .replace(/\s*\[END\]/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEpisodeNumber(text, url) {
  const epMatch =
    /(?:Episode|Ep\.|Eps\.|Ep)\s*([0-9.]+)/i.exec(text || "") ||
    /-episode-([0-9.]+)/i.exec(url || "") ||
    /(\d+(?:\.\d+)?)/.exec(text || "");
  if (epMatch) return parseFloat(epMatch[1]);
  return undefined;
}

// 1. Samehadaku Provider
const SamehadakuAnime = {
  baseUrl: "https://v2.samehadaku.how",

  async getLatest(page = 1) {
    if (page === 1) {
      try {
        const text = await fetchHtml(`${this.baseUrl}/wp-json/apk/latest`);
        const jsonList = JSON.parse(text);
        if (Array.isArray(jsonList) && jsonList.length > 0) {
          return jsonList.map((item) => ({
            sourceId: item.url ? parseSlug(item.url).replace(/-episode-\d+.*$/i, '') : String(item.id),
            title: cleanAnimeTitle(item.series_title || item.title),
            coverImage: sanitizeCover(item.thumb),
            latestEpisode: item.episode ? `Episode ${item.episode}` : undefined,
            type: "TV",
          }));
        }
      } catch {}
    }

    const url = page > 1 ? `${this.baseUrl}/page/${page}/` : `${this.baseUrl}/`;
    const html = await fetchHtml(url);
    const items = [];
    const itemRegex = /<article class=['"](?:animepost|bs)['"][^>]*>([\s\S]*?)<\/article>/gi;
    let match;
    const seen = new Set();

    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const hrefMatch = /href=['"]([^'"]+)['"]/i.exec(block);
      const titleMatch = /<h2[^>]*>([^<]+)<\/h2>/i.exec(block) || /title=['"]([^'"]+)['"]/i.exec(block);
      const imgMatch = /<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(block);
      const epMatch = /<span class=['"]epx['"][^>]*>([^<]+)<\/span>/i.exec(block);

      if (hrefMatch && titleMatch) {
        const sId = parseSlug(hrefMatch[1]).replace(/-episode-\d+.*$/i, '');
        if (!seen.has(sId)) {
          seen.add(sId);
          items.push({
            sourceId: sId,
            title: cleanAnimeTitle(titleMatch[1]),
            coverImage: sanitizeCover(imgMatch?.[1]),
            latestEpisode: epMatch ? epMatch[1].trim() : undefined,
            type: "TV",
          });
        }
      }
    }
    return items;
  },

  async search(query, page = 1) {
    if (page === 1) {
      try {
        const text = await fetchHtml(
          `${this.baseUrl}/wp-json/wp/v2/anime?search=${encodeURIComponent(query)}&_embed=1`
        );
        const jsonList = JSON.parse(text);
        if (Array.isArray(jsonList) && jsonList.length > 0) {
          return jsonList.map((item) => ({
            sourceId: item.slug || String(item.id),
            title: cleanAnimeTitle(item.title?.rendered || ""),
            coverImage: sanitizeCover(item._embedded?.["wp:featuredmedia"]?.[0]?.source_url),
            type: "TV",
          }));
        }
      } catch {}
    }

    const searchUrl = page > 1
      ? `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`
      : `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(searchUrl);
    const items = [];
    const itemRegex = /<article class=['"](?:animepost|bs)['"][^>]*>([\s\S]*?)<\/article>/gi;
    let match;
    const seen = new Set();

    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const hrefMatch = /href=['"]([^'"]+)['"]/i.exec(block);
      const titleMatch = /<h2[^>]*>([^<]+)<\/h2>/i.exec(block) || /title=['"]([^'"]+)['"]/i.exec(block);
      const imgMatch = /<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(block);

      if (hrefMatch && titleMatch && !hrefMatch[1].includes("/batch/")) {
        const sId = parseSlug(hrefMatch[1]);
        if (!seen.has(sId)) {
          seen.add(sId);
          items.push({
            sourceId: sId,
            title: cleanAnimeTitle(titleMatch[1]),
            coverImage: sanitizeCover(imgMatch?.[1]),
            type: "TV",
          });
        }
      }
    }
    return items;
  },

  async getDetail(slug) {
    const cleanSlug = slug.replace(/-episode-\d+.*$/i, "");
    const url = cleanSlug.startsWith("http") ? cleanSlug : `${this.baseUrl}/anime/${cleanSlug}/`;
    const html = await fetchHtml(url);

    const titleMatch =
      /<h1[^>]*itemprop=['"]headline['"][^>]*>([^<]+)<\/h1>/i.exec(html) ||
      /<h1 class=['"]entry-title['"][^>]*>([^<]+)<\/h1>/i.exec(html) ||
      /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);

    const imgMatch =
      /<img[^>]+class=['"][^'"]*object-cover[^'"]*['"][^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html) ||
      /<div class=['"]content-thumb['"][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html) ||
      /<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html);

    const synopsisMatch =
      /<p class=['"]leading-relaxed['"][^>]*>([\s\S]*?)<\/p>/i.exec(html) ||
      /<div class=['"]entry-content['"][^>]*>([\s\S]*?)<\/div>/i.exec(html);

    const ratingMatch = /Score\s*:\s*([0-9.]+)|Rating\s*:\s*([0-9.]+)/i.exec(html);
    const yearMatch = /\b(19\d\d|20\d\d)\b/.exec(html);

    // Genres - Scope extraction to details before sidebar/aside/footer
    const genres = [];
    const mainSection = html.split(/<aside|<div[^>]+id=['"]sidebar|<div[^>]+class=['"][^'"]*sidebar|<footer/i)[0] || html;
    const genreBlockMatch =
      /<div class=['"]genre-info['"][^>]*>([\s\S]*?)<\/div>/i.exec(mainSection) ||
      /<div class=['"]infox['"][^>]*>([\s\S]*?)<\/div>/i.exec(mainSection) ||
      /<div class=['"]entry-content['"][^>]*>([\s\S]*?)<\/div>/i.exec(mainSection);
    const genreSearchArea = genreBlockMatch ? genreBlockMatch[1] : mainSection;
    const genreRegex = /<a[^>]+href=['"][^'"]*\/genre\/[^'"]+['"][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(genreSearchArea)) !== null) {
      const g = gMatch[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }

    // Episodes
    const episodes = [];
    const seenEpUrls = new Set();

    // 1. Structured div.flex-grow blocks with date span
    const blockRegex = /<div class=['"][^'"]*flex-grow[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi;
    let bMatch;
    while ((bMatch = blockRegex.exec(html)) !== null) {
      const block = bMatch[1];
      const aMatch = /<a\s+[^>]*href=['"](https?:\/\/[^'"]+-episode-[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!aMatch) continue;
      const epUrl = aMatch[1];
      if (seenEpUrls.has(epUrl) || epUrl.includes("/batch/")) continue;
      seenEpUrls.add(epUrl);

      const rawLabel = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const dateMatch = /<span[^>]*>([^<›]+)<\/span>/i.exec(block);
      const releaseDate = dateMatch ? dateMatch[1].trim() : undefined;
      const num = extractEpisodeNumber(rawLabel, epUrl);
      episodes.push({
        episodeNumber: num,
        episodeLabel: num ? `Episode ${num}` : rawLabel || "Episode",
        providerEpisodeUrl: epUrl,
        releaseDate: releaseDate || undefined,
      });
    }

    // 2. Fallback: all episode links
    if (episodes.length === 0) {
      const epRegex = /<a\s+[^>]*href=['"](https?:\/\/[^'"]+-episode-[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let epMatch;
      while ((epMatch = epRegex.exec(html)) !== null) {
        const epUrl = epMatch[1];
        if (seenEpUrls.has(epUrl) || epUrl.includes("/batch/")) continue;
        seenEpUrls.add(epUrl);

        const rawLabel = epMatch[2].replace(/<[^>]+>/g, "").trim();
        const num = extractEpisodeNumber(rawLabel, epUrl);
        episodes.push({
          episodeNumber: num,
          episodeLabel: num ? `Episode ${num}` : rawLabel || "Episode",
          providerEpisodeUrl: epUrl,
        });
      }
    }

    episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

    return {
      sourceId: parseSlug(slug),
      provider: "samehadaku",
      title: titleMatch ? cleanAnimeTitle(titleMatch[1]) : parseSlug(slug),
      synopsis: synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, "").trim() : undefined,
      coverImage: sanitizeCover(imgMatch?.[1]),
      status: /ongoing/i.test(html) ? "Ongoing" : "Completed",
      type: "TV",
      rating: ratingMatch ? parseFloat(ratingMatch[1] || ratingMatch[2]) : undefined,
      releaseYear: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
      genres,
      episodes,
    };
  },

  async getEpisodeStreams(slugOrUrl) {
    const url = slugOrUrl.startsWith("http") ? slugOrUrl : `${this.baseUrl}/${slugOrUrl}/`;
    const html = await fetchHtml(url);
    const streams = [];

    // 1. Scope to MP4 .download-eps blocks first (skip [MKV] and [x265] blocks whose Pixeldrain files are .mkv or 404)
    const downloadBlocks = html.split(/<div class=['"]download-eps['"][^>]*>/i).slice(1);
    const mp4Blocks = downloadBlocks.filter((b) => {
      const header = /<p>\s*<b>([^<]+)<\/b>\s*<\/p>/i.exec(b)?.[1] || "";
      return /mp4/i.test(header) && !/mkv|x265/i.test(header);
    });
    const targetBlocks = mp4Blocks.length > 0 ? mp4Blocks : downloadBlocks;

    for (const dBlock of targetBlocks) {
      const liRegex = /<li>\s*<strong>([^<]+)<\/strong>([\s\S]*?)<\/li>/gi;
      let liMatch;

      while ((liMatch = liRegex.exec(dBlock)) !== null) {
        const qText = liMatch[1].toLowerCase();
        if (qText.includes("mkv") || qText.includes("x265") || qText.includes("4k") || qText.includes("2160")) continue;

        let quality = "720p";
        if (qText.includes("1080") || qText.includes("fullhd")) quality = "1080p";
        else if (qText.includes("720") || qText.includes("mp4hd")) quality = "720p";
        else if (qText.includes("480")) quality = "480p";
        else if (qText.includes("360")) quality = "360p";

        const block = liMatch[2];
        const linkRegex = /<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
        let aMatch;

        while ((aMatch = linkRegex.exec(block)) !== null) {
          const href = aMatch[1];
          const anchorName = aMatch[2].trim().toLowerCase();

          // Pixeldrain direct MP4 stream (from MP4 block only)
          if (href.includes("pixeldrain.com/u/") || anchorName.includes("pixeldrain")) {
            const fileId = href.split("/u/")[1]?.split(/[?#]/)[0];
            if (fileId) {
              streams.push({
                server: `Samehadaku • Pixeldrain ${quality.toUpperCase()} (Direct)`,
                type: "mp4",
                url: `https://pixeldrain.com/api/file/${fileId}`,
                quality,
                isEmbed: false,
                headers: {
                  Referer: `${this.baseUrl}/`,
                  "User-Agent": BROWSER_HEADERS["User-Agent"],
                },
              });
            }
          }
          // Filedon client-resolvable Cloudflare R2 / S3 MP4 (MUST be isEmbed: true so client unpacks view URL)
          else if (href.includes("filedon") || anchorName.includes("filedon")) {
            streams.push({
              server: `Samehadaku • Filedon ${quality.toUpperCase()}`,
              type: "mp4",
              url: href,
              quality,
              isEmbed: true,
              headers: {
                Referer: "https://filedon.co/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          }
          // Vidhide client HLS
          else if (href.includes("vidhide") || href.includes("peytonepre") || href.includes("callistanise") || anchorName.includes("vidhide")) {
            const normalizedVh = href
              .replace("/v/", "/embed/")
              .replace(/https?:\/\/(?:odvidhide\.com|vidhide\.com|vidhidepro\.com|vidhidefast\.com)/i, "https://callistanise.com");
            streams.push({
              server: `Samehadaku • Vidhide ${quality.toUpperCase()} (HLS)`,
              type: "m3u8",
              url: normalizedVh,
              quality,
              isEmbed: true,
              headers: {
                Referer: "https://callistanise.com/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          }
        }
      }
    }

    // 2. Parse player options (.east_player_option data-embed) for Blogger fallback only
    // (Skip s0.wibufile.com direct .mp4 because it is dead/timing out upstream)
    const optRegex = /class=['"][^'"]*east_player_option[^'"]*['"][^>]*data-embed=['"]([^'"]+)['"]/gi;
    let optMatch;
    while ((optMatch = optRegex.exec(html)) !== null) {
      const rawEmbed = optMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      const iframeMatch = /src=["']([^"']+)["']/i.exec(rawEmbed);
      if (iframeMatch) {
        const playerSrc = iframeMatch[1];
        if (playerSrc.includes("blogger.com/video.g")) {
          streams.push({
            server: "Samehadaku • Blogspot",
            type: "embed",
            url: playerSrc,
            quality: "720p",
            isEmbed: true,
          });
        }
      }
    }

    return streams;
  },

  async getFeed() {
    const items = await this.getLatest(1);
    return {
      featured: items.slice(0, 5),
      latestEpisodes: items,
      ongoing: items,
      popular: items.slice(0, 10),
    };
  },
};

// 2. Otakudesu Provider
const OtakudesuAnime = {
  baseUrl: "https://otakudesu.blog",

  async getLatest(page = 1) {
    const url = page > 1 ? `${this.baseUrl}/ongoing-anime/page/${page}/` : `${this.baseUrl}/ongoing-anime/`;
    const html = await fetchHtml(url);
    const items = [];
    const itemRegex = /<li[^>]*>[\s\S]*?<div class=['"]detpost['"]>([\s\S]*?)<\/li>/gi;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const hrefMatch = /href=['"]([^'"]+)['"]/i.exec(block);
      const titleMatch = /<h2 class=['"]jdlflm['"][^>]*>([^<]+)<\/h2>/i.exec(block);
      const imgMatch = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(block);
      const epMatch = /<div class=['"]epz['"][^>]*>([\s\S]*?)<\/div>/i.exec(block);

      if (hrefMatch && titleMatch) {
        const epClean = epMatch ? epMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;
        items.push({
          sourceId: parseSlug(hrefMatch[1]),
          title: cleanAnimeTitle(titleMatch[1]),
          coverImage: sanitizeCover(imgMatch?.[1]),
          latestEpisode: epClean,
          type: "TV",
        });
      }
    }
    return items;
  },

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=anime`;
    const html = await fetchHtml(url);
    const items = [];
    const chivMatch = /<ul class=['"]chivsrc['"][^>]*>([\s\S]*?)<\/ul>/i.exec(html);
    if (!chivMatch) return items;

    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRegex.exec(chivMatch[1])) !== null) {
      const block = match[1];
      const hrefMatch = /<h2[^>]*><a[^>]+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/i.exec(block);
      const imgMatch = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(block);
      const statusMatch = /<b>Status<\/b>\s*:\s*([^<]+)/i.exec(block);
      const ratingMatch = /<b>Rating<\/b>\s*:\s*([0-9.]+)/i.exec(block);

      if (hrefMatch) {
        items.push({
          sourceId: parseSlug(hrefMatch[1]),
          title: cleanAnimeTitle(hrefMatch[2]),
          coverImage: sanitizeCover(imgMatch?.[1]),
          rating: ratingMatch ? parseFloat(ratingMatch[1]) : undefined,
          status: statusMatch ? statusMatch[1].trim() : "Ongoing",
          type: "TV",
        });
      }
    }
    return items;
  },

  async getDetail(slug) {
    const cleanSlug = (slug || "").replace(/^[a-z0-9_-]+:/i, "").replace(/^\/+|\/+$/g, "");
    const url = cleanSlug.startsWith("http") ? cleanSlug : `${this.baseUrl}/anime/${cleanSlug}/`;
    const html = await fetchHtml(url);

    const titleMatch = /<b>Judul<\/b>:\s*([^<]+)/i.exec(html);
    const japMatch = /<b>Japanese<\/b>:\s*([^<]+)/i.exec(html);
    const statusMatch = /<b>Status<\/b>:\s*([^<]+)/i.exec(html);
    const totalEpMatch = /<b>Total Episode<\/b>:\s*(\d+)/i.exec(html);
    const totalEpisodes = totalEpMatch ? parseInt(totalEpMatch[1], 10) : undefined;
    const ratingMatch = /<b>Skor<\/b>:\s*([0-9.]+)/i.exec(html) || /<b>Rating<\/b>:\s*([0-9.]+)/i.exec(html);
    const imgMatch = /<div class=['"]fotoanime['"][^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/i.exec(html);
    const synopsisMatch = /<div class=['"]sinopc['"][^>]*>([\s\S]*?)<\/div>/i.exec(html);

    // Genres
    const genres = [];
    const genreRegex = /<a[^>]+href=['"]https:\/\/otakudesu\.blog\/genres\/[^'"]+['"][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      const g = gMatch[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }

    // Episodes
    const episodes = [];
    const seenEpUrls = new Set();
    const liEpRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liEpRegex.exec(html)) !== null) {
      const liBlock = liMatch[1];
      const epMatch = /<a[^>]+href=['"](https:\/\/otakudesu\.blog\/episode\/[^'"]+)['"][^>]*>([^<]+)<\/a>/i.exec(liBlock);
      if (!epMatch) continue;
      const epUrl = epMatch[1];
      if (seenEpUrls.has(epUrl) || /batch/i.test(epUrl)) continue;
      seenEpUrls.add(epUrl);
      const epText = epMatch[2].trim();
      const dateMatch = /<span class=['"]zeebr['"][^>]*>([^<]+)<\/span>/i.exec(liBlock);
      const rawDate = dateMatch ? dateMatch[1].trim() : undefined;
      const releaseDate = rawDate ? rawDate.replace(/,(\d)/, ", $1") : undefined;
      const num = extractEpisodeNumber(epText, epUrl);
      episodes.push({
        episodeNumber: num,
        episodeLabel: num ? `Episode ${num}` : epText,
        providerEpisodeUrl: epUrl,
        releaseDate: releaseDate || undefined,
      });
    }

    episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

    let status = statusMatch ? statusMatch[1].trim() : "Ongoing";
    if (
      status.toLowerCase() === "ongoing" &&
      ((totalEpisodes && episodes.length >= totalEpisodes) ||
        episodes.some((e) => /\b(?:end|tamat)\b/i.test(e.episodeLabel)))
    ) {
      status = "Completed";
    }

    return {
      sourceId: slug,
      provider: "otakudesu",
      title: titleMatch ? cleanAnimeTitle(titleMatch[1]) : slug,
      japaneseTitle: japMatch ? japMatch[1].trim() : undefined,
      synopsis: synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, "").trim() : undefined,
      coverImage: sanitizeCover(imgMatch?.[1]),
      status,
      totalEpisodes,
      type: "TV",
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : undefined,
      genres,
      episodes,
    };
  },

  async getEpisodeStreams(slugOrUrl) {
    const compMatch = String(slugOrUrl).match(/^([a-z0-9_-]+):([a-z0-9_-]+):(\d+)$/i);
    let resolvedUrl = slugOrUrl;
    if (compMatch) {
      const seriesSlug = compMatch[2];
      const targetEpNum = parseInt(compMatch[3], 10);
      try {
        const detail = await this.getDetail(seriesSlug);
        const ep = detail.episodes?.find((e) => e.episodeNumber === targetEpNum);
        if (ep && ep.providerEpisodeUrl) {
          resolvedUrl = ep.providerEpisodeUrl;
        }
      } catch {}
    }

    const url = resolvedUrl.startsWith("http")
      ? resolvedUrl
      : (resolvedUrl.startsWith("episode/") ? `${this.baseUrl}/${resolvedUrl}/` : `${this.baseUrl}/episode/${resolvedUrl}/`);
    const html = await fetchHtml(url);
    const streams = [];

    // Parse download mirrors (Pdrain, Filedon, Vidhide - MP4 only, skip MKV)
    const liRegex = /<li><strong>([^<]+)<\/strong>([\s\S]*?)<\/li>/gi;
    let liMatch;
    const resolutionTasks = [];

    // 0. Check default iframe for fast Moedesu / ODCloud direct playback
    const defIframeMatch =
      /<div class=['"]responsive-embed-stream['"][^>]*>[\s\S]*?<iframe[^>]+src=['"]([^'"]+)['"]/i.exec(html) ||
      /<div id=['"]pembed['"][^>]*>[\s\S]*?<iframe[^>]+src=['"]([^'"]+)['"]/i.exec(html) ||
      /<iframe[^>]+src=['"](https?:\/\/desustream\.[^'"]+)['"]/i.exec(html) ||
      /<iframe[^>]+src=['"]([^'"]+)['"]/i.exec(html);

    if (defIframeMatch && defIframeMatch[1]) {
      const defSrc = defIframeMatch[1].trim();
      if (/moedesu|desustream\.(?:net|me)\/dstream\/moedesu/i.test(defSrc)) {
        streams.push({
          server: "Otakudesu • Moedesu (Google Video)",
          type: "embed",
          url: defSrc,
          quality: "720p",
          isEmbed: true,
          headers: {
            Referer: `${this.baseUrl}/`,
            "User-Agent": BROWSER_HEADERS["User-Agent"],
          },
        });
      } else if (/desustream\.(?:net|me)\/dstream\/odcdn/i.test(defSrc)) {
        resolutionTasks.push(
          (async () => {
            try {
              const odHtml = await fetchHtml(defSrc);
              const vMatch =
                odHtml.match(/(?:const|var|let)\s+videoURL\s*=\s*["']([^"']+)["']/i) ||
                odHtml.match(/src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
              if (vMatch && vMatch[1] && !vMatch[1].includes("googlevideo.com")) {
                const mp4Url = vMatch[1].trim();
                const qMatch = mp4Url.match(/(1080p|720p|480p|360p)/i);
                const odQuality = qMatch ? qMatch[1].toLowerCase() : "720p";
                return {
                  server: `Otakudesu • ODCloud ${odQuality.toUpperCase()} (Direct)`,
                  type: "mp4",
                  url: mp4Url,
                  quality: odQuality,
                  isEmbed: false,
                  headers: {
                    Referer: "https://desustream.net/",
                    "User-Agent": BROWSER_HEADERS["User-Agent"],
                  },
                };
              }
            } catch {}
            return null;
          })()
        );
      }
    }

    // 0.5. Check AJAX mirrors (.mirrorstream a[data-content])
    const actions = Array.from(html.matchAll(/action\s*:\s*["']([a-f0-9]{32})["']/g)).map((m) => m[1]);
    if (actions.length >= 2) {
      const streamAction = actions[0];
      const nonceAction = actions[1];
      try {
        const nonceRes = await fetch(`${this.baseUrl}/wp-admin/admin-ajax.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BROWSER_HEADERS["User-Agent"],
            Referer: url,
          },
          body: `action=${nonceAction}`,
          signal: AbortSignal.timeout(4000),
        });
        const nonceJson = await nonceRes.json();
        const nonce = nonceJson?.data;
        if (nonce) {
          const mirrorRegex = /<a[^>]+href=['"]#['"][^>]+data-content=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
          let m;
          const mirrorTasks = [];
          while ((m = mirrorRegex.exec(html)) !== null) {
            const dataContent = m[1];
            const label = m[2].trim();
            try {
              const payload = JSON.parse(Buffer.from(dataContent, "base64").toString("utf-8"));
              mirrorTasks.push((async () => {
                try {
                  const body = new URLSearchParams({
                    ...payload,
                    nonce,
                    action: streamAction,
                  }).toString();
                  const r = await fetch(`${this.baseUrl}/wp-admin/admin-ajax.php`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                      "User-Agent": BROWSER_HEADERS["User-Agent"],
                      Referer: url,
                    },
                    body,
                    signal: AbortSignal.timeout(4000),
                  });
                  const j = await r.json();
                  if (j?.data) {
                    const decoded = Buffer.from(j.data, "base64").toString("utf-8");
                    const srcMatch = decoded.match(/src=["']([^"']+)["']/i);
                    if (srcMatch) {
                      return { label, q: payload.q, src: srcMatch[1] };
                    }
                  }
                } catch {}
                return null;
              })());
            } catch {}
          }
          if (mirrorTasks.length > 0) {
            const resolvedMirrors = await Promise.allSettled(mirrorTasks.slice(0, 8));
            for (const res of resolvedMirrors) {
              if (res.status === "fulfilled" && res.value) {
                const { label, q, src } = res.value;
                const quality = q || "720p";
                const serverName = `Otakudesu • ${label.toUpperCase()} ${quality}`;
                if (!streams.some((s) => s.url === src)) {
                  streams.push({
                    server: serverName,
                    type: "embed",
                    url: src,
                    quality,
                    isEmbed: true,
                    headers: {
                      Referer: `${this.baseUrl}/`,
                      "User-Agent": BROWSER_HEADERS["User-Agent"],
                    },
                  });
                }
              }
            }
          }
        }
      } catch {}
    }

    while ((liMatch = liRegex.exec(html)) !== null) {
      const qText = liMatch[1].toLowerCase();
      if (qText.includes("mkv") || qText.includes("4k") || qText.includes("2160")) continue;

      let quality = "720p";
      if (qText.includes("1080")) quality = "1080p";
      else if (qText.includes("720")) quality = "720p";
      else if (qText.includes("480")) quality = "480p";
      else if (qText.includes("360")) quality = "360p";

      const block = liMatch[2];
      const linkRegex = /<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
      let aMatch;
      while ((aMatch = linkRegex.exec(block)) !== null) {
        const href = aMatch[1];
        const name = aMatch[2].trim().toLowerCase();

        // Only match actual PDrain / Pixeldrain mirrors (NOT generic link.desustream links for OtakuFiles/Mega/Kraken!)
        if (name.includes("pdrain") || name.includes("pixeldrain") || href.includes("pixeldrain")) {
          const directPdrain = href.includes("pixeldrain.com/u/")
            ? href.replace("/u/", "/api/file/")
            : href.includes("pixeldrain.com/api/file/")
            ? href
            : null;

          if (directPdrain) {
            streams.push({
              server: `Otakudesu • Pixeldrain ${quality.toUpperCase()} (Direct)`,
              type: "mp4",
              url: directPdrain,
              quality,
              isEmbed: false,
              headers: {
                Referer: "https://pixeldrain.com/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else {
            resolutionTasks.push(
              (async () => {
                try {
                  const resText = await fetchHtml(href);
                  const idMatch =
                    resText.match(/"id":"([A-Za-z0-9]+)"/) ||
                    resText.match(/pixeldrain\.com\/(?:u|api\/file)\/([A-Za-z0-9]+)/);
                  if (idMatch) {
                    return {
                      server: `Otakudesu • Pixeldrain ${quality.toUpperCase()} (Direct)`,
                      type: "mp4",
                      url: `https://pixeldrain.com/api/file/${idMatch[1]}`,
                      quality,
                      isEmbed: false,
                      headers: {
                        Referer: "https://pixeldrain.com/",
                        "User-Agent": BROWSER_HEADERS["User-Agent"],
                      },
                    };
                  }
                } catch {}
                return null;
              })()
            );
          }
        } else if (name.includes("filedon") || href.includes("filedon")) {
          if (href.includes("filedon.co")) {
            streams.push({
              server: `Otakudesu • Filedon ${quality.toUpperCase()}`,
              type: "mp4",
              url: href,
              quality,
              isEmbed: true,
              headers: {
                Referer: "https://filedon.co/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else {
            resolutionTasks.push(
              (async () => {
                try {
                  const resText = await fetchHtml(href);
                  const fMatch = resText.match(/https?:\/\/filedon\.co\/view\/[A-Za-z0-9_-]+/i);
                  if (fMatch) {
                    return {
                      server: `Otakudesu • Filedon ${quality.toUpperCase()}`,
                      type: "mp4",
                      url: fMatch[0],
                      quality,
                      isEmbed: true,
                      headers: {
                        Referer: "https://filedon.co/",
                        "User-Agent": BROWSER_HEADERS["User-Agent"],
                      },
                    };
                  }
                } catch {}
                return null;
              })()
            );
          }
        } else if (name.includes("vidhide") || name.includes("odvidhide") || href.includes("vidhide")) {
          if (href.includes("vidhide") || href.includes("peytonepre") || href.includes("callistanise")) {
            const normalizedVh = href
              .replace("/v/", "/embed/")
              .replace(/https?:\/\/(?:odvidhide\.com|vidhide\.com|vidhidepro\.com|vidhidefast\.com)/i, "https://callistanise.com");
            streams.push({
              server: `Otakudesu • Vidhide ${quality.toUpperCase()} (HLS)`,
              type: "m3u8",
              url: normalizedVh,
              quality,
              isEmbed: true,
              headers: {
                Referer: "https://callistanise.com/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else {
            resolutionTasks.push(
              (async () => {
                try {
                  const res = await fetch(href, {
                    headers: BROWSER_HEADERS,
                    redirect: "follow",
                  });
                  const finalUrl = res.url || "";
                  if (finalUrl.includes("vidhide") || finalUrl.includes("peytonepre") || finalUrl.includes("odvidhide") || finalUrl.includes("callistanise")) {
                    const normalizedVh = finalUrl
                      .replace("/v/", "/embed/")
                      .replace(/https?:\/\/(?:odvidhide\.com|vidhide\.com|vidhidepro\.com|vidhidefast\.com)/i, "https://callistanise.com");
                    return {
                      server: `Otakudesu • Vidhide ${quality.toUpperCase()} (HLS)`,
                      type: "m3u8",
                      url: normalizedVh,
                      quality,
                      isEmbed: true,
                      headers: {
                        Referer: "https://callistanise.com/",
                        "User-Agent": BROWSER_HEADERS["User-Agent"],
                      },
                    };
                  }
                } catch {}
                return null;
              })()
            );
          }
        }
      }
    }

    if (resolutionTasks.length > 0) {
      const resolved = await Promise.allSettled(resolutionTasks);
      for (const r of resolved) {
        if (r.status === "fulfilled" && r.value) {
          streams.push(r.value);
        }
      }
    }

    return streams;
  },

  async getFeed() {
    const items = await this.getLatest(1);
    return {
      featured: items.slice(0, 5),
      latestEpisodes: items,
      ongoing: items,
      popular: items.slice(0, 10),
    };
  },
};

function isNsfwAnimeItem(title, sourceId) {
  return (
    /\b(?:hentai|ecchi|guilty[\s\-_]*hole|ingoku[\s\-_]*danchi|ero|oppai|jav|r-?18|uncensored|hitozuma|nukitashi)\b/i.test(
      title || ""
    ) ||
    /(?:-|^)(?:hentai|ecchi|guilty-hole|ingoku-danchi|ero|oppai|jav|r-?18|uncensored|hitozuma|nukitashi)(?:-|$)/i.test(
      sourceId || ""
    )
  );
}

function parseAnimeIndoArticles(htmlBlock) {
  const items = [];
  const seen = new Set();
  const itemRegex = /<article class=['"]bs['"][^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = itemRegex.exec(htmlBlock)) !== null) {
    const block = match[1];
    const hrefMatch = /href=['"]([^'"]+)['"]/i.exec(block);
    const ttMatch = /<div class=['"]tt['"][^>]*>\s*([^<]+)/i.exec(block);
    const h2Match = /<h2[^>]*>([^<]+)<\/h2>/i.exec(block) || /title=['"]([^'"]+)['"]/i.exec(block);
    const imgMatch = /data-src=['"]([^'"]+)['"]/i.exec(block) || /src=['"]([^'"]+)['"]/i.exec(block);
    const epMatch = /<span class=['"]epx['"][^>]*>([^<]+)<\/span>/i.exec(block);

    const rawTitle = (ttMatch && ttMatch[1].trim()) || (h2Match && h2Match[1].trim()) || "";
    if (hrefMatch && rawTitle) {
      let sourceId = parseSlug(hrefMatch[1])
        .replace(/-episode-\d+.*$/i, "")
        .replace(/-(?:sub-indo|subtitle-indonesia)$/i, "");
      sourceId = sourceId.replace(/-s(\d+)$/i, "-season-$1");
      const title = cleanAnimeTitle(rawTitle);
      if (!sourceId || seen.has(sourceId) || isNsfwAnimeItem(title, sourceId)) continue;
      seen.add(sourceId);

      const rawEp = epMatch ? epMatch[1].replace(/^ep\s*/i, "").trim() : undefined;
      const latestEpisode = rawEp
        ? /^\d/.test(rawEp)
          ? `Episode ${rawEp}`
          : rawEp
        : undefined;

      items.push({
        sourceId,
        title,
        coverImage: sanitizeCover(imgMatch?.[1]),
        latestEpisode,
        type: "TV",
        status: "Ongoing",
        provider: "animeindo",
      });
    }
  }
  return items;
}

// 3. AnimeIndo Provider
const AnimeIndoAnime = {
  baseUrl: "https://animeindo.me",

  async getLatest(page = 1) {
    const url = page > 1 ? `${this.baseUrl}/page/${page}/` : `${this.baseUrl}/`;
    const html = await fetchHtml(url);

    // Strictly target the "Latest Release" .bixbox section so "Popular Today" (2025/old items) do not pollute Latest Updates
    const bixboxes = html.split(/<div class=['"]bixbox[^'"]*['"][^>]*>/i).slice(1);
    for (const box of bixboxes) {
      const heading = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(box)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
      if (/latest/i.test(heading)) {
        const latest = parseAnimeIndoArticles(box);
        if (latest.length > 0) return latest;
      }
    }

    return parseAnimeIndoArticles(html);
  },

  async search(query) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    return parseAnimeIndoArticles(html);
  },

  async getDetail(slug) {
    const rawSlug = (slug || "").replace(/^[a-z0-9_-]+:/i, "").replace(/^\/+|\/+$/g, "");
    const url = `${this.baseUrl}/anime/${rawSlug}/`;
    let html = "";
    try {
      html = await fetchHtml(url);
    } catch {
      html = "";
    }

    // If /anime/{slug}/ not found or lacks episode list, test alternate season slug (-s2 <-> -season-2)
    if (!/<div class=['"]eplister['"]/i.test(html)) {
      const altSlug = /-s\d+/i.test(rawSlug)
        ? rawSlug.replace(/-s(\d+)/i, "-season-$1")
        : rawSlug.replace(/-season-(\d+)/i, "-s$1");
      if (altSlug !== slug) {
        try {
          const altHtml = await fetchHtml(`${this.baseUrl}/anime/${altSlug}/`);
          if (/<div class=['"]eplister['"]/i.test(altHtml)) {
            html = altHtml;
          }
        } catch {}
      }
    }

    // If still missing, search AnimeIndo to locate canonical series URL
    if (!/<div class=['"]eplister['"]/i.test(html)) {
      try {
        const query = slug.replace(/[-_]+/g, " ");
        const searchHtml = await fetchHtml(`${this.baseUrl}/?s=${encodeURIComponent(query)}`);
        const seriesMatch = /<a[^>]+href=['"]https:\/\/animeindo\.me\/anime\/([^\/'"]+)\/['"]/i.exec(searchHtml);
        if (seriesMatch && seriesMatch[1] && seriesMatch[1] !== slug) {
          const foundHtml = await fetchHtml(`${this.baseUrl}/anime/${seriesMatch[1]}/`);
          if (/<div class=['"]eplister['"]/i.test(foundHtml)) {
            html = foundHtml;
          }
        }
      } catch {}
    }

    const titleMatch =
      /<h1 class=['"]entry-title['"][^>]*>([^<]+)<\/h1>/i.exec(html) ||
      /<h2 itemprop=['"]partOfSeries['"][^>]*>([^<]+)<\/h2>/i.exec(html);
    const imgMatch = /<div class=['"]thumb['"][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html);
    const synopsisMatch =
      /<div class=['"]desc mindes['"][^>]*>([\s\S]*?)<\/div>/i.exec(html) ||
      /<div class=['"]entry-content['"][^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const ratingMatch = /<strong>Rating\s*([0-9.]+)<\/strong>/i.exec(html);
    const statusMatch = /<b>Status:<\/b>\s*([^<]+)/i.exec(html);

    // Genres (scoped strictly to .genxed container so sidebar genres do not leak)
    const genres = [];
    const genxedBlock = /<div class=['"]genxed['"][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] || "";
    const genreRegex = /<a[^>]+href=['"]https:\/\/animeindo\.me\/genres\/[^'"]+['"][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(genxedBlock)) !== null) {
      const g = gMatch[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }

    // Episodes from eplister
    const episodes = [];
    const eplisterBlock = html.split(/class=['"]eplister['"]/i)[1]?.split(/<\/ul>/i)[0] || "";
    const epRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let epMatch;

    while ((epMatch = epRegex.exec(eplisterBlock)) !== null) {
      const liBlock = epMatch[1];
      const hrefMatch = /<a[^>]+href=['"]([^'"]+)['"]/i.exec(liBlock);
      const numMatch = /<div class=['"]epl-num['"][^>]*>([^<]+)<\/div>/i.exec(liBlock);
      const dateMatch = /<div class=['"]epl-date['"][^>]*>([^<]+)<\/div>/i.exec(liBlock);
      if (!hrefMatch || !numMatch) continue;
      const epUrl = hrefMatch[1];
      const epNumStr = numMatch[1].trim();
      const releaseDate = dateMatch ? dateMatch[1].trim() : undefined;
      const num = extractEpisodeNumber(epNumStr, epUrl);
      episodes.push({
        episodeNumber: num,
        episodeLabel: `Episode ${num || epNumStr}`,
        providerEpisodeUrl: epUrl,
        releaseDate: releaseDate || undefined,
      });
    }

    // Self-Healing Fallback if /anime/{slug}/ returned 403 WAF or 0 episodes: probe episode 1 page directly
    let fallbackTitle = "";
    let fallbackCover = "";
    let fallbackSynopsis = "";
    if (episodes.length === 0) {
      for (const epProbeUrl of [
        `${this.baseUrl}/${slug}-episode-1-sub-indo/`,
        `${this.baseUrl}/${slug}-episode-1/`,
      ]) {
        try {
          const epHtml = await fetchHtml(epProbeUrl);
          const epListBlock = epHtml.split(/class=['"]episodelist['"]/i)[1]?.split(/<\/ul>/i)[0] || "";
          const liMatches = epListBlock.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
          for (const li of liMatches) {
            const hMatch = /<a[^>]+href=['"]([^'"]+)['"]/i.exec(li);
            const tMatch = /<span class=['"]playinfo['"][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>/i.exec(li);
            const dMatch = /<span>([^<]+)<\/span>\s*<\/span>/i.exec(li);
            if (!hMatch) continue;
            const epUrl = hMatch[1];
            const labelStr = tMatch ? tMatch[1].trim() : "";
            const num = extractEpisodeNumber(labelStr, epUrl);
            const rawDate = dMatch ? dMatch[1].replace(/^Eps\s*\d+\s*-\s*/i, "").trim() : undefined;
            episodes.push({
              episodeNumber: num,
              episodeLabel: `Episode ${num || episodes.length + 1}`,
              providerEpisodeUrl: epUrl,
              releaseDate: rawDate || undefined,
            });
          }
          if (episodes.length > 0) {
            const fTitle = /<h2 itemprop=['"]partOfSeries['"][^>]*>([^<]+)<\/h2>/i.exec(epHtml) ||
              /<h1 class=['"]entry-title['"][^>]*>([^<]+)<\/h1>/i.exec(epHtml);
            if (fTitle) fallbackTitle = cleanAnimeTitle(fTitle[1]);
            const fImg = /<div class=['"]thumb['"][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(epHtml);
            if (fImg) fallbackCover = fImg[1];
            const fSyn = /<div class=['"]desc['"][^>]*>([\s\S]*?)<\/div>/i.exec(epHtml);
            if (fSyn) fallbackSynopsis = fSyn[1].replace(/<[^>]+>/g, "").trim();
            break;
          }
        } catch {}
      }
    }

    episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

    return {
      sourceId: slug,
      provider: "animeindo",
      title: titleMatch ? cleanAnimeTitle(titleMatch[1]) : fallbackTitle || slug,
      synopsis: synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, "").trim() : fallbackSynopsis || undefined,
      coverImage: sanitizeCover(imgMatch?.[1] || fallbackCover),
      status: statusMatch ? statusMatch[1].trim() : "Ongoing",
      type: "TV",
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : undefined,
      genres,
      episodes,
    };
  },

  async getEpisodeStreams(slugOrUrl) {
    const url = slugOrUrl.startsWith("http") ? slugOrUrl : `${this.baseUrl}/${slugOrUrl}/`;
    const html = await fetchHtml(url);
    const streams = [];

    // Parse select.mirror base64 options
    const optRegex = /<option[^>]+value=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/option>/gi;
    let match;
    while ((match = optRegex.exec(html)) !== null) {
      const val = match[1];
      const label = match[2].trim();
      if (!val || val === "") continue;

      try {
        const decoded = Buffer.from(val, "base64").toString("utf-8");
        const srcMatch = /src=['"]([^'"]+)['"]/i.exec(decoded);
        if (srcMatch) {
          const streamUrl = srcMatch[1].trim();
          const qMatch = /(1080p|720p|480p|360p)/i.exec(label);
          const quality = qMatch ? qMatch[1].toLowerCase() : "720p";

          if (streamUrl.includes("vidhide") || streamUrl.includes("peytonepre") || streamUrl.includes("callistanise")) {
            const normalizedVh = streamUrl
              .replace("/v/", "/embed/")
              .replace(/https?:\/\/(?:odvidhide\.com|vidhide\.com|vidhidepro\.com|vidhidefast\.com)/i, "https://callistanise.com");
            streams.push({
              server: `AnimeIndo • Vidhide ${quality.toUpperCase()}`,
              type: "m3u8",
              url: normalizedVh,
              quality,
              isEmbed: true,
              headers: {
                Referer: "https://callistanise.com/",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else if (streamUrl.includes("filedon.co")) {
            streams.push({
              server: `AnimeIndo • Filedon ${quality.toUpperCase()}`,
              type: "mp4",
              url: streamUrl,
              quality,
              isEmbed: true,
              headers: {
                Referer: `${this.baseUrl}/`,
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else if (streamUrl.includes(".mp4") || streamUrl.includes(".m3u8")) {
            const isM3u8 = streamUrl.includes(".m3u8");
            streams.push({
              server: `AnimeIndo • ${label || "Direct"} ${quality.toUpperCase()}`.trim(),
              type: isM3u8 ? "m3u8" : "mp4",
              url: streamUrl,
              quality,
              isEmbed: false,
              headers: {
                Referer: `${this.baseUrl}/`,
                "User-Agent": BROWSER_HEADERS["User-Agent"],
              },
            });
          } else if (streamUrl.includes("blogger.com/video.g")) {
            streams.push({
              server: `AnimeIndo • Blogspot ${quality.toUpperCase()}`,
              type: "embed",
              url: streamUrl,
              quality,
              isEmbed: true,
            });
          }
        }
      } catch {}
    }

    return streams;
  },

  async getFeed() {
    const [homeHtml, popHtml, updateHtml] = await Promise.all([
      fetchHtml(`${this.baseUrl}/`).catch(() => ""),
      fetchHtml(`${this.baseUrl}/anime/?order=popular`).catch(() => ""),
      fetchHtml(`${this.baseUrl}/anime/?order=update`).catch(() => ""),
    ]);

    let latestEpisodes = [];
    let recommendations = [];
    let popularToday = [];

    const bixboxes = homeHtml.split(/<div class=['"]bixbox[^'"]*['"][^>]*>/i).slice(1);
    for (const box of bixboxes) {
      const heading = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(box)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
      if (/latest/i.test(heading)) {
        latestEpisodes = parseAnimeIndoArticles(box);
      } else if (/recommend/i.test(heading)) {
        recommendations = parseAnimeIndoArticles(box);
      } else if (/popular/i.test(heading)) {
        popularToday = parseAnimeIndoArticles(box);
      }
    }

    if (latestEpisodes.length === 0) {
      latestEpisodes = parseAnimeIndoArticles(homeHtml);
    }

    const popularList = parseAnimeIndoArticles(popHtml);
    const updateList = parseAnimeIndoArticles(updateHtml);

    // Canonicalize sourceIds using /anime/?order=update and recommendations
    const normTitle = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const canonicalMap = new Map();
    for (const item of [...updateList, ...recommendations, ...popularList]) {
      canonicalMap.set(normTitle(item.title), item.sourceId);
    }
    for (const item of latestEpisodes) {
      const canonicalSlug = canonicalMap.get(normTitle(item.title));
      if (canonicalSlug) {
        item.sourceId = canonicalSlug;
      } else if (item.sourceId.includes("%")) {
        try {
          item.sourceId = decodeURIComponent(item.sourceId)
            .replace(/[^a-z0-9-]+/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase();
        } catch {}
      }
    }

    // Build Featured Carousel WITHOUT duplicating the top 6 items shown in Latest Updates
    const topLatestKeys = new Set(
      latestEpisodes.slice(0, 6).flatMap((x) => [x.sourceId, normTitle(x.title)])
    );
    const featuredCandidates = [
      ...updateList.slice(6),
      ...recommendations,
      ...popularToday,
      ...popularList.slice(0, 6),
    ];
    const featured = [];
    const seenFeatured = new Set();
    for (const item of featuredCandidates) {
      const titleKey = normTitle(item.title);
      if (topLatestKeys.has(item.sourceId) || topLatestKeys.has(titleKey)) continue;
      if (seenFeatured.has(item.sourceId) || seenFeatured.has(titleKey)) continue;
      seenFeatured.add(item.sourceId);
      seenFeatured.add(titleKey);
      featured.push(item);
      if (featured.length >= 8) break;
    }

    return {
      featured: featured.length >= 5 ? featured : recommendations.slice(0, 8),
      latestEpisodes,
      ongoing: updateList.length >= 5 ? updateList.slice(0, 15) : latestEpisodes,
      popular: popularList.length >= 5 ? popularList.slice(0, 10) : popularToday,
    };
  },
};

// 4. Kuramanime Provider
const KuramanimeAnime = {
  baseUrl: "https://v20.kuramanime.ing",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  },

  extractId(url) {
    if (!url) return "";
    const trimmed = url.replace(/\/+$/, "");
    const match = trimmed.match(/\/anime\/([^/]+\/[^/]+)/);
    if (match) return match[1];
    const parts = trimmed.split("/");
    return parts.slice(-2).join("/") || parts[parts.length - 1] || "";
  },

  cleanTitle(raw) {
    if (!raw) return "";
    return raw.replace(/<[^>]+>/g, "").trim();
  },

  parseSearchHtml(html) {
    const results = [];
    const blocks = html.split(/<div class=['"]product__item/i).slice(1);
    for (const block of blocks) {
      const linkMatch = /<a[^>]+href=['"]([^'"]*\/anime\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!linkMatch) continue;
      const href = linkMatch[1];
      const sourceId = this.extractId(href);

      const titleMatch = /<h5><a[^>]*>([\s\S]*?)<\/a><\/h5>/i.exec(block) || linkMatch;
      const title = this.cleanTitle(titleMatch[1] || sourceId);

      const bgMatch = /data-setbg=['"]([^'"]+)['"]/i.exec(block) || /<img[^>]+src=['"]([^'"]+)['"]/i.exec(block);
      const coverImage = bgMatch ? bgMatch[1] : undefined;

      const epMatch = /<div class=['"]ep['"][^>]*>([\s\S]*?)<\/div>/i.exec(block) || /<span>([\s\S]*?)<\/span>/i.exec(block);
      const latestEpisode = epMatch ? this.cleanTitle(epMatch[1]) : undefined;

      results.push({
        sourceId,
        provider: "kuramanime",
        title,
        coverImage,
        latestEpisode,
        type: "TV",
      });
    }
    return results;
  },

  async getLatest(page = 1) {
    try {
      const url = `${this.baseUrl}/quick/ongoing?order_by=updated&page=${page}`;
      const html = await fetchHtml(url, this.headers);
      return this.parseSearchHtml(html);
    } catch {
      return [];
    }
  },

  async getFeed() {
    try {
      const ongoing = await this.getLatest(1);
      return {
        featured: ongoing.slice(0, 5),
        spotlight: ongoing.slice(0, 5),
        latestEpisodes: ongoing,
        ongoing: ongoing.slice(0, 15),
        completed: [],
      };
    } catch {
      return {
        featured: [],
        spotlight: [],
        latestEpisodes: [],
        ongoing: [],
        completed: [],
      };
    }
  },

  async search(query, page = 1) {
    try {
      const url = `${this.baseUrl}/anime?search=${encodeURIComponent(query)}&page=${page}`;
      const html = await fetchHtml(url, this.headers);
      return this.parseSearchHtml(html);
    } catch {
      return [];
    }
  },

  async getDetail(slug) {
    const id = this.extractId(slug);
    const detailUrl = slug.startsWith("http") ? slug : `${this.baseUrl}/anime/${id}`;
    const html = await fetchHtml(detailUrl, this.headers);

    const titleMatch =
      /<h3 class=['"]text-white['"][^>]*>([\s\S]*?)<\/h3>/i.exec(html) ||
      /<div class=['"]anime__details__title['"][^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>/i.exec(html);
    const title = this.cleanTitle(titleMatch ? titleMatch[1] : id);

    const bgMatch =
      /class=['"][^'"]*anime__details__pic[^'"]*['"][^>]*data-setbg=['"]([^'"]+)['"]/i.exec(html) ||
      /<div class=['"]anime__details__pic['"][^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/i.exec(html);
    const coverImage = bgMatch ? bgMatch[1] : undefined;

    const synopsisMatch = /<div class=['"]anime__details__text['"][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    const synopsis = synopsisMatch ? this.cleanTitle(synopsisMatch[1]) : undefined;

    const genres = [];
    const genreRegex = /<a[^>]+href=['"][^'"]*\/genre[s]?\/[^'"]+['"][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      const g = gMatch[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }

    const episodes = [];
    const seenUrls = new Set();
    const addEpisode = (rawHref, rawText) => {
      if (!rawHref || rawHref.includes("?page=")) return;
      const fullUrl = rawHref.startsWith("http") ? rawHref : `${this.baseUrl}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
      if (seenUrls.has(fullUrl)) return;
      if (/terlama|terbaru/i.test(rawText)) return;

      const numMatch = /(?:episode|eps|ep)\.?\s*(\d+(?:\.\d+)?)/i.exec(rawText) || /(\d+(?:\.\d+)?)/.exec(rawText);
      const episodeNumber = numMatch ? parseFloat(numMatch[1]) : undefined;
      const episodeLabel = rawText ? this.cleanTitle(rawText) : (episodeNumber ? `Episode ${episodeNumber}` : "Episode");

      seenUrls.add(fullUrl);
      episodes.push({
        episodeNumber,
        episodeLabel,
        providerEpisodeUrl: fullUrl,
      });
    };

    const dataContentMatch = /id=['"]episodeLists['"][^>]*data-content=['"]([^'"]+)['"]/i.exec(html);
    if (dataContentMatch) {
      const content = dataContentMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      const epAnchorRegex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = epAnchorRegex.exec(content)) !== null) {
        addEpisode(m[1], m[2]);
      }
    }

    const directEpRegex = /<a[^>]+href=['"]([^'"]*\/episode\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let deMatch;
    while ((deMatch = directEpRegex.exec(html)) !== null) {
      addEpisode(deMatch[1], deMatch[2]);
    }

    const isCompleted = /selesai|tamat|completed/i.test(html);
    const status = isCompleted ? "Completed" : "Ongoing";

    return {
      sourceId: id,
      provider: "kuramanime",
      title,
      synopsis,
      coverImage,
      status,
      type: "TV",
      genres,
      episodes,
    };
  },

  async getEpisodeStreams(targetUrl) {
    const fullUrl = targetUrl.startsWith("http") ? targetUrl : `${this.baseUrl}/${targetUrl.replace(/^\/+/, "")}`;
    let html = "";
    try {
      html = await fetchHtml(fullUrl, this.headers);
    } catch {
      return [];
    }

    const streams = [];
    const seenUrls = new Set();
    const normalizeQuality = (raw) => {
      if (!raw) return undefined;
      const m = raw.match(/\b(1080p|720p|480p|360p)\b/i) || raw.match(/\b(1080|720|480|360)\b/);
      if (m) {
        const val = m[1].toLowerCase();
        return val.endsWith("p") ? val : `${val}p`;
      }
      return undefined;
    };

    const addStream = (source) => {
      if (!source.url || seenUrls.has(source.url)) return;
      seenUrls.add(source.url);
      streams.push(source);
    };

    const videoRegex = /<(?:video|source)[^>]+(?:data-src|src)=['"]([^'"]+)['"][^>]*>/gi;
    let vMatch;
    while ((vMatch = videoRegex.exec(html)) !== null) {
      const src = vMatch[1];
      if (src && !src.startsWith("blob:") && !src.startsWith("javascript:")) {
        const full = src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `${this.baseUrl}${src}` : src;
        const q = normalizeQuality(vMatch[0]) || normalizeQuality(full) || "720p";
        addStream({
          server: `Kuramanime ${q} (Direct)`,
          type: full.includes(".m3u8") ? "m3u8" : "mp4",
          url: full.trim(),
          quality: q,
          isEmbed: false,
          headers: { Referer: fullUrl },
        });
      }
    }

    const dlRegex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let dlMatch;
    while ((dlMatch = dlRegex.exec(html)) !== null) {
      const rawHref = dlMatch[1];
      const text = dlMatch[2].replace(/<[^>]+>/g, "").trim();
      if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) continue;
      const fullHref = rawHref.startsWith("//") ? `https:${rawHref}` : rawHref.startsWith("/") ? `${this.baseUrl}${rawHref}` : rawHref;
      const q = normalizeQuality(text) || normalizeQuality(fullHref) || "720p";

      if (fullHref.includes(".mp4") || fullHref.includes(".m3u8")) {
        addStream({
          server: `KuramaDrive ${q} (Direct)`,
          type: fullHref.includes(".m3u8") ? "m3u8" : "mp4",
          url: fullHref.trim(),
          quality: q,
          isEmbed: false,
          headers: { Referer: fullUrl },
        });
      } else if (/mega\.nz|filemoon|streamwish|filelions|dood|yourupload/i.test(fullHref)) {
        let name = "Kurama Mirror";
        if (/mega\.nz/i.test(fullHref)) name = "MEGA";
        else if (/filemoon/i.test(fullHref)) name = "FileMoon";
        else if (/streamwish/i.test(fullHref)) name = "StreamWish";
        else if (/filelions/i.test(fullHref)) name = "FileLions";
        else if (/dood/i.test(fullHref)) name = "DoodStream";
        else if (/yourupload/i.test(fullHref)) name = "YourUpload";

        addStream({
          server: `${name} ${q} (Embed)`,
          type: "embed",
          url: fullHref.trim(),
          quality: q,
          isEmbed: true,
          headers: { Referer: fullUrl },
        });
      }
    }

    const iframeRegex = /<iframe[^>]+(?:data-src|src)=['"]([^'"]+)['"][^>]*>/gi;
    let ifMatch;
    while ((ifMatch = iframeRegex.exec(html)) !== null) {
      const src = ifMatch[1];
      if (src && !/ads|kuramachat/i.test(src)) {
        const fullSrc = src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `${this.baseUrl}${src}` : src;
        addStream({
          server: "Kurama Player (Embed)",
          type: "embed",
          url: fullSrc.trim(),
          isEmbed: true,
          headers: { Referer: fullUrl },
        });
      }
    }

    return streams;
  },
};

// 5. Nimegami Provider
const NimegamiAnime = {
  baseUrl: "https://nimegami.id",

  cleanTitle(title) {
    if (!title) return "";
    return title
      .replace(/^(Nonton|Download)\s+/i, "")
      .replace(/\s*(Sub\s*Indo|Subtitle\s*Indonesia).*$/i, "")
      .replace(/\s*:\s*Episode\s*\d+.*$/i, "")
      .replace(/\s*BD\b/gi, "")
      .replace(/\s*\(End\)/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();
  },

  extractSlug(url) {
    if (!url) return "";
    const trimmed = url.replace(/\/+$/, "").split("#")[0];
    const parts = trimmed.split("/");
    return parts[parts.length - 1] || "";
  },

  cleanImageUrl(url) {
    if (!url) return "";
    let cleaned = url.trim();
    if (/loading\.gif/i.test(cleaned)) return "";
    if (cleaned.includes("/_next/image/")) {
      const match = cleaned.match(/url=([^&]+)/);
      if (match) {
        try {
          cleaned = decodeURIComponent(match[1]);
        } catch {}
      }
    }
    if (cleaned.startsWith("//")) cleaned = `https:${cleaned}`;
    if (cleaned.startsWith("/")) cleaned = `${this.baseUrl}${cleaned}`;
    cleaned = cleaned.replace(/-\d+x\d+(?=\.[a-zA-Z]+(\?|$))/, "");
    cleaned = cleaned.replace(/\?(?:resize|w|h|fit|quality|strip)=[^&]+/gi, "");
    cleaned = cleaned.replace(/[?&]$/, "");
    return cleaned;
  },

  parseSearchHtml(html) {
    const results = [];
    const seen = new Set();
    const blocks = html.split(/<article\b/i).slice(1);

    for (const block of blocks) {
      const linkMatch =
        /<a[^>]+class=['"][^'"]*card-title[^'"]*['"][^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(block) ||
        /<h2[^>]*><a[^>]+href=['"]([^'"]*nimegami\.id\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a><\/h2>/i.exec(block) ||
        /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      const slug = this.extractSlug(href);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const title = this.cleanTitle(linkMatch[2]);
      if (!title) continue;

      const imgMatch =
        /<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(block) ||
        /<img[^>]+srcSet=['"]([^'"]+)['"]/i.exec(block);
      let rawImg = imgMatch ? imgMatch[1] : undefined;
      if (rawImg && rawImg.includes(" ")) {
        rawImg = rawImg.split(/\s+/)[0];
      }
      const coverImage = rawImg ? this.cleanImageUrl(rawImg) : undefined;

      const scoreMatch =
        /class=['"][^'"]*score-badge[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i.exec(block) ||
        /class=['"][^'"]*rating-archive[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i.exec(block);
      const scoreText = scoreMatch ? scoreMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const ratingVal = scoreText ? parseFloat(/\b(\d+(?:\.\d+)?)\b/.exec(scoreText)?.[1] || "0") : undefined;

      const epMatch =
        /class=['"][^'"]*card-last-episode[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i.exec(block) ||
        /class=['"][^'"]*eps-archive[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i.exec(block);
      let latestEpisode;
      if (epMatch) {
        const strongMatch = /<strong>([^<]+)<\/strong>/i.exec(epMatch[1]);
        latestEpisode = strongMatch ? `Episode ${strongMatch[1].trim()}` : epMatch[1].replace(/<[^>]+>/g, "").trim();
      }

      const isOngoing = /ongoing/i.test(block);
      const status = isOngoing ? "Ongoing" : "Completed";

      results.push({
        sourceId: slug,
        provider: "nimegami",
        title,
        coverImage,
        rating: ratingVal || undefined,
        latestEpisode,
        status,
        type: "TV",
      });
    }

    return results;
  },

  async getLatest(page = 1) {
    const pagePath = page > 1 ? `/page/${page}/` : "/";
    const html = await fetchHtml(`${this.baseUrl}${pagePath}`);
    return this.parseSearchHtml(html);
  },

  async getFeed() {
    const items = await this.getLatest(1);
    return {
      featured: items.slice(0, 5),
      spotlight: items.slice(0, 3),
      popular: items.slice(0, 10),
      latestEpisodes: items.slice(0, 15),
      ongoing: items.filter((i) => i.status?.toLowerCase() === "ongoing"),
      completed: items.filter((i) => i.status?.toLowerCase() === "completed"),
    };
  },

  async search(query, page = 1) {
    const pagePath = page > 1 ? `/page/${page}` : "";
    const url = `${this.baseUrl}${pagePath}/?s=${encodeURIComponent(query)}&post_type=anime`;
    const html = await fetchHtml(url);
    return this.parseSearchHtml(html);
  },

  async getDetail(slug) {
    const cleanSlug = this.extractSlug(slug);
    const detailUrl = slug.startsWith("http") ? slug : `${this.baseUrl}/${cleanSlug}/`;
    const html = await fetchHtml(detailUrl);

    const titleMatch =
      /<h1 class=['"][^'"]*entry-title[^'"]*['"][^>]*>([\s\S]*?)<\/h1>/i.exec(html) ||
      /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const title = this.cleanTitle(titleMatch ? titleMatch[1] : cleanSlug);

    const coverMatch =
      /<div class=['"][^'"]*foto_anime[^'"]*['"][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html) ||
      /<div class=['"][^'"]*entry-content[^'"]*['"][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html) ||
      /<img[^>]+class=['"][^'"]*poster-image[^'"]*['"][^>]+(?:data-src|src)=['"]([^'"]+)['"]/i.exec(html);
    const coverImage = coverMatch ? this.cleanImageUrl(coverMatch[1]) : undefined;

    let synopsis;
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 50 && !/server streaming|download aj dlu/i.test(text) && !synopsis) {
        synopsis = text;
        break;
      }
    }

    const genres = [];
    const genreRegex = /<a[^>]+href=['"][^'"]*\/genre[s]?\/[^'"]+['"][^>]*>([^<]+)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      const g = gMatch[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }
    const genreTableMatch =
      /<tr[^>]*>\s*<td[^>]*>(?:Genre|Kategori)<\/td>\s*<td[^>]*>:?\s*([\s\S]*?)<\/td>\s*<\/tr>/i.exec(html) ||
      /(?:<b>|<strong>)(?:Genre|Kategori)\s*:?\s*(?:<\/b>|<\/strong>)\s*:?\s*([^<]+)/i.exec(html);
    if (genreTableMatch) {
      const rawGenreText = genreTableMatch[1].replace(/<[^>]+>/g, "").trim();
      const splitGenres = rawGenreText.split(/[,|•\/]/).map((s) => s.trim()).filter(Boolean);
      for (const g of splitGenres) {
        if (!genres.includes(g)) genres.push(g);
      }
    }

    const isOngoing = /ongoing/i.test(html);
    const status = isOngoing ? "Ongoing" : "Completed";

    const episodes = [];
    const nextEpRegex = /<a[^>]+href=['"]#episode_(\d+)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let nepMatch;
    while ((nepMatch = nextEpRegex.exec(html)) !== null) {
      const epNum = parseInt(nepMatch[1], 10);
      const providerEpisodeUrl = `${this.baseUrl}/${cleanSlug}/#episode_${epNum}`;
      episodes.push({
        episodeNumber: epNum,
        episodeLabel: `Episode ${epNum}`,
        providerEpisodeUrl,
      });
    }

    if (episodes.length === 0) {
      const epRegex = /<li[^>]+id=['"]([^'"]*)['"][^>]*data=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/li>/gi;
      let epMatch;
      let idx = 1;
      while ((epMatch = epRegex.exec(html)) !== null) {
        const idAttr = epMatch[1];
        const dataAttr = epMatch[2];
        const text = epMatch[3].replace(/<[^>]+>/g, "").trim();
        const numMatch = /(\d+)/.exec(text) || /(\d+)/.exec(idAttr);
        const epNum = numMatch ? parseInt(numMatch[1], 10) : idx;
        const providerEpisodeUrl = `${this.baseUrl}/${cleanSlug}/#ep=${epNum}`;

        episodes.push({
          episodeNumber: epNum,
          episodeLabel: text || `Episode ${epNum}`,
          providerEpisodeUrl,
          data: dataAttr || undefined,
        });
        idx++;
      }
    }

    episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

    return {
      sourceId: cleanSlug,
      provider: "nimegami",
      title,
      synopsis,
      coverImage,
      status,
      type: "TV",
      genres,
      episodes,
    };
  },

  async getEpisodeStreams(targetUrl) {
    if (targetUrl.includes("/streaming/")) {
      const fullUrl = targetUrl.startsWith("http") ? targetUrl : `${this.baseUrl}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
      try {
        const html = await fetchHtml(fullUrl);
        const playerMatch = /<main id=['"]player['"][^>]*data-src=['"]([^'"]+)['"][^>]*data-quality=['"]([^'"]*)['"]/i.exec(html);
        if (playerMatch && playerMatch[1]) {
          const directUrl = playerMatch[1].trim();
          const q = playerMatch[2] || "720p";
          return [{
            server: `Nimegami ${q} (Direct)`,
            type: directUrl.includes(".m3u8") ? "m3u8" : "mp4",
            url: directUrl,
            quality: q,
            isEmbed: false,
            headers: { Referer: fullUrl },
          }];
        }
      } catch {}
    }

    const [animePageUrl, hash] = targetUrl.split("#");
    const epNumMatch = hash?.match(/ep(?:isode)?[=_](\d+)/i);
    const targetEpNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;

    let html = "";
    try {
      html = await fetchHtml(animePageUrl);
    } catch {
      return [];
    }

    const streams = [];
    const serverButtons = html.match(/<button[^>]+data-media-id=['"]([^'"]+)['"][^>]*aria-label=['"]([^'"]+)['"][^>]*>/gi);
    if (serverButtons && serverButtons.length > 0) {
      const slug = this.extractSlug(animePageUrl);
      for (const btn of serverButtons) {
        const idMatch = /data-media-id=['"]([^'"]+)['"]/i.exec(btn);
        const labelMatch = /aria-label=['"]([^'"]+)['"]/i.exec(btn);
        if (!idMatch) continue;
        const mediaId = idMatch[1];
        const label = labelMatch ? labelMatch[1] : "Nimegami";
        const qMatch = label.match(/\b(1080p|720p|480p|360p)\b/i);
        const quality = qMatch ? qMatch[1] : "720p";

        if (streams.length < 2) {
          const streamUrl = `${this.baseUrl}/${slug}/streaming/${targetEpNum}/${quality}/${mediaId}/`;
          try {
            const streamHtml = await fetchHtml(streamUrl);
            const playerMatch = /<main id=['"]player['"][^>]*data-src=['"]([^'"]+)['"]/i.exec(streamHtml);
            if (playerMatch && playerMatch[1]) {
              streams.push({
                server: `Nimegami ${label} (Direct)`,
                type: playerMatch[1].includes(".m3u8") ? "m3u8" : "mp4",
                url: playerMatch[1].trim(),
                quality,
                isEmbed: false,
                headers: { Referer: streamUrl },
              });
              continue;
            }
          } catch {}
        }

        streams.push({
          server: `Nimegami ${label} (Player)`,
          type: "embed",
          url: `${this.baseUrl}/${slug}/streaming/${targetEpNum}/${quality}/${mediaId}/`,
          quality,
          isEmbed: true,
          headers: { Referer: animePageUrl },
        });
      }
    }

    if (streams.length === 0) {
      const epRegex = /<li[^>]+id=['"]([^'"]*)['"][^>]*data=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/li>/gi;
      let epMatch;
      let base64Data;
      let idx = 1;
      while ((epMatch = epRegex.exec(html)) !== null) {
        const idAttr = epMatch[1];
        const dataAttr = epMatch[2];
        const numMatch = /(\d+)/.exec(epMatch[3]) || /(\d+)/.exec(idAttr);
        const currentNum = numMatch ? parseInt(numMatch[1], 10) : idx;
        if (dataAttr && (targetEpNum === null || currentNum === targetEpNum)) {
          base64Data = dataAttr;
          break;
        }
        idx++;
      }

      if (base64Data) {
        try {
          const decoded = atob(base64Data);
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const format = item.format || "720p";
              const urls = Array.isArray(item.url) ? item.url : [];
              for (const u of urls) {
                if (!u || typeof u !== "string") continue;
                const isEmbed = !u.includes(".mp4") && !u.includes(".m3u8");
                streams.push({
                  server: isEmbed ? `Nimegami ${format} (Embed)` : `Nimegami ${format} (Direct)`,
                  type: isEmbed ? "embed" : (u.includes(".m3u8") ? "m3u8" : "mp4"),
                  url: u.trim(),
                  quality: format,
                  isEmbed,
                  headers: { Referer: "https://nimegami.id/" },
                });
              }
            }
          }
        } catch {}
      }
    }

    return streams;
  },
};

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
      name: "DeiManga REST API (Manga & Anime)",
      platform: "Vercel Edge (Singapore)",
      status: "operational",
      uptime: "healthy",
      manga_providers: ["komikindo", "bacakomik", "komiku"],
      anime_providers: ["samehadaku", "otakudesu", "animeindo", "kuramanime", "nimegami"],
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
        "/api/anime/:provider/search?q=:query",
        "/api/anime/:provider/latest?page=:page",
        "/api/anime/:provider/detail/:slug",
        "/api/anime/:provider/episode/:slug",
        "/api/anime/:provider/feed",
        "/:provider/* (Raw Proxy)",
      ],
      timestamp: new Date().toISOString(),
    });
  }

  // ==========================================================================
  // ANIME API ROUTES (/api/anime/:provider/...)
  // ==========================================================================
  if (path.startsWith("/api/anime/")) {
    const getAnimeProvider = (name) => {
      switch (name?.toLowerCase()) {
        case "samehadaku": return SamehadakuAnime;
        case "otakudesu": return OtakudesuAnime;
        case "animeindo": return AnimeIndoAnime;
        case "kuramanime": return KuramanimeAnime;
        case "nimegami": return NimegamiAnime;
        default: return null;
      }
    };

    // A1. Anime Latest -> /api/anime/:provider/latest?page=1
    const animeLatestMatch = /^\/api\/anime\/([^\/]+)\/latest$/i.exec(path);
    if (animeLatestMatch) {
      const providerName = animeLatestMatch[1];
      const provider = getAnimeProvider(providerName);
      if (!provider) return jsonResponse({ error: "Invalid anime provider" }, 400);

      const cacheKey = `anime:latest:${providerName}:${page}`;
      const cached = getCached(cacheKey);
      if (cached) return jsonResponse(cached);

      try {
        const items = await provider.getLatest(page);
        const result = { status: "success", provider: providerName, page, total: items.length, items };
        setCached(cacheKey, result, 300);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    // A2. Anime Feed -> /api/anime/:provider/feed
    const animeFeedMatch = /^\/api\/anime\/([^\/]+)\/feed$/i.exec(path);
    if (animeFeedMatch) {
      const providerName = animeFeedMatch[1];
      const provider = getAnimeProvider(providerName);
      if (!provider) return jsonResponse({ error: "Invalid anime provider" }, 400);

      const cacheKey = `anime:feed:${providerName}`;
      const cached = getCached(cacheKey);
      if (cached) return jsonResponse(cached);

      try {
        const feed = await provider.getFeed();
        const result = { status: "success", provider: providerName, ...feed };
        setCached(cacheKey, result, 300);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    // A3. Anime Search -> /api/anime/:provider/search?q=...
    const animeSearchMatch = /^\/api\/anime\/([^\/]+)\/search$/i.exec(path);
    if (animeSearchMatch) {
      const providerName = animeSearchMatch[1];
      const provider = getAnimeProvider(providerName);
      if (!provider) return jsonResponse({ error: "Invalid anime provider" }, 400);

      const q = url.searchParams.get("q") || "";
      if (!q) return jsonResponse({ items: [], total: 0 });

      const cacheKey = `anime:search:${providerName}:${q.toLowerCase()}`;
      const cached = getCached(cacheKey);
      if (cached) return jsonResponse(cached);

      try {
        const items = await provider.search(q, page);
        const result = { status: "success", provider: providerName, total: items.length, items };
        setCached(cacheKey, result, 600);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    // A4. Anime Detail -> /api/anime/:provider/detail/:slug
    const animeDetailMatch = /^\/api\/anime\/([^\/]+)\/detail\/?(.*)$/i.exec(path);
    if (animeDetailMatch) {
      const providerName = animeDetailMatch[1];
      let slug = animeDetailMatch[2] ? decodeURIComponent(animeDetailMatch[2]) : "";
      if (slug.toLowerCase().startsWith(`${providerName.toLowerCase()}:`)) {
        slug = slug.slice(providerName.length + 1);
      }
      slug = slug.replace(/^[a-z0-9_-]+:/i, "").replace(/^\/+|\/+$/g, "");
      const provider = getAnimeProvider(providerName);
      if (!provider) return jsonResponse({ error: "Invalid anime provider" }, 400);

      const cacheKey = `anime:detail:${providerName}:${slug}`;
      const cached = getCached(cacheKey);
      if (cached && !url.searchParams.get("refresh")) return jsonResponse(cached);

      try {
        const data = await provider.getDetail(slug);
        const result = { status: "success", provider: providerName, data };
        if (data && data.episodes && data.episodes.length > 0) {
          setCached(cacheKey, result, 1800);
        }
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    // A5. Anime Episode Streams -> /api/anime/:provider/episode/:slug (or ?url=...)
    const animeEpisodeMatch = /^\/api\/anime\/([^\/]+)\/episode\/?(.*)$/i.exec(path);
    if (animeEpisodeMatch) {
      const providerName = animeEpisodeMatch[1];
      let slug = animeEpisodeMatch[2] ? decodeURIComponent(animeEpisodeMatch[2]) : "";
      const targetUrl = url.searchParams.get("url") || "";
      const episodeTarget = targetUrl || slug;
      if (!episodeTarget) return jsonResponse({ error: "Missing episode slug or url" }, 400);

      const provider = getAnimeProvider(providerName);
      if (!provider) return jsonResponse({ error: "Invalid anime provider" }, 400);

      const cacheKey = `anime:episode:${providerName}:${episodeTarget}`;
      const isRefresh = url.searchParams.get("refresh") === "1";
      if (!isRefresh) {
        const cached = getCached(cacheKey);
        if (cached && Array.isArray(cached.streams) && cached.streams.length > 0) {
          return jsonResponse(cached);
        }
      }

      try {
        const streams = await provider.getEpisodeStreams(episodeTarget);
        const result = {
          status: "success",
          provider: providerName,
          episode: episodeTarget,
          total: streams.length,
          streams,
        };
        if (streams.length > 0) {
          setCached(cacheKey, result, 1800);
        }
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    // A6. Anime Schedule -> /api/anime/schedule
    if (path === "/api/anime/schedule") {
      const cacheKey = "anime:schedule:v5";
      const cached = getCached(cacheKey);
      if (cached) return jsonResponse(cached);

      const schedule = {
        senin: [],
        selasa: [],
        rabu: [],
        kamis: [],
        jumat: [],
        sabtu: [],
        minggu: [],
        random: [],
      };

      try {
        const [otakuRes, ongoingP1, ongoingP2, ongoingP3] = await Promise.allSettled([
          fetchHtml("https://otakudesu.blog/jadwal-rilis/"),
          fetchHtml("https://otakudesu.blog/ongoing-anime/"),
          fetchHtml("https://otakudesu.blog/ongoing-anime/page/2/"),
          fetchHtml("https://otakudesu.blog/ongoing-anime/page/3/"),
        ]);

        const otakuHtml = otakuRes.status === "fulfilled" ? otakuRes.value : "";
        const ongoingCovers = new Map();

        for (const p of [ongoingP1, ongoingP2, ongoingP3]) {
          if (p.status !== "fulfilled" || !p.value) continue;
          const html = p.value;
          const venzStart = html.indexOf('class="venz"');
          if (venzStart === -1) continue;
          const venzEnd = html.indexOf("</div>", venzStart + 25000);
          const venzHtml = html.slice(venzStart, venzEnd !== -1 ? venzEnd : undefined);
          const lis = venzHtml.split("<li").slice(1);

          for (const li of lis) {
            const hrefMatch = /href=["']([^"']*\/anime\/[^"']+)["']/i.exec(li);
            const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(li);
            const titleMatch = /<h2[^>]*class=["']jdlflm["'][^>]*>([\s\S]*?)<\/h2>/i.exec(li);
            const epsMatch = /<div[^>]*class=["']epz["'][^>]*>([\s\S]*?)<\/div>/i.exec(li);

            if (hrefMatch) {
              const href = hrefMatch[1];
              const slugMatch = href.match(/\/anime\/([^/]+)/);
              const slug = slugMatch ? slugMatch[1] : parseSlug(href);
              const img = imgMatch ? sanitizeCover(imgMatch[1]) || imgMatch[1] : "";
              const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
              const eps = epsMatch ? epsMatch[1].replace(/<[^>]+>/g, "").trim() : "";

              if (slug && img) {
                ongoingCovers.set(slug, { cover: img, eps });
                const norm = title.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (norm) ongoingCovers.set(norm, { cover: img, eps });
              }
            }
          }
        }

        if (otakuHtml) {
          const kgBlocks = otakuHtml.split(/<div class=['"]kglist321['"][^>]*>/i).slice(1);
          for (const block of kgBlocks) {
            const h2Match = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
            if (!h2Match) continue;
            const rawDay = h2Match[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
            const targetDay = schedule[rawDay] ? rawDay : "random";

            const aRegex = /<a[^>]+href=['"]([^'"]*\/anime\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
            let m;
            while ((m = aRegex.exec(block)) !== null) {
              const href = m[1];
              const title = m[2].replace(/<[^>]+>/g, "").trim();
              const slugMatch = href.match(/\/anime\/([^/]+)/);
              const sourceId = slugMatch ? slugMatch[1] : parseSlug(href);

              if (title && sourceId) {
                // Filter out completed / batch entries
                if (
                  /\b(?:tamat|completed|batch)\b/i.test(title) ||
                  /(?:-|^)(?:tamat|completed|batch)(?:-|$)/i.test(sourceId)
                ) {
                  continue;
                }

                const norm = title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const matchedCover = ongoingCovers.get(sourceId) || ongoingCovers.get(norm);

                schedule[targetDay].push({
                  id: sourceId,
                  sourceId,
                  title,
                  day: targetDay,
                  dayLabel: targetDay.charAt(0).toUpperCase() + targetDay.slice(1),
                  provider: "otakudesu",
                  coverImage: matchedCover?.cover || undefined,
                  latestEpisode: matchedCover?.eps || undefined,
                });
              }
            }
          }
        }

        const dayIndexMap = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
        const wibDate = new Date(Date.now() + 7 * 60 * 60 * 1000);
        const today = dayIndexMap[wibDate.getUTCDay()];

        let total = 0;
        for (const day of Object.keys(schedule)) {
          total += schedule[day].length;
        }

        const result = {
          status: "success",
          today,
          total,
          schedule,
        };

        setCached(cacheKey, result, 1800);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ status: "error", message: err.message }, 502);
      }
    }

    return jsonResponse({ error: "Anime endpoint not found" }, 404);
  }

  // ==========================================================================
  // MANGA API ROUTES (/api/:provider/...)
  // ==========================================================================
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
