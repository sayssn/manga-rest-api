import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Kuramanime provider is recognized by anime feed handler", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/kuramanime/feed");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.equal(data.provider, "kuramanime");
  assert.ok(Array.isArray(data.latestEpisodes));
  assert.ok(data.latestEpisodes.length > 0);
});

test("Kuramanime search returns results", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/kuramanime/search?q=naruto");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.equal(data.provider, "kuramanime");
  assert.ok(Array.isArray(data.items));
});

