import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Otakudesu detail: accurately identifies completed anime from (End) in episode title", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/otakudesu/detail/buchigire-reijou-chikaimashita-sub-indo?refresh=1");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.ok(data.data, "Expected data payload");
  assert.equal(
    data.data.status,
    "Completed",
    `Expected status to be Completed for ended series, but got ${data.data.status}`
  );
  assert.ok(data.data.episodes.length > 0, "Expected episodes to be loaded");
  assert.ok(
    data.data.episodes.some((e) => e.isEnded || /\b(?:end|tamat)\b/i.test(e.episodeLabel || e.rawTitle || "")),
    "Expected at least one episode to be marked as end/tamat"
  );
});

test("Otakudesu detail: accurately identifies Katainaka no Ossan S2 as completed", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/otakudesu/detail/katainaka-ossan-kensei-naru-s2-sub-indo?refresh=1");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.equal(
    data.data.status,
    "Completed",
    `Expected status to be Completed for ended series, but got ${data.data.status}`
  );
});
