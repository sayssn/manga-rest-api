import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Nimegami provider is recognized by anime feed handler", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/nimegami/feed");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.equal(data.provider, "nimegami");
  assert.ok(Array.isArray(data.latestEpisodes));
  assert.ok(data.latestEpisodes.length > 0);
});

test("Nimegami search returns results", async () => {
  const req = new Request("https://deimanga-rest-api.vercel.app/api/anime/nimegami/search?q=one+piece");
  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "success");
  assert.equal(data.provider, "nimegami");
  assert.ok(Array.isArray(data.items));
});

