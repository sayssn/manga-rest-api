import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  cacheHeadersFor,
  jsonResponse,
  fetchHtml,
  inFlightHtml,
  htmlCache,
} from "../api/index.js";

test("each route class maps to its header", () => {
  // Feed / Latest / Manhwa / Manhua -> public, s-maxage=300, stale-while-revalidate=1800
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/latest"),
    "public, s-maxage=300, stale-while-revalidate=1800"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/otakudesu/latest"),
    "public, s-maxage=300, stale-while-revalidate=1800"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/animeindo/feed"),
    "public, s-maxage=300, stale-while-revalidate=1800"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/bacakomik/manhwa"),
    "public, s-maxage=300, stale-while-revalidate=1800"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/komiku/manhua"),
    "public, s-maxage=300, stale-while-revalidate=1800"
  );

  // Search / Catalog / Genres -> public, s-maxage=600, stale-while-revalidate=3600
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/search"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/catalog"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/otakudesu/catalog"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/search"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/genres"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/genres/action"),
    "public, s-maxage=600, stale-while-revalidate=3600"
  );

  // Detail / Manga / Chapters -> public, s-maxage=1800, stale-while-revalidate=86400
  assert.strictEqual(
    cacheHeadersFor("/api/anime/otakudesu/detail/naruto"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/manga/solo-leveling"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/chapters/solo-leveling"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );
  assert.strictEqual(
    cacheHeadersFor("/api/anime/schedule"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );

  // Episode -> public, s-maxage=900, stale-while-revalidate=3600
  assert.strictEqual(
    cacheHeadersFor("/api/anime/otakudesu/episode/naruto-1"),
    "public, s-maxage=900, stale-while-revalidate=3600"
  );

  // Chapter Pages -> public, s-maxage=86400, stale-while-revalidate=604800
  assert.strictEqual(
    cacheHeadersFor("/api/komikindo/chapter/solo-leveling-chapter-1"),
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );
});

test("memory cache hit still carries the header", async (t) => {
  // Test jsonResponse directly with path
  const directRes = jsonResponse({ test: true }, 200, {}, "/api/anime/otakudesu/detail/naruto");
  assert.strictEqual(
    directRes.headers.get("Cache-Control"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );

  // Mock OtakudesuAnime.getDetail by mocking globalThis.fetch
  const origFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = origFetch; });

  const mockDetailHtml = `
    <html>
      <body>
        <div class="fotoanime"><img src="https://img.example.com/cover.jpg"/></div>
        <div class="infozin"><div class="infoz"><p>Judul: Naruto</p></div></div>
        <div class="episodelst">
          <ul class="episodelst">
            <li><span><a href="https://otakudesu.cloud/episode/naruto-1">Episode 1</a></span></li>
          </ul>
        </div>
      </body>
    </html>
  `;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => mockDetailHtml,
    headers: new Headers({ "content-type": "text/html" }),
  });

  const req1 = new Request("https://api.example.com/api/anime/otakudesu/detail/naruto-cache-test");
  const res1 = await handler(req1);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(
    res1.headers.get("Cache-Control"),
    "public, s-maxage=1800, stale-while-revalidate=86400"
  );

  // Second call must hit memory cache (line ~3038) and STILL carry the Cache-Control header
  const req2 = new Request("https://api.example.com/api/anime/otakudesu/detail/naruto-cache-test");
  const res2 = await handler(req2);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(
    res2.headers.get("Cache-Control"),
    "public, s-maxage=1800, stale-while-revalidate=86400",
    "Memory cache hit at line ~3038 must carry the Cache-Control header"
  );
});

test("refresh=1 is no-store", async () => {
  assert.strictEqual(cacheHeadersFor("/api/komikindo/latest", true), "no-store");
  assert.strictEqual(cacheHeadersFor("/api/komikindo/latest", "1"), "no-store");
  assert.strictEqual(cacheHeadersFor("/api/komikindo/latest?refresh=1"), "no-store");

  const res = jsonResponse({ status: "ok" }, 200, {}, "/api/komikindo/latest", true);
  assert.strictEqual(res.headers.get("Cache-Control"), "no-store");

  const req = new Request("https://api.example.com/api/komikindo/genres?refresh=1");
  const handlerRes = await handler(req);
  assert.strictEqual(handlerRes.headers.get("Cache-Control"), "no-store");
});

test("novel route uses req not request", async (t) => {
  const origFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = origFetch; });

  let fetchHeaders = null;
  globalThis.fetch = async (url, options) => {
    fetchHeaders = options?.headers;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "cache-control": "public, max-age=300" }),
      json: async () => ({ status: "success", novels: [] }),
    };
  };

  const req = new Request("https://api.example.com/api/novel/sakuranovel/latest", {
    headers: { "user-agent": "DeiManga-Novel-Test-UA" },
  });

  const res = await handler(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, "success");
  assert.strictEqual(fetchHeaders?.["User-Agent"], "DeiManga-Novel-Test-UA");
});

test("fetchHtml aborts after 8000ms", async (t) => {
  const origFetch = globalThis.fetch;
  const origTimeout = AbortSignal.timeout;
  t.after(() => {
    globalThis.fetch = origFetch;
    AbortSignal.timeout = origTimeout;
  });

  let timeoutSet = null;
  AbortSignal.timeout = (ms) => {
    timeoutSet = ms;
    // Return a short 50ms timeout for the test to avoid hanging for 8s
    return origTimeout(50);
  };

  globalThis.fetch = async (url, options) => {
    return new Promise((_, reject) => {
      // Keep event loop active until abort signal fires
      const keepAlive = setTimeout(() => {}, 5000);
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          const err = new Error("The operation was aborted");
          err.name = "TimeoutError";
          reject(err);
        });
      }
    });
  };

  await assert.rejects(
    fetchHtml("https://slow.example.com/hang"),
    (err) => err.name === "TimeoutError"
  );
  assert.strictEqual(timeoutSet, 8000, "fetchHtml must configure AbortSignal.timeout(8000)");
});

test("fetchHtml in-flight deduplication and 60s memoization", async (t) => {
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = origFetch;
    inFlightHtml.clear();
    htmlCache.clear();
  });

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 20));
    return {
      ok: true,
      status: 200,
      text: async () => "<html>deduped</html>",
    };
  };

  // Launch 3 concurrent fetches for the same URL
  const testUrl = "https://example.com/manga/concurrent-test";
  const [res1, res2, res3] = await Promise.all([
    fetchHtml(testUrl),
    fetchHtml(testUrl),
    fetchHtml(testUrl),
  ]);

  assert.strictEqual(res1, "<html>deduped</html>");
  assert.strictEqual(res2, "<html>deduped</html>");
  assert.strictEqual(res3, "<html>deduped</html>");
  assert.strictEqual(fetchCount, 1, "fetchHtml must deduplicate concurrent in-flight requests");

  // Subsequent call within 60s must use cached HTML without calling fetch again
  const resCached = await fetchHtml(testUrl);
  assert.strictEqual(resCached, "<html>deduped</html>");
  assert.strictEqual(fetchCount, 1, "fetchHtml must serve from 60s cache");
});
