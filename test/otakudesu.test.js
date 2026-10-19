import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Otakudesu episode stream: resolves streams for Fuufu Ijou Ep 1 URL", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/otakudesu/episode?refresh=1&url=" + encodeURIComponent("https://otakudesu.blog/episode/fikm-episode-1-sub-indo/"));
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.ok(Array.isArray(data.streams));
  assert.ok(data.streams.length > 0, "Expected at least 1 stream source, got 0");
  assert.ok(data.streams.some((s) => s.url && (s.url.includes("moedesu") || s.url.includes("googlevideo") || s.type === "embed" || s.type === "mp4")));
});

test("Otakudesu episode stream: resolves streams for slug fikm-episode-1-sub-indo", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/otakudesu/episode/fikm-episode-1-sub-indo?refresh=1");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.ok(Array.isArray(data.streams));
  assert.ok(data.streams.length > 0, "Expected at least 1 stream source, got 0");
});

test("Otakudesu episode stream: resolves streams for composite id otakudesu:fufu-ijo-sub-indo:1", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/otakudesu/episode/otakudesu:fufu-ijo-sub-indo:1?refresh=1");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.ok(Array.isArray(data.streams));
  assert.ok(data.streams.length > 0, "Expected at least 1 stream source, got 0");
});
