import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Airing Schedule: live scraping ongoing-anime produces valid ongoing items with 100% covers", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/schedule?refresh=1");
  const res = await handler(req);
  assert.equal(res.status, 200);

  const cacheHeader = res.headers.get("Cache-Control") || "";
  assert.ok(
    cacheHeader.includes("s-maxage=1800") || cacheHeader.includes("max-age"),
    `Expected edge cache header on schedule response, got: ${cacheHeader}`
  );

  const data = await res.json();
  assert.equal(data.status, "success");
  assert.ok(data.total >= 40, `Expected at least 40 airing anime, got ${data.total}`);

  const days = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
  const allIds = [];
  for (const day of days) {
    const list = data.schedule[day] || [];
    assert.ok(list.length > 0, `Expected items for ${day}, got 0`);

    for (const item of list) {
      allIds.push(item.id || item.sourceId);
      assert.ok(item.title, "Expected anime title to be defined");
      assert.ok(
        item.coverImage && item.coverImage.startsWith("http"),
        `Expected valid coverImage for ${item.title}, got ${item.coverImage}`
      );
      assert.ok(
        !/\b(?:end|tamat)\b/i.test(item.latestEpisode || "") && !/\b(?:end|tamat)\b/i.test(item.title),
        `Expected active ongoing item, but ${item.title} has ended marker: ${item.latestEpisode}`
      );
    }
  }

  // Verify ended / completed anime from past seasons are completely filtered out
  const excludedSubstrings = ["clevatess", "grand-blue", "buchigire", "katainaka"];
  for (const sub of excludedSubstrings) {
    const found = allIds.find(id => id.includes(sub));
    assert.ok(!found, `Expected concluded anime containing '${sub}' to be excluded from schedule, but found '${found}'`);
  }
});
